import React, { useEffect, useRef, useState } from 'react';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Scroll-driven stack of cards. Scrolling moves through them one at a time:
// the active card zooms in to full size, the others shrink and fade away.
export default function ZoomScroll({ items }) {
  const wrap = useRef(null);
  const [p, setP] = useState(0);
  const reduce = reduceMotion();

  useEffect(() => {
    if (reduce || !wrap.current) return undefined;
    const update = () => {
      const el = wrap.current;
      const total = el.offsetHeight - window.innerHeight;
      const top = el.getBoundingClientRect().top;
      setP(total > 0 ? Math.min(1, Math.max(0, -top / total)) : 0);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [reduce, items.length]);

  if (reduce) {
    return (
      <div className="zoom-static">
        {items.map((it) => (
          <article key={it.title} className="zoom-card-static">
            <h3>{it.title}</h3><p className="muted">{it.body}</p>
          </article>
        ))}
      </div>
    );
  }

  const active = p * (items.length - 1);
  return (
    <div ref={wrap} className="zoom-wrap" style={{ height: `${items.length * 45 + 55}vh` }}>
      <div className="zoom-stage">
        {items.map((it, i) => {
          const d = i - active;
          const a = Math.min(Math.abs(d), 1);
          return (
            <article
              key={it.title}
              className="zoom-card"
              aria-hidden={Math.abs(d) > 0.5}
              style={{
                transform: `translateY(${d * 14}%) scale(${1 - 0.4 * a})`,
                opacity: 1 - 0.92 * a,
                zIndex: 10 - Math.round(Math.abs(d) * 10)
              }}
            >
              <span className="zoom-index">{String(i + 1).padStart(2, '0')}</span>
              <h3>{it.title}</h3>
              <p>{it.body}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
