import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import '../public/header.css';
import { useI18n } from '../i18n/I18nProvider.jsx';
import Intro from './Intro.jsx';

// First-visit popup: pick English or Hindi before using the site
function LanguagePrompt() {
  const { t, setLang } = useI18n();
  const first = useRef(null);
  useEffect(() => { first.current?.focus(); }, []);
  return (
    <div className="lang-overlay" role="presentation">
      <div className="lang-dialog" role="dialog" aria-modal="true" aria-labelledby="lang-title">
        <h2 id="lang-title">{t('langPromptTitle')}</h2>
        <p>{t('langPromptBody')}</p>
        <button ref={first} type="button" className="btn" onClick={() => setLang('en')}>English</button>
        <button type="button" className="btn ghost" onClick={() => setLang('hi')} lang="hi">हिन्दी</button>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 48 60" aria-hidden="true">
      <path d="M24 2C12.4 2 3 11.3 3 22.8 3 38.2 24 58 24 58s21-19.8 21-35.2C45 11.3 35.6 2 24 2z" fill="#22d3ee" />
      <circle cx="24" cy="23" r="7" fill="#0b1220" />
    </svg>
  );
}

// links: [{ href, label }]. cta: { href, label }.
export default function PublicShell({ children, links = [], cta = null, intro = false }) {
  const { t, lang, hasChosen, setLang } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const indRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Hover pill glides to the link under the pointer (or keyboard focus)
  const slideTo = (e) => {
    const link = e.target.closest?.('a');
    if (!link || !indRef.current) return;
    gsap.to(indRef.current, { x: link.offsetLeft, width: link.offsetWidth, opacity: 1, duration: 0.35, ease: 'power3.out', overwrite: true });
  };
  const hidePill = () => {
    if (indRef.current) gsap.to(indRef.current, { opacity: 0, duration: 0.2, overwrite: true });
  };

  return (
    <div className="pub">
      {!hasChosen && <LanguagePrompt />}
      {intro && hasChosen && <Intro />}
      <header className="top-wrap">
        <div className={`top-bar ${scrolled ? 'scrolled' : ''}`}>
          <a className="tb-brand" href="/"><Mark /><span>{t('brand')}</span></a>
          <nav className="tb-links" aria-label="Main" onPointerOver={slideTo} onPointerLeave={hidePill} onFocus={slideTo} onBlur={hidePill}>
            <span className="tb-indicator" ref={indRef} aria-hidden="true" />
            {links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
          </nav>
          <div className="tb-right">
            <div className="lang-toggle" role="group" aria-label="Language" data-lang={lang}>
              <span className="lang-thumb" aria-hidden="true" />
              <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>{t('english')}</button>
              <button type="button" aria-pressed={lang === 'hi'} onClick={() => setLang('hi')} lang="hi">{t('hindi')}</button>
            </div>
            {cta && <a className="tb-cta" href={cta.href}>{cta.label}</a>}
            <button type="button" className="tb-burger" aria-expanded={open} aria-controls="mobile-menu"
              aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
              <span />
            </button>
          </div>
        </div>
        <div id="mobile-menu" className={`drawer ${open ? 'open' : ''}`}>
          {links.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>)}
          {cta && <a className="drawer-cta" href={cta.href} onClick={() => setOpen(false)}>{cta.label}</a>}
        </div>
      </header>
      <div className="pub-banner" role="note">{t('banner')}</div>
      {children}
    </div>
  );
}
