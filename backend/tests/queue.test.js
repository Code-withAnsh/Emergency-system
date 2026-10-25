import test from 'node:test';
import assert from 'node:assert';
import { RequestQueue } from '../server/dispatch/queue.js';
import { FleetSimulator } from '../server/sim/fleet.js';

test('1. critical request jumps the queue ahead of minor requests', (t) => {
  const queue = new RequestQueue();

  // Enqueue 2 minor requests
  queue.enqueue({ id: 'req-minor-1', severity: 'minor', lat: 23.25, lng: 77.41 });
  queue.enqueue({ id: 'req-minor-2', severity: 'minor', lat: 23.26, lng: 77.42 });

  assert.strictEqual(queue.getPosition('req-minor-1'), 1);
  assert.strictEqual(queue.getPosition('req-minor-2'), 2);

  // Enqueue a critical request: must jump to Position 1 ahead of both minors!
  queue.enqueue({ id: 'req-critical-1', severity: 'critical', lat: 23.27, lng: 77.43 });

  assert.strictEqual(queue.getPosition('req-critical-1'), 1, 'Critical request must jump to Position 1');
  assert.strictEqual(queue.getPosition('req-minor-1'), 2, 'Minor 1 pushed to Position 2');
  assert.strictEqual(queue.getPosition('req-minor-2'), 3, 'Minor 2 pushed to Position 3');

  // Enqueue a 2nd critical request: should be inserted after critical-1 but before minors!
  queue.enqueue({ id: 'req-critical-2', severity: 'critical', lat: 23.28, lng: 77.44 });

  assert.strictEqual(queue.getPosition('req-critical-1'), 1);
  assert.strictEqual(queue.getPosition('req-critical-2'), 2, 'Second critical is Position 2');
  assert.strictEqual(queue.getPosition('req-minor-1'), 3, 'Minor 1 is now Position 3');
  assert.strictEqual(queue.getPosition('req-minor-2'), 4, 'Minor 2 is now Position 4');
});

test('2. auto-assign when a unit frees up', (t) => {
  const sim = new FleetSimulator({ totalUnits: 10 });
  const queue = new RequestQueue();

  // Mark all units busy
  for (const u of sim.units.values()) {
    u.status = 'busy';
    u.busyRemainingSeconds = 20;
  }

  // Queue waiting critical request
  queue.enqueue({ id: 'req-waiting', severity: 'critical', lat: 23.2599, lng: 77.4126 });
  assert.strictEqual(queue.size(), 1);

  // Attempt processQueue with no free units
  const assignedNone = queue.processQueue(sim);
  assert.strictEqual(assignedNone.length, 0);
  assert.strictEqual(queue.size(), 1, 'Queue remains waiting');

  // Free up one ambulance
  const amb = sim.units.get('AMB-01');
  amb.status = 'free';
  amb.busyRemainingSeconds = 0;
  amb.lat = 23.2600;
  amb.lng = 77.4120;

  // Process queue now
  const newlyAssigned = queue.processQueue(sim);
  assert.strictEqual(newlyAssigned.length, 1, 'Should auto-assign the waiting request');
  assert.strictEqual(newlyAssigned[0].id, 'req-waiting');
  assert.strictEqual(newlyAssigned[0].assignedUnitId, 'AMB-01');
  assert.strictEqual(newlyAssigned[0].status, 'assigned');
  assert.ok(newlyAssigned[0].hospital, 'Should have hospital choice attached');
  assert.strictEqual(queue.size(), 0, 'Queue is now empty');
});

test('3. FIFO preserved within same severity level', (t) => {
  const queue = new RequestQueue();

  queue.enqueue({ id: 'c1', severity: 'critical', lat: 23.25, lng: 77.41 });
  queue.enqueue({ id: 'c2', severity: 'critical', lat: 23.25, lng: 77.41 });
  queue.enqueue({ id: 'c3', severity: 'critical', lat: 23.25, lng: 77.41 });

  assert.strictEqual(queue.getPosition('c1'), 1);
  assert.strictEqual(queue.getPosition('c2'), 2);
  assert.strictEqual(queue.getPosition('c3'), 3);
});
