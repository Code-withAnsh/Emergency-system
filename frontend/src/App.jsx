import { useState, useEffect, useRef } from 'react';
import { SSEClient } from './lib/sse.js';
import Map from './components/Map.jsx';
import Controls from './components/Controls.jsx';
import ReasonCard from './components/ReasonCard.jsx';

export default function App() {
  const [units, setUnits] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    ambulances: 0,
    bikes: 0,
    free: 0,
    busy: 0,
    stale: 0,
    label: '60 simulated units'
  });
  const [spikeZone, setSpikeZone] = useState({ active: false, remainingSeconds: 0 });
  const [queue, setQueue] = useState([]);
  const [activeRequest, setActiveRequest] = useState(null);
  const [recentRequests, setRecentRequests] = useState([]);
  const [sseStatus, setSseStatus] = useState('connecting');
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showBenchmarkModal, setShowBenchmarkModal] = useState(false);
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  const sseRef = useRef(null);

  // Initial fetch of recent requests and queue
  useEffect(() => {
    fetch('/api/requests')
      .then((res) => res.json())
      .then((data) => {
        if (data.requests && data.requests.length > 0) {
          setRecentRequests(data.requests);
          setActiveRequest(data.requests[0]);
        }
      })
      .catch((err) => console.error('[API] Failed to fetch requests:', err));

    fetch('/api/queue')
      .then((res) => res.json())
      .then((data) => {
        if (data.queue) {
          setQueue(data.queue);
        }
      })
      .catch((err) => console.error('[API] Failed to fetch queue:', err));
  }, []);

  // Setup SSE stream
  useEffect(() => {
    const client = new SSEClient('/api/events');
    sseRef.current = client;

    client.onStatusChange((status) => {
      setSseStatus(status);
    });

    client.on('connected', (data) => {
      console.log('[SSE] Connected to dispatch stream:', data);
    });

    client.on('fleet', (payload) => {
      if (payload?.units) {
        setUnits(payload.units);
      }
      if (payload?.summary) {
        setSummary(payload.summary);
      }
      if (payload?.spikeZone) {
        setSpikeZone(payload.spikeZone);
      }
      if (payload?.queue) {
        setQueue(payload.queue);
      }
      setLastUpdate(new Date().toLocaleTimeString());
    });

    client.on('request_created', (data) => {
      if (data?.request) {
        setActiveRequest(data.request);
        setRecentRequests((prev) => [data.request, ...prev.slice(0, 9)]);
      }
    });

    client.on('request_assigned', (data) => {
      if (data?.request) {
        setActiveRequest(data.request);
        setRecentRequests((prev) => [data.request, ...prev.filter((r) => r.id !== data.request.id).slice(0, 8)]);
      }
    });

    client.on('queue_updated', (data) => {
      if (data?.queue) {
        setQueue(data.queue);
      }
    });

    client.on('spike_activated', (data) => {
      if (data?.spikeZone) {
        setSpikeZone(data.spikeZone);
      }
    });

    client.on('spike_expired', () => {
      setSpikeZone({ active: false, remainingSeconds: 0 });
    });

    client.on('requests_reranked', () => {
      fetch('/api/requests')
        .then((res) => res.json())
        .then((data) => {
          if (data.requests && data.requests.length > 0) {
            setRecentRequests(data.requests);
            setActiveRequest(data.requests[0]);
          }
        })
        .catch((err) => console.error('[API] Error refreshing re-ranked requests:', err));
    });

    client.connect();

    return () => {
      client.close();
    };
  }, []);

  // Hospital Choice Handler (Phase 4b)
  const handleHospitalChoice = async (preference) => {
    if (!activeRequest?.id) return;
    try {
      const res = await fetch(`/api/requests/${activeRequest.id}/hospital`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preference })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.request) {
          setActiveRequest(data.request);
        }
      }
    } catch (err) {
      console.error('[Hospital Choice Error]:', err);
    }
  };

  // Trigger Drill Request
  const handleTriggerRequest = async (severity = 'critical', customCoords = null) => {
    setActionLoading(true);
    try {
      // Central Bhopal coordinates with natural variance if customCoords not passed
      const jitterLat = (Math.random() - 0.5) * 0.04;
      const jitterLng = (Math.random() - 0.5) * 0.04;

      const lat = customCoords?.lat ?? Number((23.2599 + jitterLat).toFixed(6));
      const lng = customCoords?.lng ?? Number((77.4126 + jitterLng).toFixed(6));

      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, severity })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setActiveRequest(data.request);
      setRecentRequests((prev) => [data.request, ...prev.slice(0, 9)]);
      if (data.ranking?.chosen?.id) {
        setSelectedUnitId(data.ranking.chosen.id);
      }
    } catch (err) {
      console.error('[Request Error]:', err.message);
      alert(`Drill Request Failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Trigger Demand Spike
  const handleTriggerSpike = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/spike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.spikeZone) {
        setSpikeZone(data.spikeZone);
      }
    } catch (err) {
      console.error('[Spike Error]:', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Fetch and display 1000 incident benchmark
  const handleShowBenchmark = async () => {
    setShowBenchmarkModal(true);
    if (!benchmarkData) {
      setBenchmarkLoading(true);
      try {
        const res = await fetch('/api/benchmark/comparison');
        const data = await res.json();
        setBenchmarkData(data);
      } catch (err) {
        console.error('[Benchmark Error]:', err);
      } finally {
        setBenchmarkLoading(false);
      }
    }
  };

  const selectedUnit = units.find((u) => u.id === selectedUnitId);

  return (
    <div className="app-layout">
      {/* Mandatory Disclaimer */}
      <header className="disclaimer-banner">
        PROTOTYPE / DRILL — NOT CONNECTED TO REAL EMERGENCY SERVICES — FOR HACKATHON DEMO ONLY
      </header>

      {/* Operations Navbar */}
      <nav className="top-navbar">
        <div className="brand-section">
          <div>
            <div className="brand-title">
              <span>🚨</span>
              <span>HackWave Dispatch Operations</span>
            </div>
            <div className="brand-subtitle">
              Civic Real-Time Fleet Allocation Engine • Bhopal Central Area (13km × 13km)
            </div>
          </div>
        </div>

        {/* Live Metrics Strip */}
        <div className="metrics-strip">
          <div className="metric-badge">
            <span
              className={`metric-dot ${sseStatus === 'connected' ? 'emerald live-pulse' : 'amber'}`}
            />
            <span>{sseStatus === 'connected' ? 'SSE LIVE (1Hz)' : sseStatus.toUpperCase()}</span>
          </div>

          <div className="metric-badge">
            <span className="metric-dot cyan" />
            <span>{summary.ambulances} Ambulances (40km/h)</span>
          </div>

          <div className="metric-badge">
            <span className="metric-dot emerald" />
            <span>{summary.bikes} First Responder Bikes (25km/h)</span>
          </div>

          <div className="metric-badge">
            <span className="metric-dot amber" />
            <span>{summary.stale} Stale GPS (&gt;20s)</span>
          </div>

          <div className="metric-badge">
            <span className="metric-dot rose" />
            <span>{summary.busy} Busy</span>
          </div>
        </div>
      </nav>

      {/* Main Workspace Layout */}
      <main className="main-content">
        {/* Left Column: Interactive Map & Reason Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Reason Card for Active Incident */}
          {activeRequest && (
            <ReasonCard
              activeRequest={activeRequest}
              onClose={() => setActiveRequest(null)}
              onHospitalChoice={handleHospitalChoice}
            />
          )}

          {/* Interactive Map */}
          <div className="map-card-wrapper">
            <Map
              units={units}
              selectedUnitId={selectedUnitId}
              onSelectUnit={(unit) => setSelectedUnitId(unit.id === selectedUnitId ? null : unit.id)}
              activeRequest={activeRequest}
              spikeZone={spikeZone}
              onMapClick={(coords) => handleTriggerRequest('critical', coords)}
            />
          </div>
        </div>

        {/* Right Column: Controls, Telemetry & Fleet Status */}
        <aside className="sidebar-column">
          {/* Dispatch Command Controls */}
          <Controls
            onTriggerRequest={handleTriggerRequest}
            onTriggerSpike={handleTriggerSpike}
            spikeZone={spikeZone}
            loading={actionLoading}
            onShowBenchmark={handleShowBenchmark}
          />

          {/* Active Unit Focus */}
          <section className="sidebar-panel">
            <div className="panel-title">
              <span>Unit Telemetry Inspector</span>
              {selectedUnitId && (
                <button
                  type="button"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                  onClick={() => setSelectedUnitId(null)}
                >
                  Clear
                </button>
              )}
            </div>

            {selectedUnit ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                    {selectedUnit.id}
                  </span>
                  <span
                    style={{
                      background: selectedUnit.status === 'free' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                      color: selectedUnit.status === 'free' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 600,
                      fontSize: '0.75rem'
                    }}
                  >
                    {selectedUnit.status.toUpperCase()}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>Vehicle Type:</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>
                    {selectedUnit.type === 'ambulance' ? 'Ambulance' : 'First Responder Bike'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>Speed Rating:</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{selectedUnit.speed} km/h</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>GPS Freshness:</span>
                  <span style={{ color: selectedUnit.isStale ? 'var(--accent-amber)' : 'var(--accent-emerald)', fontWeight: 600 }}>
                    {selectedUnit.gpsAge}s ({selectedUnit.isStale ? 'STALE >20s' : 'FRESH'})
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>Current Coordinates:</span>
                  <span className="font-mono" style={{ color: '#fff', fontSize: '0.8rem' }}>
                    {selectedUnit.lat.toFixed(5)}°N, {selectedUnit.lng.toFixed(5)}°E
                  </span>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontStyle: 'italic' }}>
                Click any unit marker on the Bhopal map to inspect live telemetry.
              </p>
            )}
          </section>

          {/* Quick Fleet Roster */}
          <section className="sidebar-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-title">
              <span>Live Fleet Roster ({units.length})</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {lastUpdate ? `Updated ${lastUpdate}` : 'Awaiting SSE...'}
              </span>
            </div>

            <div className="unit-list-scroll">
              {units.map((u) => {
                const isSelected = selectedUnitId === u.id;
                const isAssigned = activeRequest?.ranking?.chosen?.id === u.id;
                return (
                  <div
                    key={u.id}
                    className={`unit-item-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedUnitId(u.id)}
                  >
                    <div className="unit-item-info">
                      <span>{u.type === 'ambulance' ? '🚑' : '🏍️'}</span>
                      <span style={{ fontWeight: 600 }}>
                        {u.id} {isAssigned && '⭐ (ASSIGNED)'}
                      </span>
                    </div>

                    <div className="unit-item-status">
                      <span style={{ color: u.isStale ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
                        {u.gpsAge}s
                      </span>
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: u.status === 'free' ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Priority Request Queue Panel */}
          {queue.length > 0 && (
            <section className="sidebar-panel" id="queue-panel">
              <div className="panel-title">
                <span>⏳ Priority Queue ({queue.length})</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--accent-amber)', fontWeight: 700 }}>
                  CRITICAL FIRST
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {queue.map((req) => (
                  <div
                    key={req.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: req.severity === 'critical'
                        ? 'rgba(244, 63, 94, 0.1)'
                        : 'rgba(245, 158, 11, 0.08)',
                      border: `1px solid ${req.severity === 'critical' ? 'rgba(244,63,94,0.3)' : 'rgba(245,158,11,0.2)'}`,
                      cursor: 'pointer'
                    }}
                    onClick={() => setActiveRequest(req)}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>#{req.queuePosition} — {req.id}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {req.severity.toUpperCase()} • {req.lat?.toFixed(3)}°N, {req.lng?.toFixed(3)}°E
                      </span>
                    </div>
                    <span style={{
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      background: req.severity === 'critical' ? 'rgba(244,63,94,0.25)' : 'rgba(245,158,11,0.2)',
                      color: req.severity === 'critical' ? 'var(--accent-rose)' : 'var(--accent-amber)'
                    }}>
                      WAITING
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </main>

      {/* 1000 Incident Benchmark Modal */}
      {showBenchmarkModal && (
        <div className="modal-backdrop" onClick={() => setShowBenchmarkModal(false)}>
          <div className="benchmark-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="benchmark-modal-header">
              <h2 style={{ fontSize: '1.2rem', color: '#fff' }}>
                📊 Empirical Proof: 1000 Simulated Incidents Comparison
              </h2>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowBenchmarkModal(false)}
              >
                ✕
              </button>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Comparison executed on 60 moving units inside the Bhopal operations area comparing standard Naive Nearest-Unit assignment vs HackWave Multi-Criteria AI Ranking.
            </p>

            {benchmarkLoading && (
              <p style={{ color: 'var(--accent-cyan)', margin: '20px 0' }}>
                Executing 1000 incident simulation benchmark...
              </p>
            )}

            {benchmarkData && (
              <div>
                <div className="benchmark-metric-cards">
                  <div className="benchmark-card">
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      NAIVE NEAREST STRATEGY
                    </span>
                    <h3 style={{ fontSize: '1.4rem', color: '#f87171', margin: '6px 0' }}>
                      {benchmarkData.naiveStrategy.lateArrivals} Late Arrivals
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {benchmarkData.naiveStrategy.latePercentage}% SLA failures • Avg ETA: {benchmarkData.naiveStrategy.averageActualEtaMinutes}m
                    </p>
                  </div>

                  <div className="benchmark-card winner">
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)' }}>
                      HACKWAVE MULTI-CRITERIA RANKING
                    </span>
                    <h3 style={{ fontSize: '1.4rem', color: '#34d399', margin: '6px 0' }}>
                      {benchmarkData.hackwaveRanking.lateArrivals} Late Arrivals
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {benchmarkData.hackwaveRanking.latePercentage}% SLA failures • Avg ETA: {benchmarkData.hackwaveRanking.averageActualEtaMinutes}m
                    </p>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '8px',
                  padding: '12px',
                  margin: '12px 0',
                  fontSize: '0.88rem'
                }}>
                  <strong style={{ color: 'var(--accent-emerald)' }}>
                    ✓ {benchmarkData.improvement.lateArrivalReductionPct}% Late Arrival Reduction
                  </strong>
                  <div style={{ color: '#cbd5e1', fontSize: '0.8rem', marginTop: '4px' }}>
                    Saves an average of {benchmarkData.improvement.timeSavedMinutes} minutes per emergency response by excluding stale GPS drift and prioritizing appropriate vehicle capabilities.
                  </div>
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '12px' }}>
                  Measured on: {benchmarkData.setup.platform} ({benchmarkData.setup.cpus}) • Node {benchmarkData.setup.nodeVersion} • Runtime: {benchmarkData.benchmarkDurationMs}ms
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
