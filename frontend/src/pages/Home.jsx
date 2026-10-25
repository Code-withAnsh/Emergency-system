import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import PublicShell from '../public/PublicShell.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useReveal } from '../hooks/useReveal.js';
import { useGlow } from '../hooks/useGlow.js';
import { useSmoothScroll } from '../hooks/useSmoothScroll.js';
import { ReportForm } from './Report.jsx';
import { api } from '../lib/api.js';
import '../public/public.css';
import '../public/home.css';
import '../public/anim.css';
import '../public/landing.css';
import SimMap from '../public/anim/SimMap.jsx';
import ZoomScroll from '../public/anim/ZoomScroll.jsx';
import Stairs from '../public/anim/Stairs.jsx';
import FlowStory from '../public/anim/FlowStory.jsx';
import PinnedStory from '../public/anim/PinnedStory.jsx';
import CityCanvas from '../public/3d/CityCanvas.jsx';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Each word is its own span so the hero title can rise word by word
function SplitWords({ text }) {
  return text.split(' ').map((word, i) => (
    <span className="w" key={`${word}-${i}`} aria-hidden="true">{word}{' '}</span>
  ));
}

// Thin bar at the top that fills as the visitor scrolls
function ScrollProgress({ label }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><span style={{ width: `${pct}%` }} /></div>;
}

// Counts up to the target when it scrolls into view (instant with reduced motion)
function CountUp({ to, suffix = '' }) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (to == null) return undefined;
    if (reduceMotion()) { setValue(to); return undefined; }
    let raf;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - start) / 1200);
        setValue(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{to == null ? '—' : `${value}${suffix}`}</span>;
}

export default function Home() {
  const { t, lang } = useI18n();
  const [bench, setBench] = useState(null);
  const [atReport, setAtReport] = useState(false);
  const heroRef = useRef(null);
  useReveal([lang, bench]);
  useGlow();
  useSmoothScroll();

  // Hero entrance: kicker, word-by-word title, lead and buttons, then the map panel. Buttons follow the pointer slightly.
  useLayoutEffect(() => {
    const root = heroRef.current;
    if (!root || reduceMotion()) return undefined;
    const ctx = gsap.context(() => {
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from(root.querySelectorAll('.kicker'), { y: 18, opacity: 0, duration: 0.6 })
        .from(root.querySelectorAll('.w'), { y: '0.7em', opacity: 0, duration: 0.8, stagger: 0.045 }, '-=0.25')
        .from(root.querySelectorAll('.lead, .cta-row'), { y: 22, opacity: 0, duration: 0.7, stagger: 0.12 }, '-=0.5')
        .from(root.querySelectorAll('.hero-visual'), { y: 50, opacity: 0, scale: 0.96, duration: 1.1, ease: 'expo.out' }, '-=0.9');

      root.querySelectorAll('.cta-row .btn').forEach((btn) => {
        const xTo = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3.out' });
        const yTo = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3.out' });
        btn.addEventListener('pointermove', (e) => {
          const r = btn.getBoundingClientRect();
          xTo((e.clientX - r.left - r.width / 2) * 0.18);
          yTo((e.clientY - r.top - r.height / 2) * 0.18);
        });
        btn.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
      });
    }, root);
    return () => ctx.revert();
  }, []);

  // Hide the sticky button once the report form is on screen
  useEffect(() => {
    const el = document.getElementById('report');
    if (!el) return undefined;
    const io = new IntersectionObserver(([entry]) => setAtReport(entry.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    api('/api/stats/benchmark').then(setBench).catch(() => setBench(null));
  }, []);

  const onTilt = (e) => {
    if (reduceMotion()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    e.currentTarget.style.setProperty('--ry', `${(x * 12).toFixed(2)}deg`);
    e.currentTarget.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
  };
  const onTiltReset = (e) => {
    e.currentTarget.style.setProperty('--rx', '0deg');
    e.currentTarget.style.setProperty('--ry', '0deg');
  };

  const links = [
    { href: '#how', label: t('navHow') },
    { href: '#who', label: t('navWho') },
    { href: '#safety', label: t('navSafety') }
  ];
  const cta = { href: '#report', label: t('navReport') };

  return (
    <PublicShell links={links} cta={cta} intro>
      <ScrollProgress label={t('progressLabel')} />

      {/* Hero: full width. Custom grid + pointer spotlight, a Three.js city behind the copy */}
      <section className="hero-full" aria-labelledby="hero-h" ref={heroRef}>
        <div className="hero-grid" aria-hidden="true" />
        <CityCanvas autoplay className="hero-canvas" />
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="kicker">{t('heroKicker')}</p>
            <h1 id="hero-h" aria-label={t('heroTitle')}><SplitWords text={t('heroTitle')} /></h1>
            <p className="lead">{t('heroLead')}</p>
            <div className="cta-row">
              <a className="btn danger" href="#report">{t('heroPrimary')}</a>
              <a className="btn ghost" href="#how">{t('heroSecondary')}</a>
            </div>
          </div>
          <div className="hero-visual">
            <div className="tilt" onMouseMove={onTilt} onMouseLeave={onTiltReset}><SimMap /></div>
          </div>
        </div>
      </section>

      <main className="pub-wrap home">
        {/* Problem + measured numbers */}
        <section className="section reveal" aria-labelledby="problem-h">
          <h2 id="problem-h">{t('problemTitle')}</h2>
          <p className="muted">{t('problemBody')}</p>
          <ZoomScroll items={[1, 2, 3].map((n) => ({ title: t(`zoomCard${n}Title`), body: t(`zoomCard${n}Body`) }))} />
          <div className="stats">
            <div className="stat reveal"><strong><CountUp to={bench?.incidents} /></strong><small>{t('statIncidents')}</small></div>
            <div className="stat reveal"><strong><CountUp to={bench?.naiveLate} /></strong><small>{t('statNaiveLate')}</small></div>
            <div className="stat reveal"><strong><CountUp to={bench?.rankingLate} /></strong><small>{t('statOurLate')}</small></div>
          </div>
          <p className="hint">{t('statsNote')}</p>
        </section>

        {/* How a unit is picked */}
        <section id="how" className="section" aria-labelledby="how-h">
          <h2 id="how-h">{t('howTitle')}</h2>
          <p className="muted">{t('howBody')}</p>
          <PinnedStory label={t('howTitle')} items={[1, 2, 3, 4].map((n) => ({ title: t(`how${n}Title`), body: t(`how${n}Body`) }))} />
        </section>

        {/* Tracking preview */}
        <section className="section" aria-labelledby="track-h">
          <div className="reveal">
            <h2 id="track-h">{t('trackTitle')}</h2>
            <p className="muted">{t('trackBody')}</p>
          </div>
          <FlowStory />
        </section>

        {/* Who it is for */}
        <section id="who" className="section" aria-labelledby="who-h">
          <h2 id="who-h">{t('whoTitle')}</h2>
          <Stairs label={t('whoTitle')} items={[['Citizen', 'whoCitizen'], ['Responder', 'whoResponder'], ['Authority', 'whoAuthority']].map(([, k]) => ({ title: t(`${k}Title`), body: t(`${k}Body`) }))} />
        </section>

        {/* Safety */}
        <section id="safety" className="section safety reveal" aria-labelledby="safety-h">
          <h2 id="safety-h">{t('safetyTitle')}</h2>
          <p className="muted">{t('safetyLead')}</p>
          <ul>
            <li>{t('safety1')}</li>
            <li>{t('safety2')}</li>
            <li>{t('safety3')}</li>
            <li><strong>{t('safety4')}</strong></li>
          </ul>
          <h3 className="roadmap-h">{t('roadmapTitle')}</h3>
          <ul>
            <li>{t('roadmap1')}</li>
            <li>{t('roadmap2')}</li>
            <li>{t('roadmap3')}</li>
            <li>{t('roadmap4')}</li>
          </ul>
        </section>

        {/* Report form lives here so the sticky button can jump to it */}
        <section id="report" className="section report-section" aria-labelledby="report-h">
          <h2 id="report-h">{t('reportTitle')}</h2>
          <p className="muted">{t('reportLead')}</p>
          <div className="report-layout">
            <ReportForm embedded />
            <aside className="report-side reveal" aria-labelledby="side-h">
              <h3 id="side-h">{t('reportSideTitle')}</h3>
              <ol>
                <li>{t('reportSide1')}</li>
                <li>{t('reportSide2')}</li>
                <li>{t('reportSide3')}</li>
              </ol>
            </aside>
          </div>
        </section>

        <footer className="footer">
          <p>{t('footerNote')}</p>
          <a className="btn" href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); }}>{t('backToTop')}</a>
        </footer>
      </main>

      {!atReport && <a className="sticky-report" href="#report">{t('stickyReport')}</a>}
    </PublicShell>
  );
}
