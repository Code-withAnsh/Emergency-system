// AI orchestrator — tries Gemini, then Groq, then template fallback
// Returns source: 'gemini' | 'groq' | 'template' with every response

import { geminiExplain, geminiTriage } from './gemini.js';
import { groqExplain, groqTriage } from './groq.js';
import { templateExplain, templateTriage } from './template.js';

// Providers are injectable so tests can replace the network calls
const defaultProviders = {
  gemini: { explain: geminiExplain, triage: geminiTriage },
  groq: { explain: groqExplain, triage: groqTriage }
};

/**
 * Generates a dispatch explanation using the fallback chain.
 * Gemini → Groq → Template
 *
 * @param {Object} ranking
 * @param {string} severity
 * @param {Object} [providers] - optional provider override (tests only)
 * @returns {Promise<{ text: string, source: 'gemini'|'groq'|'template' }>}
 */
export async function explain(ranking, severity = 'minor', providers = defaultProviders) {
  // Step 1: Try Gemini
  try {
    const text = await providers.gemini.explain(ranking, severity);
    return { text, source: 'gemini' };
  } catch (geminiErr) {
    console.warn(`[AI] Gemini explain failed: ${geminiErr.message} — trying Groq`);
  }

  // Step 2: Try Groq
  try {
    const text = await providers.groq.explain(ranking, severity);
    return { text, source: 'groq' };
  } catch (groqErr) {
    console.warn(`[AI] Groq explain failed: ${groqErr.message} — using template`);
  }

  // Step 3: Template fallback
  const text = templateExplain(ranking, severity);
  return { text, source: 'template' };
}

/**
 * Triages caller text using the fallback chain.
 * Gemini → Groq → Template (keyword-based)
 *
 * @param {string} callerText — NEVER logged
 * @param {Object} [providers] - optional provider override (tests only)
 * @returns {Promise<{ severity: 'critical'|'minor', source: 'gemini'|'groq'|'button' }>}
 */
export async function triage(callerText, providers = defaultProviders) {
  // Step 1: Try Gemini
  try {
    const result = await providers.gemini.triage(callerText);
    return result; // { severity, source: 'gemini' }
  } catch (geminiErr) {
    console.warn(`[AI] Gemini triage failed: ${geminiErr.message} — trying Groq`);
  }

  // Step 2: Try Groq
  try {
    const result = await providers.groq.triage(callerText);
    return result; // { severity, source: 'groq' }
  } catch (groqErr) {
    console.warn(`[AI] Groq triage failed: ${groqErr.message} — using template`);
  }

  // Step 3: Template keyword fallback
  return templateTriage(callerText); // { severity, source: 'button' }
}
