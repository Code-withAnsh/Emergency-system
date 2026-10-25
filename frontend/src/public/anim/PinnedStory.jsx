import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import CityCanvas from '../3d/CityCanvas.jsx';

gsap.registerPlugin(ScrollTrigger);

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Scrollytelling: the 3D incident stays pinned on the left while the steps scroll on the right.
// ScrollTrigger sets the active step and the 3D progress; each step's text is scrubbed in.
// Reduced motion: plain list, no pin, no 3D.
export default function PinnedStory({ items, label }) {
  const rootRef = useRef(null);
  const stepRefs = useRef([]);
  const progress = useRef(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduceMotion() || !rootRef.current) return undefined;
    const ctx = gsap.context(() => {
      // Whole story progress (0 to 1) drives the 3D scene
      ScrollTrigger.create({
        trigger: rootRef.current,
        start: 'top 60%',
        end: 'bottom 60%',
        onUpdate: (self) => { progress.current = self.progress; }
      });

      stepRefs.current.forEach((el, i) => {
        if (!el) return;
        // Text rises and fades in as the step reaches the middle of the screen
        gsap.fromTo(el.querySelector('.story-body'),
          { y: 70, opacity: 0.15 },
          {
            y: 0,
            opacity: 1,
            ease: 'none',
            scrollTrigger: { trigger: el, start: 'top 90%', end: 'top 40%', scrub: true }
          });
        // Thin meter in each card fills while that step is on screen
        gsap.fromTo(el.querySelector('.story-meter span'),
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: 'none',
            scrollTrigger: { trigger: el, start: 'top 70%', end: 'bottom 45%', scrub: true }
          });
        ScrollTrigger.create({
          trigger: el,
          start: 'top 55%',
          end: 'bottom 55%',
          onEnter: () => setActive(i),
          onEnterBack: () => setActive(i)
        });
      });
    }, rootRef);
    return () => ctx.revert();
  }, [items.length]);

  const reduce = reduceMotion();

  return (
    <div className="story" ref={rootRef}>
      {!reduce && (
        <div className="story-stage">
          <CityCanvas progressRef={progress} className="story-canvas" />
          <div className="story-caption" aria-live="polite">
            <small>{`${active + 1} / ${items.length}`}</small>
            <strong>{items[active].title}</strong>
          </div>
        </div>
      )}

      <ol className="story-steps" aria-label={label}>
        {items.map((it, i) => (
          <li
            key={it.title}
            ref={(el) => { stepRefs.current[i] = el; }}
            className={`story-step ${i === active ? 'on' : ''}`}
          >
            <div className="story-body">
              <div className="story-head">
                <span className="story-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <span className="story-badge">{i + 1} / {items.length}</span>
              </div>
              <h3>{it.title}</h3>
              <p>{it.body}</p>
              <div className="story-meter" aria-hidden="true"><span /></div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
