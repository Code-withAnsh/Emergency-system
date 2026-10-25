import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import PublicShell from '../public/PublicShell.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { api, DRILL_BOX } from '../lib/api.js';
import '../public/public.css';

const RED_FLAGS = ['flagConscious', 'flagBreathing', 'flagBleeding'];
const RED_FLAG_KEYS = { flagConscious: 'notConscious', flagBreathing: 'notBreathing', flagBleeding: 'heavyBleeding' };
const INCIDENT_TYPES = [
  { value: 'accident', key: 'typeAccident' },
  { value: 'injury', key: 'typeInjury' },
  { value: 'illness', key: 'typeIllness' },
  { value: 'other', key: 'typeOther' }
];

const insideBox = (p) =>
  p.lat >= DRILL_BOX.bounds[0][0] && p.lat <= DRILL_BOX.bounds[1][0] &&
  p.lng >= DRILL_BOX.bounds[0][1] && p.lng <= DRILL_BOX.bounds[1][1];

// Map tap sets the point. Also fixes size when the map is shown after mount.
function PointPicker({ onPick }) {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(id);
  }, [map]);
  useMapEvents({ click(e) { onPick({ lat: e.latlng.lat, lng: e.latlng.lng }); } });
  return null;
}

export function ReportForm({ embedded = false }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [incidentType, setIncidentType] = useState('accident');
  const [description, setDescription] = useState('');
  const [peopleInjured, setPeopleInjured] = useState(1);
  const [isSafe, setIsSafe] = useState(true);
  const [point, setPoint] = useState(null);
  const [locNote, setLocNote] = useState({ key: 'locNone', vars: {} });
  const [mapFailed, setMapFailed] = useState(false);
  const [landmark, setLandmark] = useState('');
  const [flags, setFlags] = useState({ flagConscious: false, flagBreathing: false, flagBleeding: false });
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const note = t(locNote.key, locNote.vars);

  function useLiveLocation() {
    setLocNote({ key: 'locSearching' });
    if (!window.isSecureContext) return setLocNote({ key: 'locHttps' });
    if (!navigator.geolocation) return setLocNote({ key: 'locNoApi' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocNote({ key: 'locGot', vars: { m: Math.round(pos.coords.accuracy) } });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) return setLocNote({ key: 'locDenied' });
        if (err.code === err.TIMEOUT) return setLocNote({ key: 'locTimeout' });
        setLocNote({ key: 'locUnavailable' });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }

  function validate(s) {
    if (s === 0) {
      if (description.trim().length < 3) return t('errDesc');
      if (peopleInjured < 1 || peopleInjured > 50) return t('errPeople');
    }
    if (s === 1) {
      if (!point) return t('errLoc');
      if (!insideBox(point)) return t('errBox');
    }
    if (s === 2) {
      if (phone.replace(/[\s+]/g, '').length < 10) return t('errPhone');
    }
    return '';
  }

  function next() {
    const msg = validate(step);
    setError(msg);
    if (!msg) setStep(step + 1);
  }

  async function submit() {
    const msg = validate(2);
    setError(msg);
    if (msg) return;
    setSubmitting(true);
    try {
      const body = {
        incidentType,
        description,
        peopleInjured: Number(peopleInjured),
        isSafe,
        lat: point.lat,
        lng: point.lng,
        landmark,
        phone,
        name,
        ...Object.fromEntries(RED_FLAGS.map((f) => [RED_FLAG_KEYS[f], flags[f]]))
      };
      const res = await api('/api/reports', { method: 'POST', body: JSON.stringify(body) });
      window.location.assign(`/track/${res.requestId}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  const stepTitles = [t('stepWhat'), t('stepWhere'), t('stepDetails')];

  return (
    <div className={embedded ? 'report-embedded' : ''}>
      {!embedded && <a href="/" className="muted" style={{ fontSize: '.92rem' }}>← {t('home')}</a>}
      {!embedded && <h1>{t('reportTitle')}</h1>}
        <ol className="step-pills" aria-label={t('stepOf', { n: step + 1 })}>
          {stepTitles.map((title, i) => (
            <li key={title} className={`pill ${i === step ? 'current' : ''} ${i < step ? 'done' : ''}`}>
              <span className="pill-num">{i < step ? '✓' : i + 1}</span>
              <span className="pill-label">{title}</span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="card step-panel" aria-label={stepTitles[0]}>
            <span className="field" id="type-label">{t('incidentQ')}</span>
            <div className="choices" role="radiogroup" aria-labelledby="type-label">
              {INCIDENT_TYPES.map((it) => (
                <label key={it.value} className={`choice ${incidentType === it.value ? 'on' : ''}`}>
                  <input type="radio" name="incidentType" value={it.value}
                    checked={incidentType === it.value} onChange={() => setIncidentType(it.value)} />
                  {t(it.key)}
                </label>
              ))}
            </div>

            <label className="field" htmlFor="desc">{t('descLabel')}</label>
            <textarea id="desc" value={description} maxLength={500}
              placeholder={t('descPlaceholder')} onChange={(e) => setDescription(e.target.value)} />
            <p className="hint">{description.length}/500</p>

            <label className="field" htmlFor="people">{t('peopleLabel')}</label>
            <input id="people" type="number" min={1} max={50} value={peopleInjured}
              onChange={(e) => setPeopleInjured(Number(e.target.value))} />

            <label className={`choice ${isSafe ? 'on' : ''}`} style={{ marginTop: 16 }}>
              <input type="checkbox" checked={isSafe} onChange={(e) => setIsSafe(e.target.checked)} />
              {t('safeLabel')}
            </label>
          </section>
        )}

        {step === 1 && (
          <section className="card step-panel" aria-label={stepTitles[1]}>
            <button type="button" className="btn ghost" onClick={useLiveLocation}>{t('liveBtn')}</button>
            <p className="hint" role="status" aria-live="polite">{note}</p>

            <p className="muted" style={{ marginTop: 14 }}>{t('liveHint')}</p>
            <div className="map">
              <MapContainer
                center={DRILL_BOX.center}
                zoom={13}
                minZoom={12}
                maxBounds={DRILL_BOX.bounds}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                  eventHandlers={{ tileerror: () => setMapFailed(true), tileload: () => setMapFailed(false) }}
                />
                <PointPicker onPick={(p) => { setPoint(p); setLocNote({ key: 'locPicked' }); }} />
                {point && (
                  <CircleMarker center={[point.lat, point.lng]} radius={9}
                    pathOptions={{ color: '#f43f5e', fillOpacity: 0.85 }} />
                )}
              </MapContainer>
            </div>
            {mapFailed && <p className="map-fallback" role="alert">{t('mapFailed')}</p>}
            {point && (
              <p className="hint">{t('coordsLabel')}: {point.lat.toFixed(5)}, {point.lng.toFixed(5)}</p>
            )}

            <label className="field" htmlFor="landmark">{t('landmarkLabel')}</label>
            <input id="landmark" type="text" maxLength={100} value={landmark}
              placeholder={t('landmarkPlaceholder')} onChange={(e) => setLandmark(e.target.value)} />
          </section>
        )}

        {step === 2 && (
          <section className="card step-panel" aria-label={stepTitles[2]}>
            <span className="field" id="flags-label">{t('redFlagsQ')}</span>
            <div className="choices" style={{ gridTemplateColumns: '1fr' }} role="group" aria-labelledby="flags-label">
              {RED_FLAGS.map((f) => (
                <label key={f} className={`choice ${flags[f] ? 'on' : ''}`}>
                  <input type="checkbox" checked={flags[f]}
                    onChange={(e) => setFlags({ ...flags, [f]: e.target.checked })} />
                  {t(f)}
                </label>
              ))}
            </div>
            <p className="hint">{t('flagNote')}</p>

            <label className="field" htmlFor="phone">{t('phoneLabel')}</label>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone}
              placeholder="98765 43210" onChange={(e) => setPhone(e.target.value)} />
            <p className="hint">{t('phoneNote')}</p>

            <label className="field" htmlFor="name">{t('nameLabel')}</label>
            <input id="name" type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </section>
        )}

        {error && <div className="error" role="alert">{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          {step > 0 && (
            <button type="button" className="btn ghost" style={{ flex: 1 }}
              onClick={() => { setError(''); setStep(step - 1); }}>{t('back')}</button>
          )}
          {step < 2 && (
            <button type="button" className="btn" style={{ flex: 1 }} onClick={next}>{t('next')}</button>
          )}
          {step === 2 && (
            <button type="button" className="btn danger" style={{ flex: 1 }} onClick={submit} disabled={submitting}>
              {submitting ? t('sending') : t('submit')}
            </button>
          )}
        </div>
    </div>
  );
}

export default function Report() {
  return (
    <PublicShell>
      <main className="pub-wrap">
        <ReportForm />
      </main>
    </PublicShell>
  );
}
