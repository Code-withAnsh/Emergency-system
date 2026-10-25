import test from 'node:test';
import assert from 'node:assert';
import app from '../server/index.js';

test('GET /api/fleet returns snapshot with 60 units and summary', async (t) => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/fleet`);
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
