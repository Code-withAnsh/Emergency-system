// Hospital data source: MongoDB "emergency-system".hospitals, with the built-in list as fallback.
// Only the "hospitals" collection in the "emergency-system" database is touched.

import { DUMMY_HOSPITALS, setActiveHospitals } from './list.js';

const COLLECTION = 'hospitals';

export async function loadHospitals(db) {
  if (!db) {
    setActiveHospitals(DUMMY_HOSPITALS);
    return { source: 'builtin', count: DUMMY_HOSPITALS.length };
  }
  const col = db.collection(COLLECTION);
  await col.createIndex({ id: 1 }, { unique: true });

  // First run only: seed the four dummy hospitals (kept, labelled as dummy)
  const existing = await col.countDocuments();
  if (existing === 0) {
    await col.insertMany(DUMMY_HOSPITALS.map((h) => ({ ...h, source: 'dummy', verified: false })));
  }

  const docs = await col.find({}, { projection: { _id: 0 } }).toArray();
  // Dispatch uses only verified hospitals. OSM staging records wait for a person to verify them.
  const usable = docs.filter((h) => h.verified === true && Number.isFinite(h.lat) && Number.isFinite(h.lng));
  if (usable.length === 0) {
    // Nothing verified yet: keep the built-in dummy list active
    setActiveHospitals(DUMMY_HOSPITALS);
    return { source: 'builtin (no verified hospitals in database yet)', count: DUMMY_HOSPITALS.length };
  }
  setActiveHospitals(usable);
  return { source: 'mongo (verified)', count: usable.length };
}
