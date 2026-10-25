import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import HospitalDetail from '../components/HospitalDetail.jsx';
import '../public/public.css';
import '../components/hospital.css';

// Hospital panel (/hospital). Dummy for now: one shared login from env, and every hospital
// sees the same inbox. Later each hospital registers and gets its own admin panel.
const POLL_MS = 3000;

export default function Hospital() {
  const [state, setState] = useState('checking'); // checking | out | in
  const [notConfigured, setNotConfigured] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api('/api/hospital/me')
      .then((r) => { setNotConfigured(!r.configured); setState(r.hospital ? 'in' : 'out'); })
      .catch(() => setState('out'));
  }, []);

  if (state === 'checking') return <div className="pub"><p style={{ padding: 24 }}>Loading…</p></div>;
  if (state === 'out') return <HospitalLogin notConfigured={notConfigured} notice={notice} onIn={() => { setNotice(''); setState('in'); }} />;
  // Any request that finds the session gone sends the staff back to sign-in with a clear message
  const expire = (msg) => { setNotice(msg || 'Your session ended. Please sign in again.'); setState('out'); };
  return <Inbox onOut={() => expire('You signed out.')} onSessionEnd={expire} />;
}

function HospitalLogin({ onIn, notConfigured, notice }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(notConfigured ? 'Hospital login is not set up on the server (.env).' : notice);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/hospital/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      onIn();
    } catch (err) {
      setError(err.message === 'Wrong username or password' ? 'Wrong username or password.' : err.message);
      setBusy(false);
    }
  }

  return (
    <div className="pub">
      <div className="pub-banner" role="note">PROTOTYPE / DRILL · Hospital panel (dummy login)</div>
      <main className="pub-wrap" style={{ maxWidth: 420 }}>
        <h1>Hospital sign in</h1>
        <p className="muted">Incoming patients from the ambulance service appear here.</p>
        <form className="card" onSubmit={submit}>
          <label className="field" htmlFor="hu">Username</label>
          <input id="hu" type="text" autoComplete="username" required value={username}
            onChange={(e) => setUsername(e.target.value)} />
          <label className="field" htmlFor="hp">Password</label>
          <input id="hp" type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn" type="submit" disabled={busy || notConfigured}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="hint"><a href="/">← Home</a></p>
      </main>
    </div>
  );
}

const REASONS = [
  { value: 'no_bed', label: 'No bed free' },
  { value: 'no_doctor', label: 'No doctor available' },
  { value: 'speciality', label: 'Speciality not available' },
  { value: 'other', label: 'Other' }
];
const REASON_LABEL = Object.fromEntries(REASONS.map((r) => [r.value, r.label]));
const TABS = [
  { key: 'needs', label: 'Needs action' },
  { key: 'active', label: 'Coming in' },
  { key: 'closed', label: 'Closed' }
];

function tabOf(m) {
  if (m.status === 'pending' || m.changeRequested) return 'needs';
  if (m.status === 'accepted' || m.status === 'bed_ready') return 'active';
  return 'closed';
}

function ago(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

function Inbox({ onOut, onSessionEnd }) {
  const [messages, setMessages] = useState([]);
  const [tab, setTab] = useState('needs');
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState('no_bed');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api('/api/hospital/inbox');
        if (!cancelled) { setMessages(res.messages); setError(''); }
      } catch (err) {
        if (!cancelled) handleError(err);
      }
    }
    load();
    const poll = setInterval(load, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { cancelled = true; clearInterval(poll); clearInterval(clock); };
  }, []);

  // 401 from the server means the session is gone (for example after a server restart)
  function handleError(err) {
    if (/login required/i.test(err.message) && onSessionEnd) onSessionEnd();
    else setError(err.message);
  }

  async function decide(id, action, extra = {}) {
    setBusyId(id);
    setError('');
    try {
      const res = await api(`/api/hospital/inbox/${encodeURIComponent(id)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ action, ...extra })
      });
      setMessages((list) => list.map((m) => (m.id === id ? res.message : m)));
      setRejectingId(null);
    } catch (err) {
      handleError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function logout() {
    await api('/api/hospital/logout', { method: 'POST' }).catch(() => {});
    onOut();
  }

  const counts = {
    needs: messages.filter((m) => tabOf(m) === 'needs').length,
    pendingOnly: messages.filter((m) => m.status === 'pending').length,
    bedReady: messages.filter((m) => m.status === 'bed_ready').length,
    changes: messages.filter((m) => m.changeRequested).length
  };
  const shown = messages.filter((m) => tabOf(m) === tab);
  const selected = messages.find((m) => m.id === selectedId) || null;

  // The same decision buttons appear on the card and in the detail panel
  function actionsFor(m) {
    const busy = busyId === m.id;
    return (
      <div className="hp-actions">
        {m.status === 'pending' && rejectingId !== m.id && (
          <>
            <button className="btn hp-accept" type="button" disabled={busy} onClick={() => decide(m.id, 'accept')}>Accept patient</button>
            <button className="btn ghost hp-reject" type="button" disabled={busy} onClick={() => setRejectingId(m.id)}>Reject</button>
          </>
        )}
        {m.status === 'pending' && rejectingId === m.id && (
          <div className="hp-reject-box">
            <label htmlFor={`r-${m.id}`}>Reason (the citizen will see it)</label>
            <select id={`r-${m.id}`} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <div className="hp-actions">
              <button className="btn hp-reject" type="button" disabled={busy} onClick={() => decide(m.id, 'reject', { reason })}>Confirm reject</button>
              <button className="btn ghost" type="button" onClick={() => setRejectingId(null)}>Cancel</button>
            </div>
          </div>
        )}
        {m.status === 'accepted' && (
          <button className="btn hp-accept" type="button" disabled={busy} onClick={() => decide(m.id, 'bed_ready')}>Bed is ready</button>
        )}
        {(m.status === 'accepted' || m.status === 'bed_ready') && m.changeRequested && (
          <>
            <button className="btn hp-reject" type="button" disabled={busy} onClick={() => decide(m.id, 'release')}>Release patient</button>
            <button className="btn ghost" type="button" disabled={busy} onClick={() => decide(m.id, 'keep')}>Keep patient</button>
          </>
        )}
        {m.status === 'bed_ready' && <span className="hc-pill ok">Bed ready for arrival</span>}
        {m.status === 'rejected' && <span className="hc-pill no">Rejected: {REASON_LABEL[m.rejectReason] || 'other'}</span>}
        {m.status === 'released' && <span className="hc-pill unknown">Released to another hospital</span>}
        {m.status === 'timed_out' && <span className="hc-pill unknown">No answer in time. Citizen chose another hospital</span>}
      </div>
    );
  }

  return (
    <div className="pub hp">
      <div className="pub-banner" role="note">PROTOTYPE / DRILL · Dummy hospital panel: every hospital sees this same inbox for now</div>
      <main className="hp-wrap">
        <header className="hp-top">
          <div>
            <h1>Incoming patients</h1>
            <p className="muted">Click a patient to see the live map, speed and ETA. Updates every {POLL_MS / 1000} seconds.</p>
          </div>
          <button className="btn ghost" type="button" onClick={logout}>Sign out</button>
        </header>

        <div className="hp-stats" role="list">
          <div role="listitem"><small>Needs action</small><strong>{counts.needs}</strong></div>
          <div role="listitem"><small>Waiting to accept</small><strong>{counts.pendingOnly}</strong></div>
          <div role="listitem"><small>Bed ready</small><strong>{counts.bedReady}</strong></div>
          <div role="listitem" className={counts.changes ? 'alert' : ''}><small>Change requests</small><strong>{counts.changes}</strong></div>
        </div>

        <nav className="hp-tabs" aria-label="Filter">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
              {t.label} <span className="hp-count">{messages.filter((m) => tabOf(m) === t.key).length}</span>
            </button>
          ))}
        </nav>

        {error && <div className="error" role="alert">{error}</div>}

        <div className="hp-split">
          <div className="hp-list">
            {shown.length === 0 && (
              <p className="hp-empty">Nothing here. New patients appear automatically when a citizen picks your hospital.</p>
            )}
            {shown.map((m) => {
              const elapsed = now - m.createdAt;
              const etaLeft = m.etaMinutes != null ? Math.max(0, Math.round(m.etaMinutes * 60 - elapsed / 1000)) : null;
              const isSel = m.id === selectedId;
              return (
                <article key={m.id}
                  className={`hp-msg hp-click ${m.severity === 'critical' ? 'critical' : ''} ${m.changeRequested ? 'change' : ''} ${isSel ? 'selected' : ''}`}
                  onClick={() => setSelectedId(m.id)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSelectedId(m.id); }}
                  aria-pressed={isSel}>
                  <div className="hp-head">
                    <span className={`hp-sev ${m.severity === 'critical' ? 'red' : 'green'}`}>
                      {m.severity === 'critical' ? 'CRITICAL' : 'MINOR'}
                    </span>
                    <strong>{m.requestId}</strong>
                    <span className="muted hp-time">received {ago(elapsed)}</span>
                  </div>
                  <p className="muted hp-meta">
                    {m.incidentType} · {m.peopleInjured} injured · Unit {m.unitId || '—'}
                    {etaLeft != null && (
                      <> · in <strong className="hp-eta">{Math.floor(etaLeft / 60)}:{String(etaLeft % 60).padStart(2, '0')}</strong></>
                    )}
                  </p>
                  {m.changeRequested && <p className="hc-pill warn-pill">Change requested by citizen</p>}
                  {!isSel && <div onClick={(e) => e.stopPropagation()}>{actionsFor(m)}</div>}
                </article>
              );
            })}
          </div>

          <aside className="hp-detail" aria-label="Patient detail">
            {selected ? (
              <>
                <HospitalDetail key={selected.id} messageId={selected.id} actions={actionsFor(selected)} />
              </>
            ) : (
              <p className="muted">Select a patient card to see the live map, the ambulance speed and the ETA.</p>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
