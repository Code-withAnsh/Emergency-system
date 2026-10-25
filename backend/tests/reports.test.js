// Tests for Phase A: accident report form, red-flag severity, tracking view
// Covers: validation, red flags force critical, phone never shown in tracking, 404

import test from 'node:test';
import assert from 'node:assert';
import { validateReport, createReport, getTracking } from '../server/reports/reports.js';

const BASE = {
  incidentType: 'accident',
  description: 'Bike ka accident hua, ek vyakti sadak par hai',
  phone: '+91 98765 43210',
  name: 'Test Caller',
  peopleInjured: 1,
  lat: 23.2599,
  lng: 77.4126,
  isSafe: true
};

test('1. validation: bad type, short text, bad phone, outside box are rejected with 400', () => {
  assert.throws(() => validateReport({ ...BASE, incidentType: 'fire' }), (e) => e.statusCode === 400);
  assert.throws(() => validateReport({ ...BASE, description: 'ab' }), (e) => e.statusCode === 400);
  assert.throws(() => validateReport({ ...BASE, phone: '12345' }), (e) => e.statusCode === 400);
  assert.throws(() => validateReport({ ...BASE, lat: 10, lng: 10 }), (e) => /Bhopal drill area/.test(e.message));
  assert.throws(() => validateReport({ ...BASE, lat: undefined }), (e) => /Location is required/.test(e.message));
});

test('2. validation: a valid report keeps only the last 4 digits of the phone', () => {
  const r = validateReport(BASE);
  assert.strictEqual(r.phoneLast4, '3210');
  assert.strictEqual(r.peopleInjured, 1);
  assert.deepStrictEqual(r.redFlags, { notConscious: false, notBreathing: false, heavyBleeding: false });
});

test('3. red flag (not breathing) forces critical without calling the AI chain', async () => {
  const created = await createReport({ ...BASE, notBreathing: true });
  assert.strictEqual(created.severity, 'critical');
  assert.strictEqual(created.severitySource, 'red-flag');
  assert.match(created.requestId, /^REQ-\d{3}$/);
});

test('4. tracking: shows unit, distance and ETA, and never the phone number or name', async () => {
  const created = await createReport({ ...BASE, heavyBleeding: true, landmark: 'Bhadbhada Chauraha' });
  const { tracking } = { tracking: getTracking(created.requestId) };

  assert.strictEqual(tracking.requestId, created.requestId);
  assert.strictEqual(tracking.incident.landmark, 'Bhadbhada Chauraha');
  if (tracking.unit) {
    assert.ok(tracking.distanceKm >= 0);
    assert.ok(tracking.etaMinutes >= 0);
  }

  const json = JSON.stringify(tracking);
  assert.ok(!json.includes('3210'), 'phone digits must not be in tracking');
  assert.ok(!json.includes('Test Caller'), 'caller name must not be in tracking');
});

test('5. tracking: unknown report id returns 404', () => {
  assert.throws(() => getTracking('REQ-999999'), (e) => e.statusCode === 404);
});

test('6. no red flags: severity comes from triage and is one of the allowed values', async () => {
  const created = await createReport({ ...BASE, description: 'halka sa sar dard aur bukhar hai' });
  assert.ok(['critical', 'minor'].includes(created.severity));
  assert.ok(['gemini', 'groq', 'button'].includes(created.severitySource));
});

test('7. admin list: includes details for the authority, critical first', async () => {
  const { listReports } = await import('../server/reports/reports.js');
  await createReport({ ...BASE, description: 'minor cut on hand, small bleeding', lat: 23.26, lng: 77.41 });
  await createReport({ ...BASE, notConscious: true, description: 'person fell and not responding' });
  const list = listReports();
  assert.ok(list.length >= 2);
  assert.strictEqual(list[0].severity, 'critical');
  assert.ok(list.every((r) => r.phoneLast4 === '3210'));
  assert.ok(list[0].description.length > 0, 'authority sees the description');
});

test('8. control room: closing a report marks it closed in the admin list', async () => {
  const { listReports, closeReport } = await import('../server/reports/reports.js');
  const created = await createReport({ ...BASE, description: 'fall on stairs, mild pain' });
  assert.strictEqual(listReports().find((r) => r.requestId === created.requestId).closed, false);
  closeReport(created.requestId);
  assert.strictEqual(listReports().find((r) => r.requestId === created.requestId).closed, true);
  assert.throws(() => closeReport('REQ-999999'), (e) => e.statusCode === 404);
});
