import { useEffect } from 'react';

// Cards and the hero follow the pointer with a soft light (CSS reads --gx / --gy).
// One listener on the document, so no per-element wiring. Mouse only, reduced motion off.
const SELECTOR = '.hero-full, .stat, .who-card, .report-side, .zoom-card, .story-body, .stair .bubble';

export function useGlow() {
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduce) return undefined;

    const onMove = (e) => {
      const el = e.target instanceof Element ? e.target.closest(SELECTOR) : null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--gx', `${e.clientX - r.left}px`);
      el.style.setProperty('--gy', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => document.removeEventListener('pointermove', onMove);
  }, []);
}
