import React, { useState } from 'react';
import { api } from '../lib/api.js';
import './hospital.css';

// Citizen view: hospital cards once an ambulance is coming.
// One hospital at a time. The hospital accepts or rejects; to switch, the citizen asks for a change
// and the current hospital must release the patient.

const ACTIVE = ['pending', 'accepted', 'bed_ready'];
const REASON_TEXT = {
  no_bed: 'No bed free right now',
  no_doctor: 'No doctor available right now',
  speciality: 'This speciality is not available',
  other: 'Hospital could not take the patient'
};

function ayushmanTag(value) {
  if (value === true) return { text: 'Ayushman: accepted', cls: 'ok' };
  if (value === false) return { text: 'Ayushman: not accepted', cls: 'no' };
  return { text: 'Ayushman: not verified yet', cls: 'unknown' };
}

function bedsText(option) {
  if (option.bedsAvailable == null) return { text: 'Beds: live data not available', cls: 'unknown' };
  return {
    text: `${option.bedsAvailable} beds free${option.isDummy ? ' (demo)' : ''}`,
    cls: option.bedsAvailable > 0 ? 'ok' : 'no'
  };
}

const STATE_TEXT = {
  pending: 'Waiting for the hospital to accept',
  accepted: 'Hospital accepted. Patient is coming',
  bed_ready: 'Bed is ready for the patient'
};

export default function HospitalChoice({ requestId, tracking, onChosen }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [popup, setPopup] = useState(null); // { name } after a successful choice

  if (!tracking.unit) {
    return (
      <section className="card reveal" aria-label="Hospital">
        <h2>Hospital</h2>
        <p className="muted">When an ambulance is on the way, hospitals near you within 30 km appear here.</p>
      </section>
    );
  }

  const options = tracking.hospitalOptions || [];
  const sel = tracking.selection;
  const active = Boolean(sel && ACTIVE.includes(sel.state));
  const lastRejected = sel && sel.state === 'rejected' ? sel : null;
  const lastReleased = sel && sel.state === 'released' ? sel : null;
  const lastTimedOut = sel && sel.state === 'timed_out' ? sel : null;

  async function choose(option) {
    setBusyId(option.hospitalId);
    setError('');
    try {
      await api(`/api/reports/${encodeURIComponent(requestId)}/hospital`, {
        method: 'POST',
        body: JSON.stringify({ hospitalId: option.hospitalId })
      });
      setPopup({ name: option.name });
      onChosen();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function requestChange() {
    setError('');
    try {
      await api(`/api/reports/${encodeURIComponent(requestId)}/hospital/change`, { method: 'POST', body: '{}' });
      onChosen();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card reveal hc" aria-label="Hospital choice">
      <h2>Choose a hospital</h2>
      <p className="muted">Hospitals within 30 km. Pick one; that hospital accepts or rejects the patient.</p>

      {lastRejected && (
        <div className="hc-banner warn" role="status">
          {lastRejected.hospitalName} could not take the patient: {REASON_TEXT[lastRejected.rejectReason] || REASON_TEXT.other}. Please choose another hospital.
        </div>
      )}
      {lastTimedOut && (
        <div className="hc-banner warn" role="status">
          {lastTimedOut.hospitalName} did not respond in time. Please choose another hospital.
        </div>
      )}
      {lastReleased && (
        <div className="hc-banner" role="status">
          {lastReleased.hospitalName} released the patient. Please choose another hospital.
        </div>
      )}

      {options.length === 0 && <p className="muted">No hospital within 30 km of this spot.</p>}

      <div className="hc-grid">
        {options.map((o) => {
          const ayu = ayushmanTag(o.ayushman);
          const beds = bedsText(o);
          const isSelected = active && sel.hospitalId === o.hospitalId;
          const locked = active && !isSelected;
          return (
            <article key={o.hospitalId} className={`hc-card ${isSelected ? 'chosen' : ''} ${locked ? 'locked' : ''}`}>
              <div className="hc-top">
                {o.recommended && <span className="tag green">Suggested</span>}
                {o.isDummy && <span className="tag red">DUMMY</span>}
                {isSelected && <span className="tag">Your choice</span>}
              </div>
              <h3 className="hc-name">{o.name}</h3>
              <p className="muted hc-sub">{o.type} · {o.distanceKm} km · about {o.etaMinutes} min</p>
              <div className="hc-tags">
                <span className={`hc-pill ${o.emergency === false ? 'no' : o.emergency ? 'ok' : 'unknown'}`}>
                  {o.emergency === false ? 'No emergency desk' : o.emergency ? 'Emergency open' : 'Emergency: not verified'}
                </span>
                <span className={`hc-pill ${ayu.cls}`}>{ayu.text}</span>
                <span className={`hc-pill ${beds.cls}`}>{beds.text}</span>
              </div>
              {isSelected && <p className="hc-state">{STATE_TEXT[sel.state]}{sel.state === 'pending' ? ` (if no answer in ${sel.responseSeconds / 60} min, you can switch)` : ''}</p>}
              <div className="hc-actions">
                {o.phone && <a className="btn ghost" href={`tel:${o.phone}`}>Call</a>}
                {isSelected ? (
                  sel.changeRequested ? (
                    <button className="btn ghost" type="button" disabled>Change requested</button>
                  ) : (
                    <button className="btn ghost" type="button" onClick={requestChange}>Request change</button>
                  )
                ) : (
                  <button className="btn" type="button" disabled={busyId !== null || locked}
                    onClick={() => choose(o)}>
                    {locked ? 'Locked' : busyId === o.hospitalId ? 'Sending…' : 'Choose this hospital'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {active && sel.changeRequested && (
        <p className="hc-note" role="status">Change asked. {sel.hospitalName} will decide.</p>
      )}
      {error && <div className="error" role="alert">{error}</div>}
      <p className="hint">Only one hospital at a time. Ayushman and bed numbers show only when verified; dummy hospitals are marked DUMMY.</p>

      {popup && (
        <div className="hc-overlay" role="dialog" aria-modal="true" aria-labelledby="hc-pop-title">
          <div className="hc-popup">
            <h3 id="hc-pop-title">Request sent to {popup.name}</h3>
            <p>They will accept or reject the patient. You cannot choose another hospital until they release the patient.</p>
            <p className="muted">To switch hospitals, press "Request change". The current hospital must agree.</p>
            <button className="btn" type="button" onClick={() => setPopup(null)} autoFocus>OK, got it</button>
          </div>
        </div>
      )}
    </section>
  );
}
