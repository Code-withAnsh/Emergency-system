import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import PublicShell from '../public/PublicShell.jsx';
import HospitalChoice from '../components/HospitalChoice.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useReveal } from '../hooks/useReveal.js';
import { api, DRILL_BOX } from '../lib/api.js';
import '../public/public.css';

const POLL_MS = 3000;
const ARRIVED_KM = 0.05; // within 50 m counts as arrived

export default function Track() {
  const { t, lang } = useI18n();
  const requestId = window.location.pathname.split('/track/')[1] || '';
  const [tr, setTr] = useState(null);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  useReveal([lang, Boolean(tr)]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api(`/api/reports/${encodeURIComponent(requestId)}`);
        if (!cancelled) { setTr(res.tracking); setError(''); }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [requestId, refreshKey]);

  if (error && !tr) {
    return (
      <PublicShell>
        <main className="pub-wrap">
          <h1>{t('notFoundTitle')}</h1>
          <p className="muted">{error}</p>
          <a className="btn ghost" href="/">{t('home')}</a>
        </main>
      </PublicShell>
    );
  }
  if (!tr) {
    return <PublicShell><main className="pub-wrap"><p className="muted">{t('loading')}</p></main></PublicShell>;
  }

  const arrived = Boolean(tr.unit) && tr.distanceKm !== null && tr.distanceKm <= ARRIVED_KM;
  const onWay = Boolean(tr.unit) && !arrived;
  const steps = [
    { label: t('tReceived'), done: true, now: !tr.unit },
    { label: tr.status === 'queued' ? t('tQueued') : t('tAssigned'), done: Boolean(tr.unit), now: tr.status === 'queued' },
    { label: t('tOnWay'), done: onWay || arrived, now: onWay },
    { label: t('tArrived'), done: arrived, now: arrived }
  ];
  const typeName = tr.unit?.type === 'ambulance' ? t('ambulance') : t('bike');

  return (
    <PublicShell>
      <main className="pub-wrap">
        <p className="muted" style={{ marginBottom: 0 }}>{t('reportId')}</p>
        <h1 style={{ marginTop: 2 }}>{tr.requestId}</h1>
        <span className={`tag ${tr.severity === 'critical' ? 'red' : 'green'}`}>
          {tr.severity === 'critical' ? t('critical') : t('minor')}
        </span>

        <section className="card reveal" aria-label={t('statusTitle')}>
          <h2>{t('statusTitle')}</h2>
          <ol className="timeline">
            {steps.map((s) => (
              <li key={s.label} className={`${s.done ? 'done' : ''} ${s.now ? 'now' : ''}`}>{s.label}</li>
            ))}
          </ol>
          {tr.queuePosition && <p className="hint">{t('queuePos', { n: tr.queuePosition })}</p>}
        </section>

        <section className="card reveal" aria-label={t('unitTitle')}>
          <h2>{t('unitTitle')}</h2>
          {tr.unit ? (
            <>
              <p className="muted" style={{ marginBottom: 0 }}>{typeName} · {tr.unit.id}</p>
              <div className="kv">
                <div><small>{t('distance')}</small><strong>{tr.distanceKm !== null ? `${tr.distanceKm} km` : '—'}</strong></div>
                <div><small>{t('eta')}</small><strong>{tr.etaMinutes !== null ? `${tr.etaMinutes} min` : '—'}</strong></div>
                <div><small>Speed</small><strong>{tr.unit.speedKmh ? `${tr.unit.speedKmh} km/h` : '—'}</strong></div>
              </div>
            </>
          ) : (
            <p className="muted">{t('noUnit')}</p>
          )}
        </section>

        <section className="card reveal" aria-label={t('mapTitle')}>
          <h2>{t('mapTitle')}</h2>
          <div className="map">
            <MapContainer
              center={[tr.incident.lat, tr.incident.lng]}
              zoom={14}
              minZoom={12}
              maxBounds={DRILL_BOX.bounds}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
              <CircleMarker center={[tr.incident.lat, tr.incident.lng]} radius={9}
                pathOptions={{ color: '#f43f5e', fillOpacity: 0.85 }}>
                <Tooltip permanent direction="top">{t('youAreHere')}</Tooltip>
              </CircleMarker>
              {tr.unit && (
                <>
                  <CircleMarker center={[tr.unit.lat, tr.unit.lng]} radius={9}
                    pathOptions={{ color: '#22d3ee', fillOpacity: 0.85 }}>
                    <Tooltip permanent direction="top">{tr.unit.id}</Tooltip>
                  </CircleMarker>
                  <Polyline positions={[[tr.unit.lat, tr.unit.lng], [tr.incident.lat, tr.incident.lng]]}
                    pathOptions={{ color: '#22d3ee', dashArray: '6 6' }} />
                </>
              )}
            </MapContainer>
          </div>
        </section>

        <HospitalChoice requestId={tr.requestId} tracking={tr} onChosen={() => setRefreshKey((k) => k + 1)} />

        <p className="hint" style={{ marginTop: 16 }}>{t('liveUpdate', { s: POLL_MS / 1000 })}</p>
      </main>
    </PublicShell>
  );
}
