import test from 'node:test';
import assert from 'node:assert';
import app from '../server/index.js';

test('GET /api/health returns ok', async (t) => {
  // Use http.Server or dynamic port for test
  const server = app.listen(0);
  const { port } = server.address();
  
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.service, 'hackwave-dispatch');
    assert.ok(body.timestamp);
  } finally {
    server.close();
  }
});
