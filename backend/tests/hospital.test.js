import test from 'node:test';
import assert from 'node:assert';
import { DUMMY_HOSPITALS, selectHospital } from '../server/hospitals/list.js';

test('1. all 4 hospitals are explicitly marked as DUMMY DATA', (t) => {
  assert.strictEqual(DUMMY_HOSPITALS.length, 4, 'Must have exactly 4 hospitals');

  for (const h of DUMMY_HOSPITALS) {
    assert.strictEqual(h.isDummy, true);
    assert.strictEqual(h.disclaimer, 'DUMMY DATA');
    assert.ok(h.id);
    assert.ok(h.name);
    assert.ok(['government', 'private'].includes(h.type));
    assert.ok(typeof h.totalBeds === 'number');
    assert.ok(typeof h.icuBeds === 'number');
  }
});

test('2. nearest hospital default selection', (t) => {
  // Near AIIMS Bhopal (23.2085, 77.4602)
  const coordsNearAiims = { lat: 23.2100, lng: 77.4580 };
  const result = selectHospital(coordsNearAiims, 'nearest');

  assert.ok(result.hospital);
  assert.strictEqual(result.hospital.id, 'HOSP-02', 'Should pick AIIMS Bhopal as nearest');
  assert.strictEqual(result.fallback, false);
  assert.ok(result.disclaimer.includes('DUMMY DATA'));
});

test('3. government hospital preference selects nearest government facility', (t) => {
  // Near Bansal Hospital (private at 23.2030, 77.4280)
  // Even though Bansal is closest, preference is government -> AIIMS (HOSP-02) or BMHRC (HOSP-01)
  const coordsNearBansal = { lat: 23.2035, lng: 77.4285 };
  const result = selectHospital(coordsNearBansal, 'government');

  assert.strictEqual(result.hospital.type, 'government', 'Must pick a government hospital');
  assert.strictEqual(result.fallback, false);
});

test('4. private hospital preference selects nearest private facility', (t) => {
  const coords = { lat: 23.2500, lng: 77.4000 };
  const result = selectHospital(coords, 'private');

  assert.strictEqual(result.hospital.type, 'private', 'Must pick a private hospital');
  assert.strictEqual(result.fallback, false);
});

test('5. invalid preference falls back to nearest with explanatory note', (t) => {
  const coords = { lat: 23.2500, lng: 77.4000 };
  const result = selectHospital(coords, 'non_existent_specialty');

  assert.ok(result.hospital);
  assert.strictEqual(result.fallback, true, 'Fallback flag must be true');
  assert.ok(result.fallbackReason.includes('defaulted to nearest'), 'Reason must explain fallback');
  assert.ok(result.disclaimer.includes('DUMMY DATA'));
});
