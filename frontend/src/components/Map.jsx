import { useState, useMemo } from 'react';

// Bhopal coordinate bounding box (Center: 23.2599°N, 77.4126°E, ±0.06°)
const BOUNDS = {
  minLat: 23.1999,
  maxLat: 23.3199,
  minLng: 77.3526,
  maxLng: 77.4726
};

// Key landmarks inside the Bhopal box for civic dispatch context
const LANDMARKS = [
  { name: 'Upper Lake (Bada Talab)', lat: 23.246, lng: 77.368, type: 'water' },
  { name: 'Lower Lake', lat: 23.250, lng: 77.404, type: 'water' },
  { name: 'Bhopal Jn', lat: 23.267, lng: 77.412, type: 'transit' },
  { name: 'MP Nagar Hub', lat: 23.232, lng: 77.433, type: 'civic' },
  { name: 'AIIMS Bhopal', lat: 23.208, lng: 77.460, type: 'hospital' },
  { name: 'Arera Hills', lat: 23.245, lng: 77.420, type: 'civic' },
  { name: 'Shahpura Lake', lat: 23.212, lng: 77.424, type: 'water' }
];

function latLngToSvg(lat, lng, width = 1000, height = 750) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * width;
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * height;
  return { x, y };
}

function svgToLatLng(x, y, width = 1000, height = 750) {
  const lng = BOUNDS.minLng + (x / width) * (BOUNDS.maxLng - BOUNDS.minLng);
  const lat = BOUNDS.maxLat - (y / height) * (BOUNDS.maxLat - BOUNDS.minLat);
  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6))
  };
}

export default function Map({
  units = [],
  onSelectUnit,
  selectedUnitId,
  activeRequest = null,
  spikeZone = null,
  onMapClick = null
}) {
  const [hoveredUnit, setHoveredUnit] = useState(null);
  const [filterType, setFilterType] = useState('all'); // all, ambulance, bike, stale

  const width = 1000;
  const height = 750;

  const filteredUnits = useMemo(() => {
    if (filterType === 'all') return units;
    if (filterType === 'ambulance') return units.filter((u) => u.type === 'ambulance');
    if (filterType === 'bike') return units.filter((u) => u.type === 'bike');
    if (filterType === 'stale') return units.filter((u) => u.isStale);
    if (filterType === 'busy') return units.filter((u) => u.status === 'busy');
    return units;
  }, [units, filterType]);

  const activeUnit = useMemo(() => {
    return units.find((u) => u.id === selectedUnitId) || hoveredUnit;
  }, [units, selectedUnitId, hoveredUnit]);

  // Request pin position
  const requestPos = useMemo(() => {
    if (!activeRequest?.lat || !activeRequest?.lng) return null;
    return latLngToSvg(activeRequest.lat, activeRequest.lng, width, height);
  }, [activeRequest, width, height]);

  // Assigned unit position for connecting vector
  const assignedUnit = useMemo(() => {
    if (!activeRequest?.ranking?.chosen?.id) return null;
    return units.find((u) => u.id === activeRequest.ranking.chosen.id);
  }, [activeRequest, units]);

  const assignedPos = useMemo(() => {
    if (!assignedUnit) return null;
    return latLngToSvg(assignedUnit.lat, assignedUnit.lng, width, height);
  }, [assignedUnit, width, height]);

  // Spike zone position and pixel radius
  const spikeData = useMemo(() => {
    if (!spikeZone?.active || !spikeZone?.lat || !spikeZone?.lng) return null;
    const center = latLngToSvg(spikeZone.lat, spikeZone.lng, width, height);
    // 1.5 km out of ~13.2 km width = ~114 px
    const radiusPx = 114;
    return { ...center, radiusPx };
  }, [spikeZone, width, height]);

  const handleSvgClick = (e) => {
    if (!onMapClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * width;
    const clickY = ((e.clientY - rect.top) / rect.height) * height;
    const coords = svgToLatLng(clickX, clickY, width, height);
    onMapClick(coords);
  };

  return (
    <div className="map-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Top Map Toolbar & Mandatory 60 Simulated Units label */}
      <div className="map-header-bar">
        <div className="map-title-group">
          <span className="live-radar-dot" title="Live SSE Feed Active" />
          <span className="simulated-badge">60 simulated units</span>
          <span className="box-coord-label">Bhopal Operations Box (13km × 13km)</span>
          {spikeZone?.active && (
            <span className="spike-active-indicator">
              ⚡ SPIKE ACTIVE ({spikeZone.remainingSeconds}s)
            </span>
          )}
        </div>

        {/* Filter Chips */}
        <div className="map-filter-group" role="tablist" aria-label="Unit filter">
          <button
            type="button"
            className={`filter-btn ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            All ({units.length})
          </button>
          <button
            type="button"
            className={`filter-btn ${filterType === 'ambulance' ? 'active' : ''}`}
            onClick={() => setFilterType('ambulance')}
          >
            Ambulances ({units.filter((u) => u.type === 'ambulance').length})
          </button>
          <button
            type="button"
            className={`filter-btn ${filterType === 'bike' ? 'active' : ''}`}
            onClick={() => setFilterType('bike')}
          >
            Bikes ({units.filter((u) => u.type === 'bike').length})
          </button>
          <button
            type="button"
            className={`filter-btn warning ${filterType === 'stale' ? 'active' : ''}`}
            onClick={() => setFilterType('stale')}
          >
            Stale GPS ({units.filter((u) => u.isStale).length})
          </button>
        </div>
      </div>

      {/* SVG Canvas Map */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="map-svg"
        preserveAspectRatio="xMidYMid meet"
        role="region"
        aria-label="Interactive map showing 60 simulated emergency units in Bhopal"
        onClick={handleSvgClick}
        style={{ cursor: onMapClick ? 'crosshair' : 'default' }}
      >
        <defs>
          {/* Subtle grid pattern */}
          <pattern id="gridPattern" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="1" />
          </pattern>
          {/* Unit glow filters */}
          <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#06b6d4" floodOpacity="0.8" />
          </filter>
          <filter id="glow-emerald" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#10b981" floodOpacity="0.8" />
          </filter>
          <filter id="glow-amber" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f59e0b" floodOpacity="0.9" />
          </filter>
          <filter id="glow-busy" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f43f5e" floodOpacity="0.9" />
          </filter>
          <filter id="glow-pin" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#dc2626" floodOpacity="0.95" />
          </filter>
        </defs>

        {/* Map Background Grid */}
        <rect width={width} height={height} fill="#0d1424" />
        <rect width={width} height={height} fill="url(#gridPattern)" />

        {/* Geographic Water Landmarks */}
        <g className="map-landmarks" opacity="0.6">
          <path
            d="M 80 340 C 130 300, 240 310, 290 350 C 320 370, 270 430, 200 440 C 120 450, 70 380, 80 340 Z"
            fill="rgba(14, 116, 144, 0.25)"
            stroke="rgba(6, 182, 212, 0.3)"
            strokeWidth="1.5"
          />
          <text x="180" y="375" fill="rgba(6, 182, 212, 0.5)" fontSize="11" fontFamily="sans-serif" textAnchor="middle">
            Bada Talab (Upper Lake)
          </text>

          <ellipse
            cx="440"
            cy="365"
            rx="45"
            ry="25"
            fill="rgba(14, 116, 144, 0.2)"
            stroke="rgba(6, 182, 212, 0.25)"
            strokeWidth="1.2"
          />
          <text x="440" y="370" fill="rgba(6, 182, 212, 0.5)" fontSize="9" fontFamily="sans-serif" textAnchor="middle">
            Chhota Talab
          </text>
        </g>

        {/* Civic Landmark Labels */}
        <g className="map-civic-nodes">
          {LANDMARKS.filter((l) => l.type !== 'water').map((lm) => {
            const pos = latLngToSvg(lm.lat, lm.lng, width, height);
            return (
              <g key={lm.name} transform={`translate(${pos.x}, ${pos.y})`}>
                <circle r="3" fill="rgba(255, 255, 255, 0.35)" />
                <text x="6" y="3" fill="rgba(148, 163, 184, 0.5)" fontSize="9.5" fontFamily="sans-serif">
                  {lm.name}
                </text>
              </g>
            );
          })}
        </g>

        {/* Latitude and Longitude Grid Tick Lines */}
        <g className="map-coords" opacity="0.35" stroke="rgba(255, 255, 255, 0.1)" strokeDasharray="3 4">
          <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} />
          <line x1="0" y1={height * 0.50} x2={width} y2={height * 0.50} />
          <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} />
          <line x1={width * 0.25} y1="0" x2={width * 0.25} y2={height} />
          <line x1={width * 0.50} y1="0" x2={width * 0.50} y2={height} />
          <line x1={width * 0.75} y1="0" x2={width * 0.75} y2={height} />
        </g>

        {/* Demand Spike Zone (1.5 km Radius Overlay) */}
        {spikeData && (
          <g className="spike-zone-overlay" transform={`translate(${spikeData.x}, ${spikeData.y})`}>
            {/* Shaded translucent circular impact area */}
            <circle
              r={spikeData.radiusPx}
              fill="rgba(245, 158, 11, 0.18)"
              stroke="#f59e0b"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              className="spike-pulsing-circle"
            />
            {/* Inner Core */}
            <circle r="8" fill="#f59e0b" opacity="0.8" />
            <circle r="4" fill="#ffffff" />
            <text
              x="0"
              y="-12"
              textAnchor="middle"
              fill="#f59e0b"
              fontSize="11"
              fontWeight="800"
              letterSpacing="0.05em"
              style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}
            >
              SPIKE CONGESTION ZONE (1.5km • +1m)
            </text>
          </g>
        )}

        {/* Assigned Route Vector Line */}
        {assignedPos && requestPos && (
          <g className="assigned-route-vector">
            <line
              x1={assignedPos.x}
              y1={assignedPos.y}
              x2={requestPos.x}
              y2={requestPos.y}
              stroke="#06b6d4"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              className="route-dash-animate"
              opacity="0.85"
            />
          </g>
        )}

        {/* Drill Emergency Request Pin */}
        {requestPos && (
          <g
            className="incident-pin-group"
            transform={`translate(${requestPos.x}, ${requestPos.y})`}
            filter="url(#glow-pin)"
          >
            {/* Outer Pulse Waves */}
            <circle
              r="22"
              fill="none"
              stroke={activeRequest.severity === 'critical' ? '#ef4444' : '#f59e0b'}
              strokeWidth="2"
              className="incident-pulse-ring"
            />
            <circle
              r="14"
              fill="none"
              stroke={activeRequest.severity === 'critical' ? '#ef4444' : '#f59e0b'}
              strokeWidth="2"
              opacity="0.8"
            />
            {/* Pin Target Marker */}
            <circle
              r="7"
              fill={activeRequest.severity === 'critical' ? '#ef4444' : '#f59e0b'}
              stroke="#ffffff"
              strokeWidth="2"
            />
            <circle r="2" fill="#ffffff" />
            {/* Incident Tag */}
            <g transform="translate(0, -18)">
              <rect
                x="-42"
                y="-12"
                width="84"
                height="16"
                rx="4"
                fill="rgba(15, 23, 42, 0.95)"
                stroke={activeRequest.severity === 'critical' ? '#ef4444' : '#f59e0b'}
                strokeWidth="1.2"
              />
              <text
                x="0"
                y="0"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="8.5"
                fontWeight="800"
                fontFamily="JetBrains Mono, monospace"
              >
                {activeRequest.id} ({activeRequest.severity.toUpperCase()})
              </text>
            </g>
          </g>
        )}

        {/* Units Layer */}
        <g className="map-units-layer">
          {filteredUnits.map((unit) => {
            const { x, y } = latLngToSvg(unit.lat, unit.lng, width, height);
            const isAmbulance = unit.type === 'ambulance';
            const isBusy = unit.status === 'busy';
            const isStale = unit.isStale;
            const isSelected = selectedUnitId === unit.id;
            const isChosen = activeRequest?.ranking?.chosen?.id === unit.id;
            const isHovered = hoveredUnit?.id === unit.id;

            // Color scheme based on unit type and state
            let baseColor = isAmbulance ? '#06b6d4' : '#10b981';
            let filterId = isAmbulance ? 'url(#glow-cyan)' : 'url(#glow-emerald)';

            if (isChosen) {
              baseColor = '#38bdf8'; // bright light cyan
            } else if (isBusy) {
              baseColor = '#f43f5e';
              filterId = 'url(#glow-busy)';
            } else if (isStale) {
              baseColor = '#f59e0b';
              filterId = 'url(#glow-amber)';
            }

            return (
              <g
                key={unit.id}
                transform={`translate(${x}, ${y})`}
                className={`unit-marker ${isBusy ? 'busy' : ''} ${isStale ? 'stale' : ''} ${isSelected ? 'selected' : ''}`}
                style={{ cursor: 'pointer', transition: 'transform 0.8s ease-out' }}
                onMouseEnter={() => setHoveredUnit(unit)}
                onMouseLeave={() => setHoveredUnit(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectUnit && onSelectUnit(unit);
                }}
                tabIndex="0"
                role="button"
                aria-label={`Unit ${unit.id}, ${unit.type}, ${unit.status}, GPS age ${unit.gpsAge}s`}
              >
                {/* Active Selection / Chosen Halo */}
                {(isSelected || isChosen || isHovered) && (
                  <circle
                    r="16"
                    fill="none"
                    stroke={isChosen ? '#38bdf8' : baseColor}
                    strokeWidth="2.5"
                    strokeDasharray={isChosen ? 'none' : '4 2'}
                    className="spin-ring"
                    opacity="0.9"
                  />
                )}

                {/* Stale Warning Ring */}
                {isStale && !isSelected && !isChosen && (
                  <circle
                    r="13"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    opacity="0.75"
                  />
                )}

                {/* Marker Body */}
                {isAmbulance ? (
                  <g filter={filterId}>
                    <rect
                      x="-8"
                      y="-8"
                      width="16"
                      height="16"
                      rx="3.5"
                      fill={baseColor}
                      stroke="#ffffff"
                      strokeWidth={isSelected || isChosen ? '2.5' : '1'}
                    />
                    <path d="M -4 0 L 4 0 M 0 -4 L 0 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                  </g>
                ) : (
                  <g filter={filterId}>
                    <polygon
                      points="0,-9 9,0 0,9 -9,0"
                      fill={baseColor}
                      stroke="#ffffff"
                      strokeWidth={isSelected || isChosen ? '2.5' : '1'}
                    />
                    <circle cx="0" cy="0" r="2.5" fill="#ffffff" />
                  </g>
                )}

                {/* Unit ID label */}
                <text
                  x="0"
                  y="17"
                  textAnchor="middle"
                  fill="#f1f5f9"
                  fontSize="8.5"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
                >
                  {unit.id}
                </text>

                {/* Phone unit tag: real phone on the drill map */}
                {unit.source === 'phone' && (
                  <text
                    x="0"
                    y="-16"
                    textAnchor="middle"
                    fill="#facc15"
                    fontSize="7"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {unit.isDemoLocation ? 'PHONE (demo)' : 'PHONE'}
                  </text>
                )}

                {/* Stale Icon Badge */}
                {isStale && (
                  <g transform="translate(6, -10)">
                    <circle r="4.5" fill="#f59e0b" />
                    <text x="0" y="3" textAnchor="middle" fill="#000" fontSize="7" fontWeight="bold">!</text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* Map Legend */}
        <g transform="translate(16, 640)" className="map-legend">
          <rect width="250" height="96" rx="8" fill="rgba(10, 16, 30, 0.85)" stroke="rgba(255, 255, 255, 0.1)" />
          <text x="12" y="20" fill="#94a3b8" fontSize="11" fontWeight="700" letterSpacing="0.05em">
            FLEET CLASSIFICATION & STATUS
          </text>
          <rect x="14" y="30" width="10" height="10" rx="2" fill="#06b6d4" />
          <text x="30" y="39" fill="#f1f5f9" fontSize="10">Ambulance (40 km/h)</text>
          <polygon points="19,48 24,53 19,58 14,53" fill="#10b981" />
          <text x="30" y="56" fill="#f1f5f9" fontSize="10">First Responder Bike (25 km/h)</text>
          <circle cx="19" cy="71" r="5" fill="#f59e0b" />
          <text x="30" y="74" fill="#f59e0b" fontSize="10">Stale GPS (&gt;20s age)</text>
          <circle cx="140" cy="71" r="5" fill="#f43f5e" />
          <text x="152" y="74" fill="#f43f5e" fontSize="10">Busy (Assigned)</text>
        </g>

        {/* Compass & Scale */}
        <g transform={`translate(${width - 120}, 660)`} className="map-compass">
          <rect width="104" height="76" rx="8" fill="rgba(10, 16, 30, 0.85)" stroke="rgba(255, 255, 255, 0.1)" />
          <path d="M 28 32 L 24 46 L 28 42 L 32 46 Z" fill="#06b6d4" />
          <text x="28" y="22" textAnchor="middle" fill="#06b6d4" fontSize="11" fontWeight="bold">N</text>
          <text x="64" y="30" fill="#94a3b8" fontSize="9">Scale</text>
          <line x1="50" y1="42" x2="95" y2="42" stroke="#f1f5f9" strokeWidth="2" />
          <text x="72" y="56" textAnchor="middle" fill="#f1f5f9" fontSize="9">~2 km</text>
        </g>
      </svg>

      {/* Floating Active/Hovered Unit Inspector Card */}
      {activeUnit && (
        <div className="unit-inspector-card" role="dialog" aria-label="Selected Unit Telemetry">
          <div className="inspector-header">
            <span className={`type-tag ${activeUnit.type}`}>
              {activeUnit.type === 'ambulance' ? '🚑 Ambulance' : '🏍️ First Responder Bike'}
            </span>
            <span className="unit-id">{activeUnit.id}</span>
          </div>

          <div className="inspector-body">
            <div className="inspector-row">
              <span className="label">Status:</span>
              <span className={`value status-${activeUnit.status}`}>
                {activeUnit.status.toUpperCase()}
                {activeUnit.status === 'busy' && ` (${activeUnit.busyRemainingSeconds}s left)`}
              </span>
            </div>
            <div className="inspector-row">
              <span className="label">GPS Freshness:</span>
              <span className={`value ${activeUnit.isStale ? 'text-amber' : 'text-emerald'}`}>
                {activeUnit.gpsAge}s age {activeUnit.isStale ? '⚠️ STALE' : '✓ FRESH'}
              </span>
            </div>
            <div className="inspector-row">
              <span className="label">Speed:</span>
              <span className="value">{activeUnit.speed} km/h</span>
            </div>
            <div className="inspector-row">
              <span className="label">Coordinates:</span>
              <span className="value font-mono">{activeUnit.lat.toFixed(4)}°N, {activeUnit.lng.toFixed(4)}°E</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
