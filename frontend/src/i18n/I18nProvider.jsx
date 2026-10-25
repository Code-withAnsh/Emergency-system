import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { MESSAGES } from './messages.js';
import { HOME } from './home.js';
import { HOME2 } from './home2.js';

const STORAGE_KEY = 'hw_lang';
const I18nContext = createContext(null);

// lang is null until the visitor picks one; the language prompt shows then
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'en' || saved === 'hi' ? saved : null;
    } catch {
      return null;
    }
  });

  function setLang(next) {
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode: keep in memory */ }
  }

  useEffect(() => {
    document.documentElement.lang = lang || 'en';
  }, [lang]);

  const value = useMemo(() => {
    const active = lang || 'en';
    const t = (key, vars = {}) => {
      const text = HOME2[active][key] ?? HOME[active][key] ?? MESSAGES[active][key] ?? HOME.en[key] ?? MESSAGES.en[key] ?? key;
      return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
    };
    return { lang: active, hasChosen: Boolean(lang), setLang, t };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
