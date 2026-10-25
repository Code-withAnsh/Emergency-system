import React, { useEffect, useRef } from 'react';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Three.js city canvas. Three is loaded on demand, so the first paint is not delayed.
// autoplay: plays the incident story on a loop and follows the pointer (hero background).
// progressRef: ref holding 0 to 1, read every frame (pinned story, driven by scroll).
// Without WebGL, or with reduced motion, it draws one still frame or nothing.
export default function CityCanvas({ progressRef = null, autoplay = false, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const reduce = reduceMotion();
    const pointer = { x: 0, y: 0 };
    const onPointer = (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    let cancelled = false;
    let api = null;
    let io = null;
    let ro = null;

    import('./cityScene.js').then(({ createCity }) => {
      if (cancelled) return;
      api = createCity(canvas, {
        reduce,
        autoplay,
        getProgress: () => (progressRef ? progressRef.current : 0.5),
        pointer
      });
      if (!api) return;

      const parent = canvas.parentElement;
      const fit = () => {
        if (parent.clientWidth && parent.clientHeight) api.resize(parent.clientWidth, parent.clientHeight);
      };
      fit();
      ro = new ResizeObserver(fit);
      ro.observe(parent);

      if (reduce) {
        api.renderOnce();
        return;
      }
      // Render only while the canvas is on screen
      io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? api.start() : api.stop()));
      io.observe(canvas);
    }).catch(() => { /* chunk failed to load: the CSS background stays */ });

    window.addEventListener('pointermove', onPointer, { passive: true });

    return () => {
      cancelled = true;
      io?.disconnect();
      ro?.disconnect();
      window.removeEventListener('pointermove', onPointer);
      api?.dispose();
    };
  }, [autoplay, progressRef]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
