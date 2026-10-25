import React, { useState } from 'react';

export default function ReasonCard({ activeRequest, onClose, onHospitalChoice }) {
  if (!activeRequest) return null;

  const { severity, ranking, id, status, queuePosition, hospital } = activeRequest;
  const isQueued = status === 'queued' || (!ranking?.chosen && status !== 'assigned');
  const chosen = ranking?.chosen;
  const runnerUp = ranking?.runnerUp;
  const nearest = ranking?.nearest;
  const bikeFallback = ranking?.bikeFallback;

  const currentHospital = hospital?.hospital || hospital;
  const hospitalPref = activeRequest.hospitalPreference || 'nearest';

  if (isQueued) {
    return (
      <div className="reason-card-container queued" role="region" aria-label="Dispatch Queue Status">
        <div className="reason-card-header">
          <div className="title-group">
            <span className="badge badge-queued">IN QUEUE: POSITION #{queuePosition || 1}</span>
            <span className="req-id">{id}</span>
            <span className={`badge badge-${severity}`}>{severity.toUpperCase()}</span>
          </div>
          {onClose && (
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close Reason Card">
              ✕
            </button>
          )}
        </div>

        <div className="queue-status-box">
          <div className="queue-pulse-icon">⏳</div>
          <div>
            <h4 style={{ color: '#f59e0b', fontSize: '1rem', fontWeight: 700 }}>
              Waiting for Available Unit (Critical-First Priority)
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '4px' }}>
              All units are currently busy. When any unit frees up, this request will be automatically assigned.
              {severity === 'critical'
                ? ' ⭐ Critical requests jump ahead of minor requests in the queue.'
                : ' Standard minor queue order.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!chosen) return null;

  // Determine why nearest lost to chosen
  const nearestIsDifferent = nearest && nearest.id !== chosen.id;
  let whyNearestLost = null;
  if (nearestIsDifferent) {
    if (nearest.gpsAge_s > 20 && severity === 'critical') {
      whyNearestLost = `Stale GPS (${nearest.gpsAge_s}s age > 20s). Excluded from critical assignment to prevent location drift.`;
    } else if (nearest.gpsAge_s > 20 && severity === 'minor') {
      whyNearestLost = `Stale GPS (${nearest.gpsAge_s}s age). Incurred +3.0 min stale penalty.`;
    } else if (severity === 'critical' && nearest.type === 'bike' && chosen.type === 'ambulance') {
      whyNearestLost = `Ambulance preferred for critical care. Bike would require +5.0 min fallback penalty.`;
    } else if (severity === 'minor' && nearest.type === 'ambulance' && chosen.type === 'bike') {
      whyNearestLost = `Bike preferred for minor response. Ambulance received +2.0 min capability penalty.`;
    } else {
      whyNearestLost = `Higher combined score due to speed/load penalties.`;
    }
  }

  return (
    <div className={`reason-card-container ${severity}`} role="region" aria-label="Dispatch Allocation Reason Card">
      {/* Header */}
      <div className="reason-card-header">
        <div className="title-group">
          <span className={`badge badge-${severity}`}>
            {severity.toUpperCase()} DRILL
          </span>
          <span className="req-id">{id}</span>
          <span className="timestamp">{new Date(activeRequest.createdAt).toLocaleTimeString()}</span>
        </div>
        {onClose && (
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close Reason Card">
            ✕
          </button>
        )}
      </div>

      {/* Main Allocation Winner */}
      <div className="winner-showcase">
        <div className="winner-main">
          <div className="winner-id-badge">
            <span className="unit-icon">{chosen.type === 'ambulance' ? '🚑' : '🏍️'}</span>
            <div>
              <div className="winner-id">{chosen.id}</div>
              <div className="winner-type">
                {chosen.type === 'ambulance' ? 'Ambulance (40 km/h)' : 'First Responder Bike (25 km/h)'}
              </div>
            </div>
          </div>

          <div className="winner-stats-grid">
            <div className="stat-box">
              <span className="stat-label">ETA</span>
              <span className="stat-val highlight">{chosen.eta_minutes.toFixed(1)} min</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Distance</span>
              <span className="stat-val">{chosen.distance_km.toFixed(2)} km</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">GPS Age</span>
              <span className="stat-val text-emerald">✓ {chosen.gpsAge_s.toFixed(1)}s (Fresh)</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Score</span>
              <span className="stat-val font-mono">{chosen.score.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Operational Alerts */}
        {bikeFallback && (
          <div className="operational-alert warning">
            <span>⚡</span>
            <span>
              <strong>BIKE FALLBACK:</strong> No ALS ambulance was free for this critical request. First responder bike assigned (+5m penalty applied).
            </span>
          </div>
        )}

        {chosen.inSpikeZone && (
          <div className="operational-alert amber">
            <span>⚠️</span>
            <span>
              <strong>SPIKE ZONE:</strong> Unit inside active high-demand zone (+1m congestion penalty added).
            </span>
          </div>
        )}
      </div>

      {/* Comparison Grid: Nearest & Runner-Up */}
      <div className="comparison-columns">
        {/* Nearest Unit Comparison */}
        <div className="comparison-card nearest-card">
          <div className="comp-header">
            <span className="comp-title">Nearest Unit Comparison</span>
            <span className="comp-id">{nearest ? nearest.id : 'None'}</span>
          </div>
          {nearest ? (
            <div className="comp-body">
              <div className="comp-stat-row">
                <span>Straight-line Dist:</span>
                <strong>{nearest.distance_km.toFixed(2)} km</strong>
              </div>
              <div className="comp-stat-row">
                <span>Vehicle Type:</span>
                <span>{nearest.type}</span>
              </div>
              <div className="comp-stat-row">
                <span>Raw ETA:</span>
                <span>{nearest.eta_minutes.toFixed(1)} min</span>
              </div>
              <div className="comp-stat-row">
                <span>GPS Age:</span>
                <span className={nearest.gpsAge_s > 20 ? 'text-amber' : 'text-emerald'}>
                  {nearest.gpsAge_s.toFixed(1)}s {nearest.gpsAge_s > 20 ? '(STALE)' : '(Fresh)'}
                </span>
              </div>

              <div className="comp-verdict">
                <span className="verdict-label">Why Nearest Lost:</span>
                <p className="verdict-text">
                  {nearestIsDifferent ? whyNearestLost : '✓ Nearest unit also scored highest on freshness & capability.'}
                </p>
              </div>
            </div>
          ) : (
            <p className="comp-empty">No free units available in proximity.</p>
          )}
        </div>

        {/* Runner-Up Section */}
        <div className="comparison-card runnerup-card">
          <div className="comp-header">
            <span className="comp-title">Runner-Up Alternative</span>
            <span className="comp-id">{runnerUp ? runnerUp.id : 'None'}</span>
          </div>
          {runnerUp ? (
            <div className="comp-body">
              <div className="comp-stat-row">
                <span>Distance:</span>
                <strong>{runnerUp.distance_km.toFixed(2)} km</strong>
              </div>
              <div className="comp-stat-row">
                <span>Vehicle Type:</span>
                <span>{runnerUp.type}</span>
              </div>
              <div className="comp-stat-row">
                <span>ETA:</span>
                <span>{runnerUp.eta_minutes.toFixed(1)} min</span>
              </div>
              <div className="comp-stat-row">
                <span>Score Delta:</span>
                <span className="font-mono text-amber">
                  +{(runnerUp.score - chosen.score).toFixed(2)}m behind
                </span>
              </div>

              <div className="comp-verdict">
                <span className="verdict-label">Selection Margin:</span>
                <p className="verdict-text">
                  Chosen {chosen.id} arrives ~{(runnerUp.eta_minutes - chosen.eta_minutes).toFixed(1)} min sooner.
                </p>
              </div>
            </div>
          ) : (
            <p className="comp-empty">No secondary candidates met criteria.</p>
          )}
        </div>
      </div>

      {/* Destination Hospital Selection & Patient Choice (Phase 4b) */}
      {currentHospital && (
        <div className="hospital-section-card">
          <div className="hospital-card-header">
            <div>
              <span className="hospital-title-label">🏥 Destination Hospital Routing</span>
              <h4 className="hospital-name">{currentHospital.name}</h4>
            </div>
            <div className="hospital-badges">
              <span className="dummy-badge">DUMMY DATA</span>
              <span className={`hospital-type-badge ${currentHospital.type}`}>
                {currentHospital.type?.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="hospital-stats-row">
            <div>
              <span className="stat-label">Incident Distance:</span>
              <strong className="stat-val">{currentHospital.distance_km} km</strong>
            </div>
            <div>
              <span className="stat-label">Transit ETA:</span>
              <strong className="stat-val text-cyan">{currentHospital.transit_eta_minutes} min</strong>
            </div>
            <div>
              <span className="stat-label">Total Beds:</span>
              <span className="stat-val font-mono">{currentHospital.totalBeds} (DUMMY)</span>
            </div>
            <div>
              <span className="stat-label">ICU Beds:</span>
              <span className="stat-val font-mono text-emerald">{currentHospital.icuBeds} (DUMMY)</span>
            </div>
          </div>

          {/* Fallback Notice if hospital preference was adjusted */}
          {hospital?.fallback && (
            <div className="hospital-fallback-note">
              <span>ℹ️</span>
              <span>{hospital.fallbackReason}</span>
            </div>
          )}

          {/* Patient / Family Choice Selector */}
          <div className="patient-choice-toolbar">
            <span className="choice-label">Patient / Family Choice:</span>
            <div className="choice-button-group">
              <button
                type="button"
                className={`choice-btn ${hospitalPref === 'nearest' ? 'active' : ''}`}
                onClick={() => onHospitalChoice && onHospitalChoice('nearest')}
              >
                Nearest (Default)
              </button>
              <button
                type="button"
                className={`choice-btn ${hospitalPref === 'government' ? 'active' : ''}`}
                onClick={() => onHospitalChoice && onHospitalChoice('government')}
              >
                Government
              </button>
              <button
                type="button"
                className={`choice-btn ${hospitalPref === 'private' ? 'active' : ''}`}
                onClick={() => onHospitalChoice && onHospitalChoice('private')}
              >
                Private
              </button>
              <button
                type="button"
                className={`choice-btn ${hospitalPref === 'hosp-02' ? 'active' : ''}`}
                onClick={() => onHospitalChoice && onHospitalChoice('HOSP-02')}
              >
                AIIMS
              </button>
              <button
                type="button"
                className={`choice-btn ${hospitalPref === 'hosp-03' ? 'active' : ''}`}
                onClick={() => onHospitalChoice && onHospitalChoice('HOSP-03')}
              >
                Bansal
              </button>
            </div>
          </div>

          <div className="hospital-disclaimer-tag">
            ⚠️ ALL HOSPITAL BED COUNTS & METRICS ARE DUMMY DATA — PARTNERSHIPS WITH BHOPAL HOSPITALS PLANNED IN ROADMAP
          </div>
        </div>
      )}

      {/* Formula Transparency Note */}
      <div className="card-footer-note">
        <span>Allocation Rule: <code>Score = Haversine ETA + Stale Penalty + Capability Penalty + Spike Zone</code></span>
      </div>
    </div>
  );
}
