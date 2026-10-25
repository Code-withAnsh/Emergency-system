import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api, DRILL_BOX } from '../lib/api.js';
import './hospital.css';

// Staff view for one patient: details, live ambulance position, speed and ETA on a map.
// Polls the server every 2 seconds.
const LIVE_MS = 2000;

const INCIDENT_LABEL = { accident: 'Accident', injury: 'Injury', illness: 'Illness', other: 'Other' };
const FLAG_LABEL = { notConscious: 'Not conscious', notBreathing: 'Not breathing', heavyBleeding: 'Heavy bleeding' };

function FitPoints({ points }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [36, 36], maxZoom: 16 });
    else if (points.length === 1) map.setView(points[0], 15);
    // Fit only when the set of points changes, not on every small movement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

function formatEta(min) {
  if (min == null) return '—';
  if (min === 0) return 'Arrived';
  const total = Math.round(min * 60);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

export default function HospitalDetail({ messageId, actions }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api(`/api/hospital/inbox/${encodeURIComponent(messageId)}/detail`);
        if (!cancelled) { setD(res.detail); setError(''); }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    const timer = setInterval(load, LIVE_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [messageId]);

  if (error && !d) return <div className="error" role="alert">{error}</div>;
  if (!d) return <p className="muted">Loading patient…</p>;

  const points = [];
  if (d.patient) points.push([d.patient.lat, d.patient.lng]);
  if (d.unit) points.push([d.unit.lat, d.unit.lng]);
  if (d.hospital?.location) points.push([d.hospital.location.lat, d.hospital.location.lng]);
  const patientPos = d.patient ? [d.patient.lat, d.patient.lng] : null;

  return (
    <div className="hd">
      <div className="hd-head">
        <span className={`hp-sev ${d.severity === 'critical' ? 'red' : 'green'}`}>
          {d.severity === 'critical' ? 'CRITICAL' : 'MINOR'}
        </span>
        <strong>{d.requestId}</strong>
        <span className="muted">{INCIDENT_LABEL[d.incidentType] || d.incidentType} · {d.peopleInjured} injured</span>
      </div>

      <div className="hd-live" role="list" aria-label="Live status">
        <div role="listitem"><small>Ambulance speed</small><strong>{d.unit ? `${d.unit.speedKmh} km/h` : '—'}</strong></div>
        <div role="listitem"><small>Distance</small><strong>{d.distanceKm != null ? `${d.distanceKm} km` : '—'}</strong></div>
        <div role="listitem"><small>Reaches patient in</small><strong className="hp-eta">{formatEta(d.etaMinutes)}</strong></div>
        <div role="listitem"><small>Unit</small><strong>{d.unit ? `${d.unit.id} · ${d.unit.status}` : 'Not assigned yet'}</strong></div>
      </div>

      <div className="hd-map" aria-label="Live map">
        {patientPos ? (
          <MapContainer center={patientPos} zoom={14} minZoom={11} maxBounds={DRILL_BOX.bounds}
            style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
            <FitPoints points={points} />
            <CircleMarker center={patientPos} radius={10} pathOptions={{ color: '#fff', weight: 2, fillColor: '#f43f5e', fillOpacity: 0.95 }}>
              <Tooltip permanent direction="top">Patient</Tooltip>
            </CircleMarker>
            {d.unit && (
              <>
                <CircleMarker center={[d.unit.lat, d.unit.lng]} radius={9} pathOptions={{ color: '#06202a', weight: 1, fillColor: '#22d3ee', fillOpacity: 0.95 }}>
                  <Tooltip permanent direction="top">{d.unit.id} · {d.unit.speedKmh} km/h</Tooltip>
                </CircleMarker>
                <Polyline positions={[[d.unit.lat, d.unit.lng], patientPos]}
                  pathOptions={{ color: '#22d3ee', weight: 3, dashArray: '6 6' }} />
              </>
            )}
            {d.hospital?.location && (
              <>
                <CircleMarker center={[d.hospital.location.lat, d.hospital.location.lng]} radius={9}
                  pathOptions={{ color: '#fff', weight: 2, fillColor: '#10b981', fillOpacity: 0.95 }}>
                  <Tooltip permanent direction="top">{d.hospital.name}</Tooltip>
                </CircleMarker>
                <Polyline positions={[patientPos, [d.hospital.location.lat, d.hospital.location.lng]]}
                  pathOptions={{ color: '#10b981', weight: 2, opacity: 0.6 }} />
              </>
            )}
          </MapContainer>
        ) : (
          <p className="muted">No location for this patient.</p>
        )}
      </div>
      <p className="hint">Map: red = patient, cyan = ambulance, green = your hospital. Live every 2 seconds.</p>

      <div className="hd-facts">
        <div><small>Landmark</small><strong>{d.landmark || '—'}</strong></div>
        <div><small>Scene safe</small><strong>{d.isSafe ? 'Yes' : 'No'}</strong></div>
        <div><small>Caller phone</small><strong>ending {d.phoneLast4 || '—'}</strong></div>
        <div><small>Red flags</small><strong>{d.redFlags.length ? d.redFlags.map((f) => FLAG_LABEL[f] || f).join(', ') : 'None'}</strong></div>
      </div>
      {d.description && <p className="hd-desc"><small>Caller's words</small>{d.description}</p>}

      {actions}
    </div>
  );
}
