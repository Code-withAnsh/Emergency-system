import React, { useEffect, useRef } from 'react';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Bubbles climb like stairs: each one zooms in and steps one notch further
// right, in order, as it scrolls into view. Plain divs, not cards.
export default function Stairs({ items, label }) {
  const refs = useRef([]);

  useEffect(() => {
    const els = refs.current.filter(Boolean);
    if (reduceMotion() || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }
    }, { threshold: 0.35 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  return (
    <ol className="stairs" aria-label={label}>
      {items.map((it, i) => (
        <li key={it.title} ref={(el) => { refs.current[i] = el; }} className="stair" style={{ '--i': i }}>
          <div className="bubble">
            <span className="bubble-num">{i + 1}</span>
            <div>
              <h3>{it.title}</h3>
              <p>{it.body}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
