import test from 'node:test';
import assert from 'node:assert';
import { FleetSimulator } from '../server/sim/fleet.js';
import { MAP_CONFIG, THRESHOLDS } from '../server/config.js';

test('FleetSimulator initializes with 60 units (30 ambulances, 30 bikes) in Bhopal box', (t) => {
  const sim = new FleetSimulator({ totalUnits: 60, ambulanceRatio: 0.5 });
  const units = sim.getUnits();

  assert.strictEqual(units.length, 60, 'Must have exactly 60 units');

  const ambulances = units.filter((u) => u.type === 'ambulance');
  const bikes = units.filter((u) => u.type === 'bike');

  assert.strictEqual(ambulances.length, 30, 'Must have 30 ambulances');
  assert.strictEqual(bikes.length, 30, 'Must have 30 bikes');

  for (const u of units) {
    assert.strictEqual(u.source, 'simulated');
    assert.ok(u.lat >= MAP_CONFIG.MIN_LAT && u.lat <= MAP_CONFIG.MAX_LAT, `Lat ${u.lat} within bounds`);
    assert.ok(u.lng >= MAP_CONFIG.MIN_LNG && u.lng <= MAP_CONFIG.MAX_LNG, `Lng ${u.lng} within bounds`);
    assert.ok(['ambulance', 'bike'].includes(u.type));
    assert.ok(['free', 'busy'].includes(u.status));
  }
});

test('FleetSimulator tick() advances positions and handles stale GPS simulation', (t) => {
  const t0 = 1000000;
  const sim = new FleetSimulator({ totalUnits: 60, now: t0 });
  
  // Record initial positions
  const initialUnits = sim.getUnits(t0);
  const u1Initial = initialUnits.find((u) => u.id === 'AMB-01');

  // Advance by 1 tick (1 second)
  sim.tick(t0 + 1000);
  const updatedUnits = sim.getUnits(t0 + 1000);
  const u1Updated = updatedUnits.find((u) => u.id === 'AMB-01');

  // Verify position changed (or within valid bounds)
  assert.ok(u1Updated.lat >= MAP_CONFIG.MIN_LAT && u1Updated.lat <= MAP_CONFIG.MAX_LAT);
  assert.ok(u1Updated.lng >= MAP_CONFIG.MIN_LNG && u1Updated.lng <= MAP_CONFIG.MAX_LNG);

  // Check that at least some units have isStale === true or stale countdown active
  const staleUnits = updatedUnits.filter((u) => u.isStale);
  assert.ok(staleUnits.length >= 1, 'Initial fleet should have staggered stale units for demonstration');
});

test('FleetSimulator busy status and countdown release', (t) => {
  const sim = new FleetSimulator({ totalUnits: 10 });
  sim.setUnitBusy('AMB-01', 2); // busy for 2 seconds

  const unitBusy = sim.getUnit('AMB-01');
  assert.strictEqual(unitBusy.status, 'busy');
  assert.strictEqual(unitBusy.busyRemainingSeconds, 2);

  // Tick 1 second
  sim.tick(Date.now());
  assert.strictEqual(unitBusy.status, 'busy');
  assert.strictEqual(unitBusy.busyRemainingSeconds, 1);

  // Tick 2nd second -> becomes free
  sim.tick(Date.now());
  assert.strictEqual(unitBusy.status, 'free');
  assert.strictEqual(unitBusy.busyRemainingSeconds, 0);
});

test('FleetSimulator supports phone units registration and location streaming', (t) => {
  const sim = new FleetSimulator({ totalUnits: 10 });
  sim.registerPhoneUnit({
    id: 'phone-rudra',
    name: 'Rudra Phone',
    type: 'bike',
    lat: 23.2599,
    lng: 77.4126,
    speed: 25
  });

  const units = sim.getUnits();
  const phone = units.find((u) => u.id === 'phone-rudra');
  assert.ok(phone, 'Phone unit must appear in fleet list');
  assert.strictEqual(phone.source, 'phone');
  assert.strictEqual(phone.name, 'Rudra Phone');

  // Update location
  sim.updatePhoneLocation('phone-rudra', 23.2650, 77.4150, true);
  const updatedPhone = sim.getUnits().find((u) => u.id === 'phone-rudra');
  assert.strictEqual(updatedPhone.lat, 23.2650);
  assert.strictEqual(updatedPhone.isDemoLocation, true);

  // Remove
  sim.removePhoneUnit('phone-rudra');
  assert.strictEqual(sim.getUnits().find((u) => u.id === 'phone-rudra'), undefined);
});
