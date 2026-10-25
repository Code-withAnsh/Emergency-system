import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';

const KEY = 'hw_intro_seen';
const DURATION_MS = 2900;

// 3-second opening: radar rings pulse, a map pin draws itself, the name rises.
// Shown once per browser session. Skipped for reduced motion, or on click or key.
export default function Intro() {
  const { t } = useI18n();
  const [show, setShow] = useState(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    try { return sessionStorage.getItem(KEY) !== '1'; } catch { return true; }
  });

  useEffect(() => {
    if (!show) return undefined;
    const done = () => {
      try { sessionStorage.setItem(KEY, '1'); } catch { /* keep going */ }
      setShow(false);
    };
    const id = setTimeout(done, DURATION_MS);
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') done(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(id); window.removeEventListener('keydown', onKey); };
  }, [show]);

  if (!show) return null;

  const skip = () => {
    try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <div className="intro" onClick={skip} role="presentation">
      <div className="intro-stage">
        <div className="radar" aria-hidden="true">
          <span className="ring r1" /><span className="ring r2" /><span className="ring r3" />
          <span className="sweep" />
          <svg className="intro-pin" viewBox="0 0 48 60" aria-hidden="true">
            <path pathLength="1" d="M24 2C12.4 2 3 11.3 3 22.8 3 38.2 24 58 24 58s21-19.8 21-35.2C45 11.3 35.6 2 24 2z" />
            <circle cx="24" cy="23" r="7" />
          </svg>
        </div>
        <p className="intro-brand">HackWave Emergency</p>
        <p className="intro-sub">{t('introSub')}</p>
      </div>
      <button type="button" className="intro-skip">{t('skipIntro')}</button>
    </div>
  );
}
