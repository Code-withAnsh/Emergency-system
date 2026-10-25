// Tests for the authority console login: credentials, session cookie, protected APIs
import test from 'node:test';
import assert from 'node:assert';
import app from '../server/index.js';

process.env.ADMIN_USERNAME = 'test-admin';
process.env.ADMIN_PASSWORD = 'test-pass-123';

function withServer(fn) {
  return async () => {
    const server = app.listen(0);
    try {
      await fn(`http://127.0.0.1:${server.address().port}`);
    } finally {
      server.close();
    }
  };
}

const post = (base, path, body, cookie) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: JSON.stringify(body)
});

test('1. protected API without a session returns 401', withServer(async (base) => {
  const res = await fetch(`${base}/api/requests`);
  assert.strictEqual(res.status, 401);
}));

test('2. wrong password returns 401 and sets no cookie', withServer(async (base) => {
  const res = await post(base, '/api/admin/login', { username: 'test-admin', password: 'nope' });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.headers.get('set-cookie'), null);
}));

test('3. correct login sets an HttpOnly session cookie that unlocks protected APIs', withServer(async (base) => {
  const login = await post(base, '/api/admin/login', { username: 'test-admin', password: 'test-pass-123' });
  assert.strictEqual(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(';')[0];

  const res = await fetch(`${base}/api/requests`, { headers: { Cookie: cookie } });
  assert.strictEqual(res.status, 200);
}));

test('4. public citizen APIs stay open without a session', withServer(async (base) => {
  const health = await fetch(`${base}/api/health`);
  assert.strictEqual(health.status, 200);
  const triage = await post(base, '/api/triage', { text: '' });
  assert.strictEqual(triage.status, 400, 'validation still runs, not auth');
}));

test('5. logout removes the session', withServer(async (base) => {
  const login = await post(base, '/api/admin/login', { username: 'test-admin', password: 'test-pass-123' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  await post(base, '/api/admin/logout', {}, cookie);
  const res = await fetch(`${base}/api/requests`, { headers: { Cookie: cookie } });
  assert.strictEqual(res.status, 401);
}));
