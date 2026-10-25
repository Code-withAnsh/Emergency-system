import React, { useState } from 'react';

export default function Controls({
  onTriggerRequest,
  onTriggerSpike,
  spikeZone,
  loading,
  onShowBenchmark
}) {
  const isSpikeActive = spikeZone?.active && spikeZone.remainingSeconds > 0;

  return (
    <div className="controls-panel" role="region" aria-label="Dispatch Command Controls">
      <div className="controls-header">
        <span className="controls-title">Drill Incident & Load Injection</span>
        <span className="controls-hint">Drop drill request pin or simulate demand surge</span>
      </div>

      <div className="controls-buttons-grid">
        {/* Critical Drill Request */}
        <button
          type="button"
          className="drill-btn critical-btn"
          disabled={loading}
          onClick={() => onTriggerRequest('critical')}
          aria-label="Trigger Critical Drill Request"
        >
          <span className="btn-icon">🚨</span>
          <div className="btn-text">
            <span className="btn-label">Drill Request: CRITICAL</span>
            <span className="btn-sub">Requires ALS Ambulance • Stale Excluded</span>
          </div>
        </button>

        {/* Minor Drill Request */}
        <button
          type="button"
          className="drill-btn minor-btn"
          disabled={loading}
          onClick={() => onTriggerRequest('minor')}
          aria-label="Trigger Minor Drill Request"
        >
          <span className="btn-icon">⚡</span>
          <div className="btn-text">
            <span className="btn-label">Drill Request: MINOR</span>
            <span className="btn-sub">Prefers Bike • +3m Stale Penalty</span>
          </div>
        </button>

        {/* Demand Spike Surge */}
        <button
          type="button"
          className={`drill-btn spike-btn ${isSpikeActive ? 'spike-active' : ''}`}
          disabled={loading || isSpikeActive}
          onClick={onTriggerSpike}
          aria-label="Trigger 30-Second Demand Spike"
        >
          <span className="btn-icon">🔥</span>
          <div className="btn-text">
            <span className="btn-label">
              {isSpikeActive ? `DEMAND SPIKE ACTIVE (${spikeZone.remainingSeconds}s)` : 'Inject Demand Spike (30s)'}
            </span>
            <span className="btn-sub">
              {isSpikeActive ? '1.5km zone congested • +1m load penalty' : 'Doubles incident rate • Congests 1.5km zone'}
            </span>
          </div>
        </button>

        {/* Benchmark Inspector */}
        <button
          type="button"
          className="drill-btn benchmark-btn"
          onClick={onShowBenchmark}
          aria-label="Open 1000 Incident Comparison Benchmark"
        >
          <span className="btn-icon">📊</span>
          <div className="btn-text">
            <span className="btn-label">1000 Incident Benchmark</span>
            <span className="btn-sub">Nearest-unit vs AI Ranking proof (measured live in the modal)</span>
          </div>
        </button>
      </div>
    </div>
  );
}
