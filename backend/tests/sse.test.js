import test from 'node:test';
import assert from 'node:assert';
import app from '../server/index.js';

// Admin credentials for this test only (not read from .env)
process.env.ADMIN_USERNAME = 'test-admin';
process.env.ADMIN_PASSWORD = 'test-pass-123';

test('GET /api/fleet returns snapshot with 60 units and summary (admin session)', async (t) => {
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const login = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test-admin', password: 'test-pass-123' })
    });
    assert.strictEqual(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];

    const res = await fetch(`${base}/api/fleet`, { headers: { Cookie: cookie } });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.units));
    assert.strictEqual(data.units.length, 60);
    assert.strictEqual(data.summary.total, 60);
    assert.strictEqual(data.summary.ambulances, 30);
    assert.strictEqual(data.summary.bikes, 30);
    assert.strictEqual(data.summary.label, '60 simulated units');
  } finally {
    server.close();
  }
});
