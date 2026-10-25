// Hospital choices for a citizen's incident: hospitals within 30 km, each card with
// distance, ambulance ETA, emergency, Ayushman (PM-JAY) and bed info.
// Unknown facts stay null. The UI shows them as "not verified", never as a guess.

import { getActiveHospitals } from './list.js';
import { haversineDistanceKm } from '../dispatch/rank.js';

export const HOSPITAL_RADIUS_KM = 30;
const AMBULANCE_SPEED_KMH = 40; // same transit speed as selectHospital

function round1(n) {
  return Number(n.toFixed(1));
}

export function hospitalOptionFor(hospital, lat, lng) {
  const distanceKm = haversineDistanceKm(lat, lng, hospital.lat, hospital.lng);
  return {
    hospitalId: hospital.id,
    name: hospital.name,
    type: hospital.type || 'unknown',
    phone: hospital.emergencyPhone || hospital.phone || null,
    address: hospital.address || null,
    distanceKm: round1(distanceKm),
    etaMinutes: round1((distanceKm / AMBULANCE_SPEED_KMH) * 60),
    emergency: hospital.emergency ?? null,
    ayushman: hospital.ayushman ?? null,
    bedsAvailable: hospital.bedsAvailable ?? null,
    icuAvailable: hospital.icuAvailable ?? null,
    isDummy: hospital.isDummy === true
  };
}

// Score: lower is better. Far away, no emergency desk, or no beds push a hospital down.
function score(option) {
  let s = option.etaMinutes;
  if (option.emergency === false) s += 15;
  if (option.bedsAvailable === 0) s += 20;
  return s;
}

export function hospitalOptions(lat, lng, { radiusKm = HOSPITAL_RADIUS_KM, limit = 5 } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  return getActiveHospitals()
    .map((h) => hospitalOptionFor(h, lat, lng))
    .filter((o) => o.distanceKm <= radiusKm)
    .sort((a, b) => score(a) - score(b))
    .slice(0, limit)
    .map((o, i) => ({ ...o, recommended: i === 0 }));
}
