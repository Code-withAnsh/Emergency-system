// Regression: a unit sent to a patient stays busy until it arrives, not 30 s after dispatch
import test from 'node:test';
import assert from 'node:assert';
import { fleetSimulator } from '../server/sim/fleet.js';

test('1. dispatched unit stays busy for longer than the busy duration while on its way', () => {
  const unit = fleetSimulator.getUnits().find((u) => u.type === 'ambulance' && !u.isStale);
  assert.ok(unit, 'an ambulance exists');
  // Patient about 5 km away: the unit cannot arrive within 40 seconds
  const target = { lat: unit.lat + 0.045, lng: unit.lng + 0.001 };
  fleetSimulator.setUnitBusy(unit.id, 30, target);
  for (let i = 0; i < 40; i++) fleetSimulator.tick();
  const now = fleetSimulator.getUnit(unit.id);
  assert.strictEqual(now.status, 'busy', 'still busy while driving');
  assert.strictEqual(now.onTask, true);
  fleetSimulator.setUnitFree(unit.id);
});
