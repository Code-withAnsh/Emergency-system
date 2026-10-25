// Tests for Phase 6: phone join, GPS location, drill alert, Accept, timeout, leave
// Covers: register, location update, alert on assignment, timeout frees the unit

import test from 'node:test';
import assert from 'node:assert';
import { fleetSimulator } from '../server/sim/fleet.js';
import { dispatchState } from '../server/dispatch/state.js';
import {
  registerPhone,
  updateLocation,
  getAlert,
  acceptAlert,
  expireAlerts,
  removePhone,
  PHONE_ACCEPT_TIMEOUT_S,
  DEMO_LOCATION
} from '../server/phones/registry.js';

const SPOT = { lat: 23.2599, lng: 77.4126 };

test('1. register: valid name and type creates a phone unit tagged source phone', () => {
  const phone = registerPhone({ name: '  Ravi  ', type: 'ambulance' });
  assert.match(phone.id, /^PHONE-\d{2}$/);
  assert.strictEqual(phone.name, 'Ravi');
  const unit = fleetSimulator.getUnit(phone.id);
  assert.strictEqual(unit.source, 'phone');
  assert.strictEqual(unit.type, 'ambulance');
  removePhone(phone.id);
});

test('2. register: invalid name or type is rejected with 400', () => {
  assert.throws(() => registerPhone({ name: '', type: 'bike' }), (e) => e.statusCode === 400);
  assert.throws(() => registerPhone({ name: 'x'.repeat(31), type: 'bike' }), (e) => e.statusCode === 400);
  assert.throws(() => registerPhone({ name: 'Ravi', type: 'car' }), (e) => e.statusCode === 400);
});

test('3. location: point inside the drill box is accepted, outside is rejected', () => {
  const phone = registerPhone({ name: 'Asha', type: 'bike' });
  const ok = updateLocation(phone.id, { lat: SPOT.lat, lng: SPOT.lng });
  assert.strictEqual(ok.isDemoLocation, false);
  assert.strictEqual(fleetSimulator.getUnit(phone.id).gpsUpdatedAt > 0, true);

  assert.throws(() => updateLocation(phone.id, { lat: 10, lng: 10 }), (e) => e.statusCode === 400);
  assert.throws(() => updateLocation(phone.id, { lat: 'abc', lng: 77 }), (e) => e.statusCode === 400);
  removePhone(phone.id);
});

test('4. location: demo location is used when GPS is weak', () => {
  const phone = registerPhone({ name: 'Dev', type: 'bike' });
  const res = updateLocation(phone.id, { demo: true });
  assert.strictEqual(res.isDemoLocation, true);
  assert.strictEqual(res.lat, DEMO_LOCATION.lat);
  assert.strictEqual(fleetSimulator.getUnit(phone.id).isDemoLocation, true);
  removePhone(phone.id);
});

test('5. alert on assignment: a phone at the pin is assigned and gets an alert', () => {
  const phone = registerPhone({ name: 'Meena', type: 'ambulance' });
  updateLocation(phone.id, { lat: SPOT.lat, lng: SPOT.lng });

  const { request } = dispatchState.createRequest(
    { lat: SPOT.lat, lng: SPOT.lng, severity: 'critical' },
    fleetSimulator
  );
  assert.strictEqual(request.assignedUnitId, phone.id, 'phone at the pin should be chosen');

  const alert = getAlert(phone.id);
  assert.ok(alert, 'phone should have an active alert');
  assert.strictEqual(alert.requestId, request.id);
  assert.strictEqual(alert.accepted, false);
  assert.strictEqual(alert.note, 'PROTOTYPE / DRILL');

  removePhone(phone.id);
});

test('6. accept: clears the pending state and marks the alert accepted', () => {
  const phone = registerPhone({ name: 'Kiran', type: 'ambulance' });
  updateLocation(phone.id, { lat: SPOT.lat, lng: SPOT.lng });
  const { request } = dispatchState.createRequest(
    { lat: SPOT.lat, lng: SPOT.lng, severity: 'critical' },
    fleetSimulator
  );
  assert.strictEqual(request.assignedUnitId, phone.id);

  const accepted = acceptAlert(phone.id);
  assert.strictEqual(accepted.accepted, true);
  assert.strictEqual(getAlert(phone.id).accepted, true);

  // Accepted alerts are not freed by the timeout
  assert.deepStrictEqual(expireAlerts(Date.now() + (PHONE_ACCEPT_TIMEOUT_S + 10) * 1000), []);
  removePhone(phone.id);
});

test('7. timeout: unaccepted alert frees the unit after the accept window', () => {
  const phone = registerPhone({ name: 'Sunil', type: 'ambulance' });
  updateLocation(phone.id, { lat: SPOT.lat, lng: SPOT.lng });
  dispatchState.createRequest({ lat: SPOT.lat, lng: SPOT.lng, severity: 'critical' }, fleetSimulator);
  assert.strictEqual(fleetSimulator.getUnit(phone.id).status, 'busy');

  // Before the window: nothing freed
  assert.deepStrictEqual(expireAlerts(Date.now() + 1000), []);
  assert.ok(getAlert(phone.id));

  // After the window: freed and alert gone
  const freed = expireAlerts(Date.now() + (PHONE_ACCEPT_TIMEOUT_S + 1) * 1000);
  assert.ok(freed.includes(phone.id));
  assert.strictEqual(fleetSimulator.getUnit(phone.id).status, 'free');
  assert.strictEqual(getAlert(phone.id), null);

  removePhone(phone.id);
});

test('8. leave: removing a phone drops it from the fleet and any alert', () => {
  const phone = registerPhone({ name: 'Nisha', type: 'bike' });
  removePhone(phone.id);
  assert.strictEqual(fleetSimulator.getUnit(phone.id), null);
  assert.throws(() => getAlert(phone.id), (e) => e.statusCode === 404);
});

test('9. accept with no alert returns 404', () => {
  const phone = registerPhone({ name: 'Omar', type: 'bike' });
  assert.throws(() => acceptAlert(phone.id), (e) => e.statusCode === 404);
  removePhone(phone.id);
});

test('10. no GPS yet: a phone without a location is stale and not assigned', () => {
  const phone = registerPhone({ name: 'Priya', type: 'ambulance' });
  const unit = fleetSimulator.getUnit(phone.id);
  assert.strictEqual(unit.gpsUpdatedAt, 0, 'no GPS yet must not look fresh');
  assert.strictEqual(unit.isStale ?? true, true);

  const { request } = dispatchState.createRequest(
    { lat: SPOT.lat, lng: SPOT.lng, severity: 'critical' },
    fleetSimulator
  );
  assert.notStrictEqual(request.assignedUnitId, phone.id, 'phone with no GPS must not be chosen');
  removePhone(phone.id);
});
