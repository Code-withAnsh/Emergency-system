// Small fetch helper for the public pages. Throws Error with the server message.
export async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body;
}

// Drill area from backend MAP_CONFIG (kept in sync by hand; server is the source of truth)
export const DRILL_BOX = {
  center: [23.2599, 77.4126],
  bounds: [
    [23.1999, 77.3526],
    [23.3199, 77.4726]
  ]
};
