import test from 'node:test';
import assert from 'node:assert';
import { DispatchStateManager } from '../server/dispatch/state.js';
import { FleetSimulator } from '../server/sim/fleet.js';
import { MAP_CONFIG, THRESHOLDS } from '../server/config.js';
import { rank, haversineDistanceKm } from '../server/dispatch/rank.js';

test('1. spike activates for 30s and applies +1 minute penalty within 1.5 km', (t) => {
  const state = new DispatchStateManager();
  const now = 1000000;
  const spikeCoords = { lat: 23.2500, lng: 77.4100 };

  const spikeInfo = state.triggerSpike(spikeCoords, null, now);
  assert.strictEqual(spikeInfo.spikeZone.active, true);
  assert.strictEqual(spikeInfo.spikeZone.lat, 23.2500);
  assert.strictEqual(spikeInfo.spikeZone.lng, 77.4100);
  assert.strictEqual(spikeInfo.spikeZone.remainingSeconds, 30);

  // Unit A: inside spike zone (0.5 km away)
  // Unit B: outside spike zone (3.0 km away)
  const unitInside = {
    id: 'amb-inside',
    type: 'ambulance',
    lat: 23.2500 + 0.004, // ~0.44 km
    lng: 77.4100,
    status: 'free',
    gpsAge: 2
  };
  const unitOutside = {
    id: 'amb-outside',
    type: 'ambulance',
    lat: 23.2500 + 0.030, // ~3.33 km
    lng: 77.4100,
    status: 'free',
    gpsAge: 2
  };

  const currentSpike = state.getSpikeZone(now);
  const result = rank([unitInside, unitOutside], { lat: 23.2500, lng: 77.4100, severity: 'critical' }, { now, spikeZone: currentSpike });

  const insideCandidate = result.ranked.find((c) => c.id === 'amb-inside');
  const outsideCandidate = result.ranked.find((c) => c.id === 'amb-outside');

  assert.strictEqual(insideCandidate.inSpikeZone, true, 'Unit within 1.5km must be flagged inSpikeZone');
  assert.strictEqual(insideCandidate.penalties >= 1, true, 'Unit within 1.5km must receive +1 min spike penalty');
  assert.strictEqual(outsideCandidate.inSpikeZone, false, 'Unit outside 1.5km must not be flagged inSpikeZone');
});

test('2. spike zone automatically expires after 30 seconds', (t) => {
  const state = new DispatchStateManager();
  const t0 = 1000000;

  state.triggerSpike({ lat: 23.2500, lng: 77.4100 }, null, t0);
  assert.strictEqual(state.getSpikeZone(t0 + 10000).active, true, 'Active at 10s');
  assert.strictEqual(state.getSpikeZone(t0 + 29000).active, true, 'Active at 29s');
  
  // At 30s+ it expires
  const expired = state.getSpikeZone(t0 + 31000);
  assert.strictEqual(expired.active, false, 'Must expire after 30s');
  assert.strictEqual(expired.remainingSeconds, 0);
});

test('3. pending requests re-rank when demand spike is triggered', (t) => {
  const sim = new FleetSimulator({ totalUnits: 10 });
  const state = new DispatchStateManager();
  const t0 = 1000000;

  // Make all units busy so request is pending
  for (const u of sim.units.values()) {
    u.status = 'busy';
  }

  const { request } = state.createRequest(
    { lat: 23.2599, lng: 77.4126, severity: 'critical' },
    sim,
    t0
  );
  assert.ok(['pending', 'queued'].includes(request.status), 'Request should be pending or queued when no units are free');

  // Free up one unit outside
  const amb = sim.units.get('AMB-01');
  amb.status = 'free';
  amb.lat = 23.2599 + 0.01;
  amb.lng = 77.4126;

  // Trigger spike and re-rank
  const spikeResult = state.triggerSpike({ lat: 23.2599, lng: 77.4126 }, sim, t0 + 1000);
  assert.strictEqual(spikeResult.reRankedCount, 1, 'Pending request should be re-ranked');

  const updatedReq = state.getRequest(request.id);
  assert.strictEqual(updatedReq.status, 'assigned', 'Pending request should become assigned now');
  assert.strictEqual(updatedReq.assignedUnitId, 'AMB-01');
});

test('4. request validation enforces box coordinates and severity enum', (t) => {
  const state = new DispatchStateManager();

  // Out of bounds lat
  assert.throws(() => {
    state.createRequest({ lat: 24.0, lng: 77.4126, severity: 'minor' });
  }, /out of bounds/i);

  // Out of bounds lng
  assert.throws(() => {
    state.createRequest({ lat: 23.2599, lng: 80.0, severity: 'minor' });
  }, /out of bounds/i);

  // Invalid severity
  assert.throws(() => {
    state.createRequest({ lat: 23.2599, lng: 77.4126, severity: 'unknown' });
  }, /invalid severity/i);
});
