import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fleetSimulator } from './sim/fleet.js';
import { dispatchState } from './dispatch/state.js';
import { requestQueue } from './dispatch/queue.js';
import { getActiveHospitals } from './hospitals/list.js';
import { connectMongo } from './db/mongo.js';
import { loadHospitals } from './hospitals/store.js';
import { run1000IncidentComparison } from './benchmark/comparison.js';
import { triageRequest } from './explain/triage.js';
import { explain } from './explain/ai.js';
import { createReport, getTracking, listReports, closeReport, chooseHospital, askHospitalChange } from './reports/reports.js';
import { hospitalAuth } from './hospitals/auth.js';
import { rateLimit } from './auth/rate-limit.js';
import { listInbox, decide } from './hospitals/inbox.js';
import { hospitalDetail } from './hospitals/detail.js';
import {
  login as adminLogin,
  logout as adminLogout,
  isAdminRequest,
  requireAdmin,
  setSessionCookie,
  clearSessionCookie,
  adminConfigured
} from './admin/auth.js';
import { registerPhone, updateLocation, getAlert, acceptAlert, expireAlerts, removePhone } from './phones/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Read backend/.env wherever the server is started from (root or backend folder)
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const app = express();
const PORT = process.env.PORT || 4000;
// Render (and any proxy) sits in front of the app: trust one hop so req.ip is the real client for rate limits
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// Authority console login (credentials from .env, see server/admin/auth.js)
const loginLimit = rateLimit({ max: 15, message: 'Too many login attempts. Wait 15 minutes and try again.' });
const reportLimit = rateLimit({ windowMs: 60 * 1000, max: 20, message: 'Too many reports from this device. Wait a minute.' });

app.post('/api/admin/login', loginLimit, (req, res) => {
  try {
    const token = adminLogin(req.body?.username, req.body?.password);
    setSessionCookie(res, token);
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});
app.post('/api/admin/logout', (req, res) => {
  adminLogout(req.headers.cookie ? (req.headers.cookie.match(/hw_admin=([^;]+)/)?.[1] ?? null) : null);
  clearSessionCookie(res);
  res.json({ success: true });
});
app.get('/api/admin/me', (req, res) => {
  res.json({ success: true, admin: isAdminRequest(req), configured: adminConfigured() });
});

// Dispatcher and authority APIs need an admin session. Public citizen,
// phone and tracking APIs stay open.
const ADMIN_ONLY_API = /^\/api\/(fleet|requests|spike|queue|hospitals|benchmark|explain|events)(\/|$)/;
app.use((req, res, next) => (ADMIN_ONLY_API.test(req.path) ? requireAdmin(req, res, next) : next()));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'hackwave-dispatch',
    timestamp: new Date().toISOString()
  });
});

function getFleetSummary(units) {
  let ambulances = 0;
  let bikes = 0;
  let free = 0;
  let busy = 0;
  let stale = 0;
  let phone = 0;
  for (const u of units) {
    if (u.type === 'ambulance') ambulances++;
    if (u.type === 'bike') bikes++;
    if (u.status === 'free') free++;
    if (u.status === 'busy') busy++;
    if (u.isStale) stale++;
    if (u.source === 'phone') phone++;
  }
  return {
    total: units.length,
    ambulances,
    bikes,
    free,
    busy,
    stale,
    phone,
    label: '60 simulated units'
  };
}

// REST endpoint for immediate fleet state
app.get('/api/fleet', (req, res) => {
  const units = fleetSimulator.getUnits();
  res.json({
    units,
    summary: getFleetSummary(units),
    spikeZone: dispatchState.getSpikeZone(),
    timestamp: Date.now()
  });
});

// REST endpoint for drill emergency request
app.post('/api/requests', (req, res) => {
  try {
    const { lat, lng, severity } = req.body;
    const result = dispatchState.createRequest({ lat, lng, severity }, fleetSimulator);
    res.status(201).json({
      success: true,
      request: result.request,
      ranking: result.ranking
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

// REST endpoint for list of requests
app.get('/api/requests', (req, res) => {
  res.json({
    requests: dispatchState.getAllRequests()
  });
});

// REST endpoint to trigger demand spike
app.post('/api/spike', (req, res) => {
  const coords = req.body?.lat && req.body?.lng ? { lat: req.body.lat, lng: req.body.lng } : null;
  const spikeResult = dispatchState.triggerSpike(coords, fleetSimulator);
  res.json({
    success: true,
    message: 'Demand spike activated for 30 seconds',
    ...spikeResult
  });
});

// REST endpoint for spike status
app.get('/api/spike', (req, res) => {
  res.json(dispatchState.getSpikeZone());
});

// REST endpoint for priority request queue
app.get('/api/queue', (req, res) => {
  res.json({
    queue: requestQueue.getQueue(),
    count: requestQueue.size()
  });
});

// REST endpoint for dummy hospitals list
app.get('/api/hospitals', (req, res) => {
  res.json({
    hospitals: getActiveHospitals(),
    disclaimer: 'DUMMY DATA — HOSPITAL PARTNERSHIPS PLANNED IN ROADMAP'
  });
});

// REST endpoint to update patient hospital choice
app.post('/api/requests/:id/hospital', (req, res) => {
  const { preference } = req.body;
  const updatedReq = dispatchState.updateHospitalPreference(req.params.id, preference);
  if (!updatedReq) {
    return res.status(404).json({ success: false, error: 'Request not found' });
  }
  res.json({ success: true, request: updatedReq });
});

// REST endpoint for measured comparison benchmark
app.get('/api/benchmark/comparison', (req, res) => {
  const benchmark = run1000IncidentComparison();
  res.json(benchmark);
});

// POST /api/triage — classify caller text → critical | minor
// Caller text is NEVER logged. Source shown: gemini | groq | button
app.post('/api/triage', async (req, res) => {
  try {
    const result = await triageRequest(req.body?.text);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// POST /api/explain — generate Hinglish dispatch explanation
// Body: { requestId } — fetches ranking from dispatchState
app.post('/api/explain', async (req, res) => {
  try {
    const { requestId } = req.body || {};
    if (!requestId) return res.status(400).json({ success: false, error: 'requestId required' });

    const request = dispatchState.getRequest(requestId);
    if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

    const result = await explain(request.ranking, request.severity);
    res.json({ success: true, requestId, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SSE endpoint for live updates
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Initial connection handshake
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', label: '60 simulated units' })}\n\n`);

  // Send initial fleet state immediately
  const initialUnits = fleetSimulator.getUnits();
  res.write(
    `event: fleet\ndata: ${JSON.stringify({
      units: initialUnits,
      summary: getFleetSummary(initialUnits),
      spikeZone: dispatchState.getSpikeZone(),
      queue: requestQueue.getQueue(),
      timestamp: Date.now()
    })}\n\n`
  );

  // Subscribe to 1-second simulation ticks & auto-assign queue
  const unsubscribeFleet = fleetSimulator.subscribe((units) => {
    // Check if free units can be auto-assigned to waiting queue requests
    const newlyAssigned = requestQueue.processQueue(fleetSimulator, dispatchState.getSpikeZone());
    for (const req of newlyAssigned) {
      // Sync into dispatchState
      const existing = dispatchState.getRequest(req.id);
      if (existing) {
        existing.status = 'assigned';
        existing.assignedUnitId = req.assignedUnitId;
        existing.ranking = req.ranking;
        existing.hospital = req.hospital;
      }
      res.write(`event: request_assigned\ndata: ${JSON.stringify({ request: req })}\n\n`);
    }

    res.write(
      `event: fleet\ndata: ${JSON.stringify({
        units,
        summary: getFleetSummary(units),
        spikeZone: dispatchState.getSpikeZone(),
        queue: requestQueue.getQueue(),
        timestamp: Date.now()
      })}\n\n`
    );
  });

  // Subscribe to dispatch state changes (requests, spike, re-ranking)
  const unsubscribeDispatch = dispatchState.subscribe((eventType, data) => {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
    const currentUnits = fleetSimulator.getUnits();
    res.write(
      `event: fleet\ndata: ${JSON.stringify({
        units: currentUnits,
        summary: getFleetSummary(currentUnits),
        spikeZone: dispatchState.getSpikeZone(),
        queue: requestQueue.getQueue(),
        timestamp: Date.now()
      })}\n\n`
    );
  });

  // Subscribe to queue changes
  const unsubscribeQueue = requestQueue.subscribe((eventType, data) => {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  });

  // Keep-alive ping every 15 seconds
  const pingInterval = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  req.on('close', () => {
    unsubscribeFleet();
    unsubscribeDispatch();
    unsubscribeQueue();
    clearInterval(pingInterval);
  });
});

// Phone join flow: plain HTML page, no build step, works on the LAN
// Phone routes: register, GPS location, drill alert, Accept, leave
function phoneRoute(handler) {
  return (req, res) => {
    try {
      res.json({ success: true, ...handler(req) });
    } catch (err) {
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  };
}

app.post('/api/phones', (req, res) => {
  try {
    res.status(201).json({ success: true, phone: registerPhone(req.body || {}) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});
app.post('/api/phones/:id/location', phoneRoute((req) => ({
  location: updateLocation(req.params.id, req.body || {})
})));
app.get('/api/phones/:id/alert', phoneRoute((req) => ({
  alert: getAlert(req.params.id)
})));
app.post('/api/phones/:id/accept', phoneRoute((req) => acceptAlert(req.params.id)));
app.delete('/api/phones/:id', phoneRoute((req) => removePhone(req.params.id)));

// Public, read-only summary of the simulated comparison. Computed once per
// server run and cached, so the home page shows measured numbers, not typed ones.
let cachedBenchmark = null;
app.get('/api/stats/benchmark', (req, res) => {
  if (!cachedBenchmark) cachedBenchmark = run1000IncidentComparison();
  const b = cachedBenchmark;
  res.json({
    success: true,
    simulated: true,
    incidents: b.setup.totalIncidents,
    naiveLate: b.naiveStrategy.lateArrivals,
    rankingLate: b.hackwaveRanking.lateArrivals,
    reductionPct: b.improvement.lateArrivalReductionPct,
    units: b.setup.totalUnits
  });
});

// Accident / incident report (public form) and its tracking view
app.post('/api/reports', reportLimit, async (req, res) => {
  try {
    const result = await createReport(req.body || {});
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});
app.post('/api/admin/reports/:id/close', requireAdmin, (req, res) => {
  try {
    res.json({ success: true, ...closeReport(req.params.id) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});
app.get('/api/admin/reports', requireAdmin, (req, res) => {
  res.json({ success: true, reports: listReports() });
});
app.get('/api/reports/:id', (req, res) => {
  try {
    res.json({ success: true, tracking: getTracking(req.params.id) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});
// Citizen picks a hospital from the cards; that hospital gets the incoming message
app.post('/api/reports/:id/hospital', (req, res) => {
  try {
    res.json({ success: true, ...chooseHospital(req.params.id, req.body?.hospitalId) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// Citizen asks to switch hospital (only the hospital can release the patient)
app.post('/api/reports/:id/hospital/change', (req, res) => {
  try {
    res.json({ success: true, ...askHospitalChange(req.params.id) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// Hospital panel (/hospital): dummy, one shared login from env (HOSPITAL_USERNAME / HOSPITAL_PASSWORD)
app.post('/api/hospital/login', loginLimit, (req, res) => {
  try {
    const token = hospitalAuth.login(req.body?.username, req.body?.password);
    hospitalAuth.setSessionCookie(res, token);
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});
app.post('/api/hospital/logout', (req, res) => {
  hospitalAuth.logoutRequest(req);
  hospitalAuth.clearSessionCookie(res);
  res.json({ success: true });
});
app.get('/api/hospital/me', (req, res) => {
  res.json({ success: true, hospital: hospitalAuth.isRequestAuthed(req), configured: hospitalAuth.isConfigured() });
});
app.get('/api/hospital/inbox', hospitalAuth.requireSession, (req, res) => {
  res.json({ success: true, messages: listInbox() });
});
// Live detail for one patient: patient and ambulance on the map, speed, ETA
app.get('/api/hospital/inbox/:id/detail', hospitalAuth.requireSession, (req, res) => {
  const detail = hospitalDetail(req.params.id);
  if (!detail) return res.status(404).json({ success: false, error: 'Message not found' });
  res.json({ success: true, detail });
});
// Hospital decides: accept | reject (with reason) | bed_ready | release | keep
app.post('/api/hospital/inbox/:id/decision', hospitalAuth.requireSession, (req, res) => {
  try {
    const msg = decide(req.params.id, req.body?.action, req.body?.reason);
    if (!msg) return res.status(404).json({ success: false, error: 'Message not found' });
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// Expire phone alerts that were not accepted in time (runs every fleet tick)
fleetSimulator.subscribe(() => expireAlerts());

const publicPath = path.resolve(__dirname, '../public');
app.get('/join', (req, res) => res.sendFile(path.join(publicPath, 'join.html')));

// Serve frontend dist if available (production mode)
const distPath = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(distPath));

// For SPA routing fallback if dist exists
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next();
  });
});

if (process.env.NODE_ENV !== 'test') {
  // Real hospital data from MongoDB Atlas ("emergency-system" database), else built-in list
  connectMongo().then((db) => loadHospitals(db))
    .then((r) => console.log(`[Hospitals] loaded from ${r.source} (${r.count})`))
    .catch((err) => console.warn('[Hospitals] load failed, using built-in list:', err.message));
  fleetSimulator.start();
  app.listen(PORT, () => {
    console.log(`[Backend] Server listening on http://localhost:${PORT}`);
  });
}

export default app;
