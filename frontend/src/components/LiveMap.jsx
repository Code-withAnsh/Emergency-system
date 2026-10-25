import './livemap.css';
import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Circle, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { DRILL_BOX } from '../lib/api.js';

// Real map (OpenStreetMap) for the authority console.
// Shows every citizen report at its real location, the units, the assigned routes,
// the active drill request and the spike zone. Works with any number of reports.

const COLORS = {
  critical: '#f43f5e',
  minor: '#f59e0b',
  ambulance: '#22d3ee',
  bike: '#34d399',
  stale: '#94a3b8',
  busy: '#fb7185'
};

// Keeps the view on the action: the selected report, or all reports, or the drill area
function FollowView({ reports, selected, units }) {
  const map = useMap();
  useEffect(() => {
    if (selected) {
      map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
      return;
    }
    const points = [];
    reports.forEach((r) => points.push([r.lat, r.lng]));
    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 14));
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    } else if (units.length === 0) {
      map.fitBounds(DRILL_BOX.bounds);
    }
    // Refit only when the set of reports or the selection changes, not on every unit move
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selected?.requestId, reports.length]);
  return null;
}

function ClickToRequest({ onMapClick }) {
  useMapEvents({
    click(e) {
      if (onMapClick) onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    }
  });
  return null;
}

export default function LiveMap({
  units = [],
  reports = [],
  selectedReportId = null,
  onSelectReport = null,
  selectedUnitId = null,
  onSelectUnit = null,
  activeRequest = null,
  spikeZone = null,
  onMapClick = null
}) {
  const selected = reports.find((r) => r.requestId === selectedReportId) || null;
  const reportMarkers = useRef({});

  // Open the label of the selected report (permanent prop does not update on an existing tooltip)
  useEffect(() => {
    Object.entries(reportMarkers.current).forEach(([id, marker]) => {
      if (id !== selectedReportId) marker.closeTooltip();
    });
    const m = selectedReportId ? reportMarkers.current[selectedReportId] : null;
    if (m) m.openTooltip();
  }, [selectedReportId, reports.length]);
  const unitById = new Map(units.map((u) => [u.id, u]));
  const counts = {
    critical: reports.filter((r) => r.severity === 'critical').length,
    minor: reports.filter((r) => r.severity === 'minor').length
  };

  return (
    <div className="livemap">
      <MapContainer
        center={DRILL_BOX.center}
        zoom={13}
        minZoom={11}
        maxBounds={DRILL_BOX.bounds}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <FollowView reports={reports} selected={selected} units={units} />
        {onMapClick && <ClickToRequest onMapClick={onMapClick} />}

        {spikeZone?.active && spikeZone.lat != null && (
          <Circle center={[spikeZone.lat, spikeZone.lng]} radius={(spikeZone.radiusKm || 1.5) * 1000}
            pathOptions={{ color: '#f59e0b', fillOpacity: 0.08, dashArray: '4 6' }} />
        )}

        {/* Routes from the assigned unit to each report */}
        {reports.map((r) => {
          const u = r.assignedUnitId ? unitById.get(r.assignedUnitId) : null;
          if (!u) return null;
          const isSel = r.requestId === selectedReportId;
          return (
            <Polyline key={`route-${r.requestId}`} positions={[[u.lat, u.lng], [r.lat, r.lng]]}
              pathOptions={{ color: '#22d3ee', weight: isSel ? 3 : 2, opacity: isSel ? 0.95 : 0.45, dashArray: isSel ? null : '6 6' }} />
          );
        })}

        {/* Units */}
        {units.map((u) => {
          const color = u.isStale ? COLORS.stale : u.status === 'busy' ? COLORS.busy : COLORS[u.type] || '#fff';
          const isSel = u.id === selectedUnitId;
          return (
            <CircleMarker key={u.id} center={[u.lat, u.lng]} radius={isSel ? 7 : 4}
              pathOptions={{ color: '#06202a', weight: 1, fillColor: color, fillOpacity: 0.95 }}
              eventHandlers={onSelectUnit ? { click: () => onSelectUnit(u) } : {}}>
              <Tooltip>{u.id} · {u.type} · {u.status}{u.source === 'phone' ? ' · PHONE' : ''}</Tooltip>
            </CircleMarker>
          );
        })}

        {/* Citizen reports: every one, at its real location */}
        {reports.map((r) => {
          const isSel = r.requestId === selectedReportId;
          const color = r.severity === 'critical' ? COLORS.critical : COLORS.minor;
          return (
            <CircleMarker key={r.requestId} ref={(el) => { if (el) reportMarkers.current[r.requestId] = el; }}
              center={[r.lat, r.lng]} radius={isSel ? 12 : 9}
              pathOptions={{ color: '#fff', weight: isSel ? 3 : 2, fillColor: color, fillOpacity: 0.9 }}
              eventHandlers={onSelectReport ? { click: () => onSelectReport(r.requestId) } : {}}>
              <Tooltip direction="top">
                {r.requestId} · {r.incidentType} · {r.peopleInjured} hurt
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* Active drill request from the dispatcher controls */}
        {activeRequest && (
          <CircleMarker center={[activeRequest.lat, activeRequest.lng]} radius={11}
            pathOptions={{ color: '#facc15', weight: 3, fillOpacity: 0 }}>
            <Tooltip>{activeRequest.id} · drill</Tooltip>
          </CircleMarker>
        )}
      </MapContainer>

      <div className="livemap-legend" aria-label="Legend">
        <span><i style={{ background: COLORS.critical }} /> Critical {counts.critical}</span>
        <span><i style={{ background: COLORS.minor }} /> Minor {counts.minor}</span>
        <span><i style={{ background: COLORS.ambulance }} /> Ambulance</span>
        <span><i style={{ background: COLORS.bike }} /> Bike</span>
        <span><i style={{ background: COLORS.busy }} /> Busy</span>
        <span><i style={{ background: COLORS.stale }} /> Stale GPS</span>
      </div>
    </div>
  );
}
