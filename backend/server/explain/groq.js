// Groq API client — backup AI for explanation and triage
// Used only if Gemini fails or times out
// Enforces AI_TIMEOUT_MS timeout
// NEVER logs the API key or caller text

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Call counter — count only, never key or text
let groqCallCount = 0;

/**
 * Calls Groq via fetch with timeout using AbortController
 * @param {string} userPrompt
 * @param {string} systemPrompt
 * @returns {Promise<string>} response text
 */
async function callGroqWithTimeout(userPrompt, systemPrompt = '') {
  // Read the key per call (not at import) so it can be changed at runtime
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set in .env');
  }
  const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 5000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    groqCallCount++;
    console.log(`[Groq] Call #${groqCallCount} | model: ${GROQ_MODEL}`);

    const response = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 300,
        temperature: 0.4
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (response.status === 429) {
      throw new Error('Groq rate limit (429) — fallback to template');
    }
    if (!response.ok) {
      throw new Error(`Groq HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Groq returned empty content');
    return text.trim();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`Groq timeout after ${AI_TIMEOUT_MS}ms`);
    }
    throw err;
  }
}

/**
 * Generates a Hinglish dispatch explanation via Groq
 * @param {Object} ranking
 * @param {string} severity
 * @returns {Promise<string>}
 */
export async function groqExplain(ranking, severity = 'minor') {
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
- Runner-up: ${runnerUp ? `${runnerUp.id} (${(runnerUp.eta_minutes - chosen.eta_minutes).toFixed(1)} min slower)` : 'None'}
- Nearest unit: ${nearest ? `${nearest.id} (GPS age ${nearest.gpsAge_s.toFixed(0)}s, ${nearest.id !== chosen.id ? 'NOT chosen due to penalties' : 'IS the chosen unit'})` : 'Same as chosen'}

Write 3-4 sentences in Hinglish Roman script. End with: "Ye ek PROTOTYPE / DRILL hai."`;

  return callGroqWithTimeout(prompt);
}

/**
 * Classifies caller text as critical or minor via Groq
 * @param {string} callerText - NEVER logged
 * @returns {Promise<{ severity: string, source: string }>}
 */
export async function groqTriage(callerText) {
  const prompt = `Classify this emergency call as "critical" or "minor". Respond ONLY with JSON: {"severity": "critical"} or {"severity": "minor"}.

Call: "${callerText}"`;

  const system = 'You are a medical triage classifier. Respond only with valid JSON. critical=life-threatening, minor=non-urgent.';

  const raw = await callGroqWithTimeout(prompt, system);

  const match = raw.match(/\{[^}]+\}/);
  if (!match) throw new Error(`Groq triage bad format: ${raw.slice(0, 60)}`);

  const parsed = JSON.parse(match[0]);
  if (!['critical', 'minor'].includes(parsed.severity)) {
    throw new Error(`Invalid severity from Groq: ${parsed.severity}`);
  }

  return { severity: parsed.severity, source: 'groq' };
}

export function getGroqCallCount() {
  return groqCallCount;
}
