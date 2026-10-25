import React, { useEffect, useMemo, useState } from 'react';
import LiveMap from './LiveMap.jsx';
import Dashboard from '../App.jsx';
import { api } from '../lib/api.js';
import './control.css';

// Control room for an officer. Plain words, one job per area:
//   1. Status strip  - how many incidents are open, units free, units busy
//   2. Queue (left)  - incidents in three tabs: Waiting, On the way, Closed
//   3. Map (centre)  - where incidents and units are
//   4. Details (right) - the chosen incident, its steps, and what to do next
// Technical view (full dispatcher) is hidden behind one button.

const STEP_LABELS = ['Reported', 'Unit assigned', 'On the way', 'Arrived', 'Closed'];
const ARRIVED_KM = 0.05;

function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

// Turns the raw report status into the step the officer should see
function stepOf(report, tracking) {
  if (report.closed) return 4;
  if (!report.assignedUnitId) return 0;
  if (!tracking?.unit) return 1;
  if (tracking.distanceKm !== null && tracking.distanceKm <= ARRIVED_KM) return 3;
  return 2;
}

// Plain instruction for the officer, based on the step
function nextActionFor(report, step, tracking) {
  if (step === 4) return { title: 'Closed', text: 'This incident is handled. Nothing more to do.' };
  if (step === 0) {
    return {
      title: 'Waiting for a free unit',
      text: 'No unit is free right now. The system will assign the first free unit automatically. Call the caller if you can, to confirm the place.'
    };
  }
  if (step === 1) {
    return { title: 'Unit is being sent', text: 'A unit is picked. Wait for it to start moving.' };
  }
  if (step === 2) {
    const eta = tracking?.etaMinutes != null ? ` It should reach in about ${tracking.etaMinutes} minutes.` : '';
    return {
      title: `${tracking?.unit?.id ?? 'Unit'} is on the way`,
      text: `Keep the caller on the phone if possible. Ask: is the person breathing, and is there heavy bleeding?${eta}`
    };
  }
  return {
    title: 'Unit has arrived',
    text: 'Make sure the patient is handed over. When done, press "Mark as closed".'
  };
}

export default function ControlRoom({ onOut }) {
  const [reports, setReports] = useState([]);
  const [units, setUnits] = useState([]);
  const [tab, setTab] = useState('waiting');
  const [selectedId, setSelectedId] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [showTech, setShowTech] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Incidents every 3 s, units every 2 s
  useEffect(() => {
    let cancelled = false;
    const loadReports = () => api('/api/admin/reports')
      .then((r) => { if (!cancelled) { setReports(r.reports); setError(''); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    const loadUnits = () => api('/api/fleet')
      .then((r) => { if (!cancelled) setUnits(r.units); })
      .catch(() => {});
    loadReports(); loadUnits();
    const a = setInterval(loadReports, 3000);
    const b = setInterval(loadUnits, 2000);
    return () => { cancelled = true; clearInterval(a); clearInterval(b); };
  }, []);

  // Details for the chosen incident (unit, ETA, hospital), every 3 s
  useEffect(() => {
    if (!selectedId) { setTracking(null); return undefined; }
    let cancelled = false;
    const load = () => api(`/api/reports/${encodeURIComponent(selectedId)}`)
      .then((r) => { if (!cancelled) setTracking(r.tracking); })
      .catch(() => {});
    load();
    const id = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [selectedId]);

  const open = useMemo(() => reports.filter((r) => !r.closed), [reports]);
  const waiting = useMemo(() => open.filter((r) => !r.assignedUnitId).sort(bySeverity), [open]);
  const onWay = useMemo(() => open.filter((r) => r.assignedUnitId).sort(bySeverity), [open]);
  const closed = useMemo(() => reports.filter((r) => r.closed).sort((a, b) => b.createdAt - a.createdAt), [reports]);

  const list = tab === 'waiting' ? waiting : tab === 'onway' ? onWay : closed;
  const selected = reports.find((r) => r.requestId === selectedId) || null;
  const step = selected ? stepOf(selected, tracking) : 0;
  const action = selected ? nextActionFor(selected, step, tracking) : null;

  const counts = {
    critical: open.filter((r) => r.severity === 'critical').length,
    minor: open.filter((r) => r.severity === 'minor').length,
    free: units.filter((u) => u.status === 'free' && !u.isStale).length,
    busy: units.filter((u) => u.status === 'busy').length,
    stale: units.filter((u) => u.isStale).length
  };

  async function markClosed() {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/api/admin/reports/${selected.requestId}/close`, { method: 'POST' });
      setTab('closed');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    onOut();
  }

  return (
    <div className="cr">
      <header className="cr-top">
        <div>
          <h1>Control room</h1>
          <p className="cr-sub">Incoming emergency reports and units · PROTOTYPE / DRILL</p>
        </div>
        <div className="cr-top-actions">
          <button type="button" className="cr-btn ghost" onClick={() => setShowTech((v) => !v)} aria-expanded={showTech}>
            {showTech ? 'Hide technical view' : 'Show technical view'}
          </button>
          <button type="button" className="cr-btn" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <section className="cr-help" aria-label="How this screen works">
        <strong>How it works:</strong>
        <span>1. A citizen reports an incident.</span>
        <span>2. The system sends the best free unit.</span>
        <span>3. You follow it here, and close the incident when it is handled.</span>
      </section>

      {error && <p className="cr-error" role="alert">{error}</p>}

      <section className="cr-status" aria-label="Status now">
        <Stat label="Urgent open" value={counts.critical} tone="red" hint="critical" />
        <Stat label="Non-urgent open" value={counts.minor} tone="amber" hint="minor" />
        <Stat label="Free units" value={counts.free} tone="green" hint="ready to send" />
        <Stat label="Busy units" value={counts.busy} tone="blue" hint="on a job" />
        <Stat label="Waiting" value={waiting.length} tone={waiting.length ? 'red' : 'grey'} hint="no unit yet" />
      </section>

      <div className="cr-grid">
        {/* Queue */}
        <section className="cr-queue" aria-label="Incident queue">
          <div className="cr-tabs" role="tablist">
            <Tab id="waiting" tab={tab} setTab={setTab} label="Waiting" n={waiting.length} />
            <Tab id="onway" tab={tab} setTab={setTab} label="On the way" n={onWay.length} />
            <Tab id="closed" tab={tab} setTab={setTab} label="Closed" n={closed.length} />
          </div>
          {list.length === 0 && (
            <p className="cr-empty">
              {tab === 'waiting' && 'No one is waiting. Good.'}
              {tab === 'onway' && 'No unit is on the way right now.'}
              {tab === 'closed' && 'No closed incidents yet.'}
            </p>
          )}
          <ul className="cr-list">
            {list.map((r) => (
              <li key={r.requestId}>
                <button type="button" className={`cr-card ${r.requestId === selectedId ? 'sel' : ''} ${r.severity}`}
                  onClick={() => setSelectedId(r.requestId)} aria-pressed={r.requestId === selectedId}>
                  <span className={`cr-sev ${r.severity}`}>{r.severity === 'critical' ? 'URGENT' : 'Non-urgent'}</span>
                  <span className="cr-card-title">{pretty(r.incidentType)} · {r.peopleInjured} hurt</span>
                  <span className="cr-card-desc">{r.description}</span>
                  <span className="cr-card-meta">{ago(r.createdAt)} · {r.assignedUnitId ? `Unit ${r.assignedUnitId}` : 'No unit yet'}{r.landmark ? ` · ${r.landmark}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Map */}
        <section className="cr-map" aria-label="Map">
          <div className="cr-map-head">
            <strong>Map</strong>
            <span className="cr-legend-note">Red = urgent · Amber = non-urgent · Blue = ambulance · Green = bike</span>
          </div>
          <div className="cr-map-box">
            <LiveMap
              units={units}
              reports={open}
              selectedReportId={selectedId}
              onSelectReport={(id) => setSelectedId(id)}
            />
          </div>
        </section>

        {/* Details */}
        <aside className="cr-detail" aria-label="Selected incident">
          {!selected && (
            <div className="cr-placeholder">
              <h2>Select an incident</h2>
              <p>Click a card on the left, or a pin on the map. Its steps and what to do next appear here.</p>
            </div>
          )}

          {selected && (
            <>
              <div className="cr-detail-head">
                <span className={`cr-sev ${selected.severity}`}>{selected.severity === 'critical' ? 'URGENT' : 'Non-urgent'}</span>
                <h2>{pretty(selected.incidentType)} · {selected.requestId}</h2>
                <p className="cr-desc">{selected.description}</p>
                <p className="cr-small">
                  {selected.peopleInjured} person(s) · reported {ago(selected.createdAt)}
                  {selected.landmark ? ` · near ${selected.landmark}` : ''}
                </p>
                <p className="cr-small">Caller phone ends {selected.phoneLast4}{selected.callerName ? ` · ${selected.callerName}` : ''}</p>
                {selected.redFlags && Object.values(selected.redFlags).some(Boolean) && (
                  <p className="cr-flag">Warning from the caller: {redFlagText(selected.redFlags)}</p>
                )}
              </div>

              <ol className="cr-steps" aria-label="Progress">
                {STEP_LABELS.map((label, i) => (
                  <li key={label} className={i < step ? 'done' : i === step ? 'now' : ''}>
                    <span>{i < step ? '✓' : i + 1}</span> {label}
                  </li>
                ))}
              </ol>

              <div className="cr-next">
                <h3>What to do now</h3>
                <p className="cr-next-title">{action.title}</p>
                <p>{action.text}</p>
              </div>

              {tracking && tracking.unit && (
                <div className="cr-facts">
                  <Fact label="Unit" value={`${tracking.unit.id} (${tracking.unit.type === 'ambulance' ? 'ambulance' : 'bike'})`} />
                  <Fact label="Distance" value={tracking.distanceKm !== null ? `${tracking.distanceKm} km` : '—'} />
                  <Fact label="Expected in" value={tracking.etaMinutes !== null ? `${tracking.etaMinutes} min` : '—'} />
                  <Fact label="Speed" value={tracking.unit.speedKmh ? `${tracking.unit.speedKmh} km/h` : '—'} />
                </div>
              )}

              {tracking?.hospital && (
                <div className="cr-facts">
                  <Fact label="Suggested hospital" value={tracking.hospital.name} />
                  <Fact label="Hospital type" value={`${tracking.hospital.type} (demo data)`} />
                </div>
              )}

              <div className="cr-detail-actions">
                {selected.closed ? (
                  <p className="cr-small">This incident is closed.</p>
                ) : (
                  <button type="button" className="cr-btn primary" onClick={markClosed} disabled={busy}>
                    {busy ? 'Saving…' : 'Mark as closed'}
                  </button>
                )}
                <button type="button" className="cr-btn ghost" onClick={() => setSelectedId(null)}>Clear selection</button>
              </div>
            </>
          )}
        </aside>
      </div>

      {showTech && (
        <section className="cr-tech" aria-label="Technical dispatcher view">
          <p className="cr-small">Technical view for staff who run drills and tests. Same data as above, with full controls.</p>
          <Dashboard reports={open} selectedReportId={selectedId} onSelectReport={(id) => setSelectedId(id)} />
        </section>
      )}
    </div>
  );
}

function bySeverity(a, b) {
  if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
  return b.createdAt - a.createdAt;
}

function pretty(type) {
  return { accident: 'Accident', injury: 'Injury', illness: 'Sudden illness', other: 'Other' }[type] || type;
}

function redFlagText(flags) {
  const parts = [];
  if (flags.notConscious) parts.push('person is unconscious or not responding');
  if (flags.notBreathing) parts.push('not breathing or very weak breathing');
  if (flags.heavyBleeding) parts.push('heavy bleeding');
  return parts.join(', ');
}

function Stat({ label, value, tone, hint }) {
  return (
    <div className={`cr-stat ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{hint}</small>
    </div>
  );
}

function Tab({ id, tab, setTab, label, n }) {
  return (
    <button type="button" role="tab" aria-selected={tab === id} className={`cr-tab ${tab === id ? 'on' : ''}`}
      onClick={() => setTab(id)}>
      {label} <span className="cr-count">{n}</span>
    </button>
  );
}

function Fact({ label, value }) {
  return (
    <div className="cr-fact">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
