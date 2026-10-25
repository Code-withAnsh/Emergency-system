// Shared login for the authority console (/admin) and the hospital panel (/hospital).
// Credentials come from backend/.env only. Each panel has its own cookie and its own sessions.
// NEVER logs usernames, passwords, or session tokens.

import crypto from 'node:crypto';

const SESSION_HOURS = 8;
// Browsers only send Secure cookies over HTTPS, so the flag is on in production (Render serves HTTPS)
const secureFlag = () => (process.env.NODE_ENV === 'production' ? '; Secure' : '');

// Compare fixed-length digests so the check does not leak length or content
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * @param {object} opts
 * @param {string} opts.label       shown in error messages, e.g. "Admin"
 * @param {string} opts.cookie      cookie name, e.g. "hw_admin"
 * @param {string[]} opts.userEnvs  env names for the username, first set one wins
 * @param {string[]} opts.passEnvs  env names for the password, first set one wins
 */
export function createSessionAuth({ label, cookie, userEnvs, passEnvs }) {
  const sessions = new Map(); // token -> expiresAt (ms)

  // Read at call time so tests and restarts pick up the current env
  function configured() {
    const username = userEnvs.map((k) => process.env[k]).find(Boolean);
    const password = passEnvs.map((k) => process.env[k]).find(Boolean);
    return { username, password, ok: Boolean(username && password) };
  }

  function login(username, password) {
    const cfg = configured();
    if (!cfg.ok) {
      const err = new Error(`${label} login is not configured on the server`);
      err.statusCode = 503;
      throw err;
    }
    const okUser = safeEqual(username ?? '', cfg.username);
    const okPass = safeEqual(password ?? '', cfg.password);
    if (!(okUser && okPass)) {
      const err = new Error('Wrong username or password');
      err.statusCode = 401;
      throw err;
    }
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_HOURS * 3600 * 1000);
    return token;
  }

  function logout(token) {
    if (token) sessions.delete(token);
  }

  function tokenFromRequest(req) {
    const header = req.headers.cookie || '';
    const match = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${cookie}=`));
    return match ? decodeURIComponent(match.slice(cookie.length + 1)) : null;
  }

  function logoutRequest(req) {
    logout(tokenFromRequest(req));
  }

  function isRequestAuthed(req, now = Date.now()) {
    const token = tokenFromRequest(req);
    if (!token) return false;
    const expires = sessions.get(token);
    if (!expires) return false;
    if (expires < now) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  function setSessionCookie(res, token) {
    res.setHeader(
      'Set-Cookie',
      `${cookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}${secureFlag()}`
    );
  }

  function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${cookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureFlag()}`);
  }

  function requireSession(req, res, next) {
    if (isRequestAuthed(req)) return next();
    return res.status(401).json({ success: false, error: `${label} login required` });
  }

  return {
    login,
    logout,
    logoutRequest,
    isRequestAuthed,
    setSessionCookie,
    clearSessionCookie,
    requireSession,
    isConfigured: () => configured().ok
  };
}
