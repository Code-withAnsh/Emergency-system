// Small in-memory rate limit for login and report endpoints (per client IP).
// Enough for a single Render instance. Blocked requests get 429 with a Retry-After header.

export function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, message = 'Too many attempts. Try again later.' } = {}) {
  const hits = new Map(); // ip -> { count, resetAt }
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ success: false, error: message });
    }
    return next();
  };
}
