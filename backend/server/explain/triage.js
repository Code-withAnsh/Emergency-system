// Triage endpoint handler — classifies caller text via ai.js
// POST /api/triage: { text } → { severity, source }
// Rules:
//   - Empty or very long text → 400
//   - Caller text is NEVER logged
//   - Source shown: 'gemini', 'groq', or 'button'

import { triage } from './ai.js';

const MIN_TEXT_LEN = 3;
const MAX_TEXT_LEN = 500;

/**
 * Validates and triages caller input
 * @param {string} rawText
 * @returns {Promise<{ severity: string, source: string, note?: string }>}
 */
export async function triageRequest(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    const err = new Error('text field is required');
    err.statusCode = 400;
    throw err;
  }

  const text = rawText.trim();

  if (text.length < MIN_TEXT_LEN) {
    const err = new Error(`text too short (min ${MIN_TEXT_LEN} characters)`);
    err.statusCode = 400;
    throw err;
  }

  if (text.length > MAX_TEXT_LEN) {
    const err = new Error(`text too long (max ${MAX_TEXT_LEN} characters)`);
    err.statusCode = 400;
    throw err;
  }

  // NEVER log the text — only pass to AI
  return triage(text);
}
