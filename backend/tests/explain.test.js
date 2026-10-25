// Tests for Phase 5: AI explain + triage fallback chain
// Uses manual mocking — no extra test framework needed
// Covers: Gemini works, Gemini 429 then Groq, both fail then template, empty text (400)

import test from 'node:test';
import assert from 'node:assert';
import { templateExplain, templateTriage } from '../server/explain/template.js';
import { triageRequest } from '../server/explain/triage.js';

// ─── Template Tests (pure, no network) ─────────────────────────────────────

test('1. template explain: generates Hinglish explanation with numbers from ranking', (t) => {
  const ranking = {
    chosen: { id: 'AMB-05', type: 'ambulance', eta_minutes: 3.2, gpsAge_s: 4, distance_km: 2.1 },
    runnerUp: { id: 'AMB-12', type: 'ambulance', eta_minutes: 4.8, gpsAge_s: 6, distance_km: 3.0 },
    nearest: { id: 'BIKE-02', type: 'bike', eta_minutes: 5.0, gpsAge_s: 3, distance_km: 1.8 },
    bikeFallback: false
  };

  const text = templateExplain(ranking, 'critical');

  assert.ok(text.includes('AMB-05'), 'Must mention chosen unit ID');
  assert.ok(text.includes('3.2'), 'Must include ETA number');
  assert.ok(text.includes('PROTOTYPE'), 'Must include PROTOTYPE/DRILL disclaimer');
  assert.ok(text.length > 50, 'Must be a meaningful explanation');
});

test('2. template explain: bike fallback warning when no ambulance free', (t) => {
  const ranking = {
    chosen: { id: 'BIKE-07', type: 'bike', eta_minutes: 4.5, gpsAge_s: 3, distance_km: 1.9 },
    runnerUp: null,
    nearest: { id: 'BIKE-07', type: 'bike', eta_minutes: 4.5, gpsAge_s: 3, distance_km: 1.9 },
    bikeFallback: true
  };

  const text = templateExplain(ranking, 'critical');
  assert.ok(text.toLowerCase().includes('fallback') || text.toLowerCase().includes('ambulance'), 'Must mention bike fallback');
});

test('3. template explain: no chosen unit returns queue waiting message', (t) => {
  const text = templateExplain({ chosen: null }, 'minor');
  assert.ok(text.toLowerCase().includes('queue') || text.toLowerCase().includes('free'), 'Must say no unit available');
});

test('4. template triage: critical keywords detected correctly', (t) => {
  const result1 = templateTriage('patient is unconscious and not breathing');
  assert.strictEqual(result1.severity, 'critical');
  assert.strictEqual(result1.source, 'button');

  const result2 = templateTriage('patient has chest pain and possible heart attack');
  assert.strictEqual(result2.severity, 'critical');

  const result3 = templateTriage('minor cut on finger, small bleeding');
  assert.strictEqual(result3.severity, 'minor');
});

test('5. triage validation: empty text returns 400 error', async (t) => {
  await assert.rejects(
    () => triageRequest(''),
    (err) => {
      assert.ok(err.statusCode === 400 || err.message.includes('short') || err.message.includes('required'));
      return true;
    }
  );
});

test('6. triage validation: text too long returns 400 error', async (t) => {
  const longText = 'a'.repeat(501);
  await assert.rejects(
    () => triageRequest(longText),
    (err) => {
      assert.ok(err.statusCode === 400 || err.message.includes('long'));
      return true;
    }
  );
});

test('7. triage validation: null/missing text returns 400 error', async (t) => {
  await assert.rejects(
    () => triageRequest(null),
    (err) => {
      assert.ok(err.statusCode === 400 || err.message.includes('required'));
      return true;
    }
  );
});

test('8. template triage: Hinglish keywords classified as critical', (t) => {
  const result = templateTriage('bebehosh hai aur saans nahi aa raha');
  assert.strictEqual(result.severity, 'critical', 'Hinglish critical keywords should be detected');
});

// ─── Fallback chain tests (fake providers, no network) ─────────────────────

const sampleRanking = {
  chosen: { id: 'AMB-05', type: 'ambulance', eta_minutes: 3.2, gpsAge_s: 4, distance_km: 2.1 },
  runnerUp: null,
  nearest: { id: 'AMB-05', type: 'ambulance', eta_minutes: 3.2, gpsAge_s: 4, distance_km: 2.1 },
  bikeFallback: false
};

const failing = (msg) => async () => { throw new Error(msg); };

test('9. chain: Gemini works, source is gemini', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { explain, triage } = await import('../server/explain/ai.js');
  const providers = {
    gemini: { explain: async () => 'Gemini text', triage: async () => ({ severity: 'critical', source: 'gemini' }) },
    groq: { explain: failing('should not be called'), triage: failing('should not be called') }
  };

  const ex = await explain(sampleRanking, 'critical', providers);
  assert.deepStrictEqual(ex, { text: 'Gemini text', source: 'gemini' });

  const tr = await triage('saans nahi aa rahi', providers);
  assert.strictEqual(tr.source, 'gemini');
  assert.strictEqual(tr.severity, 'critical');
});

test('10. chain: Gemini 429 then Groq works, source is groq', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { explain, triage } = await import('../server/explain/ai.js');
  const providers = {
    gemini: { explain: failing('Gemini 429'), triage: failing('Gemini 429') },
    groq: { explain: async () => 'Groq text', triage: async () => ({ severity: 'minor', source: 'groq' }) }
  };

  assert.deepStrictEqual(await explain(sampleRanking, 'minor', providers), { text: 'Groq text', source: 'groq' });
  const tr = await triage('bukhar hai', providers);
  assert.strictEqual(tr.source, 'groq');
});

test('11. chain: both AI fail, falls back to template and button', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { explain, triage } = await import('../server/explain/ai.js');
  const providers = {
    gemini: { explain: failing('Gemini down'), triage: failing('Gemini down') },
    groq: { explain: failing('Groq down'), triage: failing('Groq down') }
  };

  const ex = await explain(sampleRanking, 'critical', providers);
  assert.strictEqual(ex.source, 'template');
  assert.ok(ex.text.includes('AMB-05'));

  const tr = await triage('unconscious hai', providers);
  assert.strictEqual(tr.source, 'button');
  assert.strictEqual(tr.severity, 'critical');
});

// ─── Groq client tests (fetch stubbed) ─────────────────────────────────────
const { groqExplain } = await import('../server/explain/groq.js');
const originalFetch = globalThis.fetch;

test('12. groq: request times out and reports timeout', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  process.env.GROQ_API_KEY = 'test-key';
  process.env.AI_TIMEOUT_MS = '50';
  // Fetch that never resolves until the abort signal fires
  globalThis.fetch = (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });

  try {
    await assert.rejects(() => groqExplain(sampleRanking, 'critical'), /timeout after 50ms/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('13. groq: HTTP 429 is reported as rate limit', async (t) => {
  t.mock.method(console, 'log', () => {});
  process.env.GROQ_API_KEY = 'test-key';
  globalThis.fetch = async () => ({ ok: false, status: 429, statusText: 'Too Many Requests' });

  try {
    await assert.rejects(() => groqExplain(sampleRanking, 'minor'), /429/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('14. groq: key missing gives a clear error without calling the network', async (t) => {
  t.mock.method(console, 'log', () => {});
  delete process.env.GROQ_API_KEY;
  let called = false;
  globalThis.fetch = async () => { called = true; };

  try {
    await assert.rejects(() => groqExplain(sampleRanking, 'minor'), /GROQ_API_KEY is not set/);
    assert.strictEqual(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
