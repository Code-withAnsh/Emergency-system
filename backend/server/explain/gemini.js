// Gemini API client — main AI for explanation and triage
// Uses GEMINI_API_KEY and GEMINI_MODEL from .env
// Enforces AI_TIMEOUT_MS timeout on every call
// NEVER logs the API key or caller text

import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

// Call counter — logged by count only, never with key or text
let geminiCallCount = 0;

function getClient() {
  // Read the key per call (not at import) so it can be changed at runtime
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in .env');
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Calls Gemini with a prompt, enforcing timeout.
 * @param {string} prompt
 * @returns {Promise<string>} response text
 */
async function callGeminiWithTimeout(prompt) {
  const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 5000;
  const client = getClient();
  // Minimal thinking: these are short dispatch texts, and long thinking made
  // explain calls take ~5s, which hit the timeout
  const model = client.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { thinkingConfig: { thinkingLevel: 'minimal' } }
  });

  // generateContent() does not honour an AbortController here, so enforce the
  // timeout by racing the call against a timer instead
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Gemini timeout after ${AI_TIMEOUT_MS}ms`)),
      AI_TIMEOUT_MS
    );
  });

  try {
    geminiCallCount++;
    console.log(`[Gemini] Call #${geminiCallCount} | model: ${GEMINI_MODEL}`);

    const result = await Promise.race([model.generateContent(prompt), timeout]);
    return result.response.text().trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generates a Hinglish dispatch explanation from ranking data
 * @param {Object} ranking - { chosen, runnerUp, nearest, bikeFallback }
 * @param {string} severity
 * @returns {Promise<string>} explanation text
 */
export async function geminiExplain(ranking, severity = 'minor') {
  if (!ranking?.chosen) {
    return 'Koi free unit nahi hai — request queue mein wait kar rahi hai.';
  }

  const { chosen, runnerUp, nearest, bikeFallback } = ranking;

  const prompt = `You are an AI assistant for an emergency dispatch system in Bhopal, India.
Write a SHORT (3-4 sentences max), plain-language explanation in Hinglish (Roman script) for a dispatcher explaining WHY this unit was chosen.

Dispatch data:
- Severity: ${severity.toUpperCase()}
- Chosen unit: ${chosen.id} (${chosen.type}, ETA ${chosen.eta_minutes.toFixed(1)} min, GPS age ${chosen.gpsAge_s.toFixed(0)}s, distance ${chosen.distance_km.toFixed(2)} km)
- Bike fallback: ${bikeFallback ? 'YES — no ambulance free for critical case' : 'NO'}
- Runner-up: ${runnerUp ? `${runnerUp.id} (ETA ${runnerUp.eta_minutes.toFixed(1)} min, ${(runnerUp.eta_minutes - chosen.eta_minutes).toFixed(1)} min slower)` : 'None'}
- Nearest unit: ${nearest ? `${nearest.id} (distance ${nearest.distance_km.toFixed(2)} km, GPS age ${nearest.gpsAge_s.toFixed(0)}s, ${nearest.id !== chosen.id ? 'NOT chosen because of penalties' : 'IS the chosen unit'}` : 'Same as chosen'}

Rules:
- Max 3-4 sentences in Hinglish Roman script (mix of Hindi words + English terms)
- Focus on: why this unit, why nearest may have been skipped, ETA benefit
- Do NOT invent numbers not given above
- Do NOT mention real emergency services or real hospitals
- End with: "Ye ek PROTOTYPE / DRILL hai."`;

  return callGeminiWithTimeout(prompt);
}

/**
 * Classifies caller description text into critical or minor severity
 * @param {string} callerText - short description of emergency (NEVER logged)
 * @returns {Promise<{ severity: string, source: string }>}
 */
export async function geminiTriage(callerText) {
  const prompt = `You are an AI triage assistant for an emergency dispatch system.
Classify the following emergency call description as either "critical" or "minor".

Rules:
- "critical": life-threatening, immediate risk (unconscious, not breathing, chest pain, severe accident, heavy bleeding, fire, seizure, stroke)
- "minor": non-life-threatening (minor injury, fever, non-urgent transport, small cut)
- Respond with ONLY the JSON: {"severity": "critical"} or {"severity": "minor"}
- No explanation, no other text.

Call description: "${callerText}"`;

  const raw = await callGeminiWithTimeout(prompt);

  // Parse JSON response safely
  const match = raw.match(/\{[^}]+\}/);
  if (!match) throw new Error(`Gemini triage returned unexpected format: ${raw.slice(0, 80)}`);

  const parsed = JSON.parse(match[0]);
  if (!['critical', 'minor'].includes(parsed.severity)) {
    throw new Error(`Invalid severity from Gemini: ${parsed.severity}`);
  }

  return { severity: parsed.severity, source: 'gemini' };
}

export function getGeminiCallCount() {
  return geminiCallCount;
}
