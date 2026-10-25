import test from 'node:test';
import assert from 'node:assert';
import { rank, haversineDistanceKm, calculateEtaMinutes } from '../server/dispatch/rank.js';
import { MAP_CONFIG } from '../server/config.js';

const BASE_REQ = {
  lat: MAP_CONFIG.CENTER_LAT,
  lng: MAP_CONFIG.CENTER_LNG,
  severity: 'critical'
};

test('1. nearest unit is busy: excluded from assignment', (t) => {
  const now = 100000;
  const units = [
    {
      id: 'amb-busy-close',
      type: 'ambulance',
      lat: BASE_REQ.lat + 0.003, // ~0.33 km
      lng: BASE_REQ.lng,
      status: 'busy',
      gpsUpdatedAt: now
    },
    {
      id: 'amb-free-far',
      type: 'ambulance',
      lat: BASE_REQ.lat + 0.015, // ~1.66 km
      lng: BASE_REQ.lng,
      status: 'free',
      gpsUpdatedAt: now
    }
  ];

  const result = rank(units, BASE_REQ, { now });

  assert.ok(result.chosen, 'Should pick a unit');
  assert.strictEqual(result.chosen.id, 'amb-free-far', 'Busy unit must not be chosen');
  assert.strictEqual(result.nearest.id, 'amb-free-far', 'Nearest free unit should be amb-free-far');
});

test('2. nearest unit is stale: critical excludes it, minor penalises it', (t) => {
  const now = 100000;
  const units = [
    {
      id: 'amb-stale-close',
      type: 'ambulance',
      lat: BASE_REQ.lat + 0.005, // ~0.55 km
      lng: BASE_REQ.lng,
      status: 'free',
      gpsAge: 35 // > 20s stale
    },
    {
      id: 'amb-fresh-far',
      type: 'ambulance',
      lat: BASE_REQ.lat + 0.015, // ~1.66 km
      lng: BASE_REQ.lng,
      status: 'free',
      gpsAge: 5 // fresh
    }
  ];

  // Critical request excludes stale unit
  const critResult = rank(units, { ...BASE_REQ, severity: 'critical' }, { now });
  assert.strictEqual(critResult.chosen.id, 'amb-fresh-far', 'Critical must exclude stale unit');
  assert.strictEqual(critResult.nearest.id, 'amb-stale-close', 'Nearest free unit is tracked for comparison');

  // Minor request penalises stale unit (+3 min)
  const minorResult = rank(units, { ...BASE_REQ, severity: 'minor' }, { now });
  // For stale unit: dist ~0.55 km -> ETA ~ (0.55/40)*60 + 1 = 1.83 min + 3 penalty = 4.83 min
  // For fresh unit: dist ~1.66 km -> ETA ~ (1.66/40)*60 + 1 = 3.50 min + 0 penalty = 3.50 min
  assert.strictEqual(minorResult.chosen.id, 'amb-fresh-far', 'Fresh unit wins due to +3m penalty on stale');
  const staleCandidate = minorResult.ranked.find((c) => c.id === 'amb-stale-close');
  assert.ok(staleCandidate.penalties >= 3, 'Stale candidate must have at least +3m penalty');
});

test('3. critical request with no free ambulance triggers bike fallback flag', (t) => {
  const now = 100000;
  const units = [
    {
      id: 'amb-busy',
      type: 'ambulance',
      lat: BASE_REQ.lat + 0.01,
      lng: BASE_REQ.lng,
      status: 'busy',
      gpsAge: 2
    },
    {
      id: 'bike-1',
      type: 'bike',
      lat: BASE_REQ.lat + 0.01,
      lng: BASE_REQ.lng,
      status: 'free',
      gpsAge: 4
    }
  ];

  const result = rank(units, { ...BASE_REQ, severity: 'critical' }, { now });
  assert.ok(result.chosen, 'Should pick a unit');
  assert.strictEqual(result.chosen.id, 'bike-1');
  assert.strictEqual(result.bikeFallback, true, 'Result flag bikeFallback must be true');
  assert.strictEqual(result.chosen.isBikeFallback, true);
  assert.strictEqual(result.chosen.penalties, 5, 'Critical bike fallback must have +5m penalty');
});

test('4. minor request prefers a bike', (t) => {
  const now = 100000;
  // Both at exactly same distance: 1.0 km
  // Bike ETA = (1 / 25) * 60 + 1 = 3.4 min, penalty = 0 -> score = 3.4
  // Ambulance ETA = (1 / 40) * 60 + 1 = 2.5 min, penalty = 2 -> score = 4.5
  const units = [
    {
      id: 'amb-1',
      type: 'ambulance',
      lat: BASE_REQ.lat + 0.009,
      lng: BASE_REQ.lng,
      status: 'free',
      gpsAge: 2
    },
    {
      id: 'bike-1',
      type: 'bike',
      lat: BASE_REQ.lat + 0.009,
      lng: BASE_REQ.lng,
      status: 'free',
      gpsAge: 2
    }
  ];

  const result = rank(units, { ...BASE_REQ, severity: 'minor' }, { now });
  assert.strictEqual(result.chosen.type, 'bike', 'Minor request must prefer bike');
  assert.strictEqual(result.chosen.id, 'bike-1');
  assert.ok(result.chosen.score < result.runnerUp.score, 'Bike score must be lower than ambulance');
});

test('5. no free unit at all produces clear null result without crash', (t) => {
  const units = [
    { id: 'u1', type: 'ambulance', lat: 23.25, lng: 77.41, status: 'busy', gpsAge: 1 },
    { id: 'u2', type: 'bike', lat: 23.26, lng: 77.42, status: 'busy', gpsAge: 2 }
  ];

  const result = rank(units, BASE_REQ);
  assert.strictEqual(result.chosen, null);
  assert.strictEqual(result.runnerUp, null);
  assert.strictEqual(result.nearest, null);
  assert.deepStrictEqual(result.ranked, []);
});

test('6. tie-break by GPS age then by id', (t) => {
  const now = 100000;
  // Case A: same score, different GPS age
  const unitsGpsTie = [
    { id: 'amb-old', type: 'ambulance', lat: BASE_REQ.lat + 0.01, lng: BASE_REQ.lng, status: 'free', gpsAge: 12 },
    { id: 'amb-new', type: 'ambulance', lat: BASE_REQ.lat + 0.01, lng: BASE_REQ.lng, status: 'free', gpsAge: 3 }
  ];
  const resGps = rank(unitsGpsTie, BASE_REQ, { now });
  assert.strictEqual(resGps.chosen.id, 'amb-new', 'Lower GPS age should break tie');

  // Case B: same score, same GPS age, different id
  const unitsIdTie = [
    { id: 'amb-20', type: 'ambulance', lat: BASE_REQ.lat + 0.01, lng: BASE_REQ.lng, status: 'free', gpsAge: 5 },
    { id: 'amb-05', type: 'ambulance', lat: BASE_REQ.lat + 0.01, lng: BASE_REQ.lng, status: 'free', gpsAge: 5 }
  ];
  const resId = rank(unitsIdTie, BASE_REQ, { now });
  assert.strictEqual(resId.chosen.id, 'amb-05', 'Lower ID should break tie');
});

test('7. runner-up and nearest-unit output fields', (t) => {
  const now = 100000;
  const units = [
    { id: 'u1', type: 'ambulance', lat: BASE_REQ.lat + 0.005, lng: BASE_REQ.lng, status: 'free', gpsAge: 2 },
    { id: 'u2', type: 'ambulance', lat: BASE_REQ.lat + 0.010, lng: BASE_REQ.lng, status: 'free', gpsAge: 2 },
    { id: 'u3', type: 'ambulance', lat: BASE_REQ.lat + 0.020, lng: BASE_REQ.lng, status: 'free', gpsAge: 2 }
  ];

  const result = rank(units, BASE_REQ, { now });
  assert.strictEqual(result.chosen.id, 'u1');
  assert.strictEqual(result.runnerUp.id, 'u2');
  assert.strictEqual(result.nearest.id, 'u1');

  // Check required data fields
  for (const field of ['id', 'type', 'distance_km', 'eta_minutes', 'gpsAge_s', 'score']) {
    assert.ok(result.chosen[field] !== undefined, `chosen should have ${field}`);
    assert.ok(result.runnerUp[field] !== undefined, `runnerUp should have ${field}`);
  }
});
