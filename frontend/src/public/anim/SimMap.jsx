import React from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';

// Hero simulation: one request every 10s. Free units roam, the nearest unit is
// busy (crossed out), and the best unit drives to the pin. Looping SVG animation.
export default function SimMap() {
  const { t } = useI18n();
  return (
    <div className="sim" role="img" aria-label={t('simCaption')}>
      <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" className="sim-svg">
        <defs>
          <linearGradient id="simBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#15263f" /><stop offset="1" stopColor="#0b1220" />
          </linearGradient>
        </defs>
        <rect width="400" height="260" fill="url(#simBg)" />
        {/* blocks and lake for a city feel */}
        {[[20, 90, 70, 40], [150, 80, 90, 36], [300, 20, 70, 30], [40, 20, 50, 28], [300, 170, 80, 50]].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="4" fill="#1a2b44" opacity="0.7" />
        ))}
        <ellipse cx="70" cy="222" rx="34" ry="18" fill="#0b3142" />
        {/* roads */}
        <g stroke="#2b3f5e" strokeWidth="9" fill="none" strokeLinecap="round">
          <path id="r1" d="M0 60 L400 60" />
          <path id="r2" d="M120 0 L120 260" />
          <path id="r3" d="M0 190 Q200 140 400 200" />
          <path id="r4" d="M270 0 Q300 130 260 260" />
        </g>
        <g stroke="#34496b" strokeWidth="1.5" fill="none" strokeDasharray="4 6">
          <path d="M0 60 L400 60" /><path d="M120 0 L120 260" />
        </g>

        {/* free units roaming */}
        <circle r="4" fill="#34d399"><animateMotion dur="18s" repeatCount="indefinite"><mpath href="#r1" /></animateMotion></circle>
        <circle r="4" fill="#34d399"><animateMotion dur="22s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear"><mpath href="#r3" /></animateMotion></circle>
        <circle r="4" fill="#34d399"><animateMotion dur="20s" repeatCount="indefinite"><mpath href="#r4" /></animateMotion></circle>
        <circle r="4" fill="#34d399"><animateMotion dur="16s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear"><mpath href="#r2" /></animateMotion></circle>

        {/* planned route for the chosen ambulance */}
        <path id="route" d="M60 60 L180 60 L180 130 L300 130" fill="none" stroke="#22d3ee" strokeWidth="2.5"
          strokeDasharray="1" pathLength="1" strokeLinecap="round">
          <animate attributeName="stroke-dashoffset" values="1;1;0;0" keyTimes="0;0.15;0.5;1" dur="10s" repeatCount="indefinite" />
        </path>

        {/* nearest unit: busy, crossed out */}
        <g>
          <circle cx="262" cy="104" r="6" fill="#64748b">
            <animate attributeName="opacity" values="0;1;1;1" keyTimes="0;0.1;0.8;1" dur="10s" repeatCount="indefinite" />
          </circle>
          <g stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round">
            <line x1="255" y1="97" x2="269" y2="111"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.75;0.85" dur="10s" repeatCount="indefinite" /></line>
            <line x1="269" y1="97" x2="255" y2="111"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.75;0.85" dur="10s" repeatCount="indefinite" /></line>
          </g>
        </g>

        {/* ambulance driving the route */}
        <circle r="6" fill="#22d3ee" stroke="#06202a" strokeWidth="1.5">
          <animateMotion dur="10s" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;0.15;0.5;1" calcMode="linear">
            <mpath href="#route" />
          </animateMotion>
        </circle>

        {/* incident pin drops in, then pulses */}
        <g transform="translate(300 130)">
          <circle r="0" fill="#f43f5e" stroke="#fff" strokeWidth="2">
            <animate attributeName="r" values="0;7;7;7" keyTimes="0;0.05;0.9;1" dur="10s" repeatCount="indefinite" />
          </circle>
          <circle r="7" fill="none" stroke="#f43f5e" strokeWidth="2" opacity="0">
            <animate attributeName="r" values="7;22" keyTimes="0;1" dur="2s" begin="0.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0" keyTimes="0;1" dur="2s" begin="0.6s" repeatCount="indefinite" />
          </circle>
        </g>
      </svg>

      <span className="sim-chip chip-1">{t('simStep1')}</span>
      <span className="sim-chip chip-2">{t('simStep2')}</span>
      <span className="sim-chip chip-3">{t('simStep3')}</span>
      <span className="map-caption">{t('simCaption')}</span>
    </div>
  );
}
