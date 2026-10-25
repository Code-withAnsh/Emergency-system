import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';

const SCENE_MS = 2000; // 6 scenes x 2 s = 12 s loop
const SCENES = 6;

// A phone that plays the whole flow: report, pin, scoring, assignment, arrival.
// Plays by itself (12 s loop). Pause button and dots let the visitor control it.
export default function FlowStory() {
  const { t } = useI18n();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(!reduce);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setScene((s) => (s + 1) % SCENES), SCENE_MS);
    return () => clearInterval(id);
  }, [playing]);

  const captions = [t('flowS1'), t('flowS2'), t('flowS3'), t('flowS4'), t('flowS5'), t('flowS6')];

  return (
    <div className="flow">
      <div className="phone-frame" aria-hidden="true">
        <div className="phone-notch" />
        <div className="phone-body">
          <span className="drill-badge">{t('flowBadge')}</span>

          {/* 1 report */}
          <div className={`scene s1 ${scene === 0 ? 'on' : ''}`}>
            <div className="form-line"><span className="typing">bike se gir gaya, khoon</span></div>
            <div className="chip-red">CRITICAL</div>
            <div className="fake-btn">Report bhejein</div>
          </div>

          {/* 2 pin */}
          <div className={`scene s2 ${scene === 1 ? 'on' : ''}`}>
            <div className="mini-grid">
              <span className="pin-drop" />
            </div>
          </div>

          {/* 3 scoring */}
          <div className={`scene s3 ${scene === 2 ? 'on' : ''}`}>
            <div className="score-row r1"><b>AMB-17</b><span>1.3 min</span></div>
            <div className="score-row r2"><b>AMB-07</b><span>2.1 min</span></div>
            <div className="score-row r3 busy"><b>BIKE-25</b><span>busy</span></div>
          </div>

          {/* 4 assigned */}
          <div className={`scene s4 ${scene === 3 ? 'on' : ''}`}>
            <div className="assign-card">
              <small>Assigned</small>
              <strong>AMB-17</strong>
              <p>Nearest unit lost: busy on another call</p>
            </div>
          </div>

          {/* 5 moving */}
          <div className={`scene s5 ${scene === 4 ? 'on' : ''}`}>
            <div className="mini-grid">
              <span className="unit-move" />
              <span className="pin-static" />
            </div>
            <p className="eta">ETA 1.3 min</p>
          </div>

          {/* 6 arrived */}
          <div className={`scene s6 ${scene === 5 ? 'on' : ''}`}>
            <div className="tick">✓</div>
            <p>Arrived</p>
            <small>Hospital prepared (dummy)</small>
          </div>
        </div>
      </div>

      <div className="flow-side">
        <h3>{t('flowTitle')}</h3>
        <p className="muted">{t('flowSub')}</p>
        <p className="flow-caption" aria-live="polite">{captions[scene]}</p>
        <div className="flow-controls">
          <button type="button" className="btn ghost small" onClick={() => setPlaying((p) => !p)}>
            {playing ? t('flowPlay') : t('flowResume')}
          </button>
          <div className="flow-dots" role="group" aria-label="Scenes">
            {captions.map((c, i) => (
              <button key={c} type="button" aria-label={`${i + 1}: ${c}`}
                className={i === scene ? 'on' : ''} onClick={() => { setScene(i); setPlaying(false); }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
