import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fleetSimulator } from './sim/fleet.js';
import { dispatchState } from './dispatch/state.js';
import { requestQueue } from './dispatch/queue.js';
import { DUMMY_HOSPITALS } from './hospitals/list.js';
import { run1000IncidentComparison } from '../tests/simulation_comparison.benchmark.js';
import { triageRequest } from './explain/triage.js';
import { explain } from './explain/ai.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

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
    hospitals: DUMMY_HOSPITALS,
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
  fleetSimulator.start();
  app.listen(PORT, () => {
    console.log(`[Backend] Server listening on http://localhost:${PORT}`);
  });
}

export default app;
