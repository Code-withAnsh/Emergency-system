// 4 DUMMY Hospitals for Bhopal Operations Area & Patient Choice Engine
import { haversineDistanceKm } from '../dispatch/rank.js';

export const DUMMY_HOSPITALS = [
  {
    id: 'HOSP-01',
    name: 'Bhopal Memorial Hospital & Research Centre (BMHRC)',
    type: 'government',
    lat: 23.2980,
    lng: 77.4020,
    totalBeds: 350,
    icuBeds: 24,
    emergency: true,
    ayushman: null,
    bedsAvailable: 42,
    icuAvailable: 3,
    emergencyPhone: '0755-DUMMY-01',
    isDummy: true,
    disclaimer: 'DUMMY DATA'
  },
  {
    id: 'HOSP-02',
    name: 'All India Institute of Medical Sciences (AIIMS Bhopal)',
    type: 'government',
    lat: 23.2085,
    lng: 77.4602,
    totalBeds: 500,
    icuBeds: 45,
    emergency: true,
    ayushman: null,
    bedsAvailable: 18,
    icuAvailable: 0,
    emergencyPhone: '0755-DUMMY-02',
    isDummy: true,
    disclaimer: 'DUMMY DATA'
  },
  {
    id: 'HOSP-03',
    name: 'Bansal Hospital',
    type: 'private',
    lat: 23.2030,
    lng: 77.4280,
    totalBeds: 250,
    icuBeds: 18,
    emergency: true,
    ayushman: null,
    bedsAvailable: 25,
    icuAvailable: 2,
    emergencyPhone: '0755-DUMMY-03',
    isDummy: true,
    disclaimer: 'DUMMY DATA'
  },
  {
    id: 'HOSP-04',
    name: 'Chirayu Medical College & Hospital',
    type: 'private',
    lat: 23.2750,
    lng: 77.3450,
    totalBeds: 400,
    icuBeds: 30,
    emergency: false,
    ayushman: null,
    bedsAvailable: 0,
    icuAvailable: 0,
    emergencyPhone: '0755-DUMMY-04',
    isDummy: true,
    disclaimer: 'DUMMY DATA'
  }
];

/**
 * Selects hospital based on patient preference and proximity
 * @param {Object} coords - { lat, lng } incident coordinate
 * @param {string} preference - 'nearest' | 'government' | 'private' | hospitalId
 * @returns {Object} Selected hospital details with fallback explanation
 */
// Active list: DUMMY_HOSPITALS by default, replaced by the database list at startup
let activeHospitals = DUMMY_HOSPITALS;
export function setActiveHospitals(list) {
  activeHospitals = list;
}
export function getActiveHospitals() {
  return activeHospitals;
}

export function selectHospital(coords, preference = 'nearest') {
  if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
    return null;
  }

  const normalizedPref = (preference || 'nearest').toLowerCase();

  // Calculate distances to all dummy hospitals
  const hospitalsWithDistance = activeHospitals.map((h) => {
    const dist = haversineDistanceKm(coords.lat, coords.lng, h.lat, h.lng);
    // Hospital transit speed ~40 km/h
    const transitEtaMinutes = (dist / 40) * 60;
    return {
      ...h,
      distance_km: Number(dist.toFixed(2)),
      transit_eta_minutes: Number(transitEtaMinutes.toFixed(1))
    };
  }).sort((a, b) => a.distance_km - b.distance_km);

  const nearestHospital = hospitalsWithDistance[0];

  let selected = null;
  let fallback = false;
  let fallbackReason = null;

  if (normalizedPref === 'nearest') {
    selected = nearestHospital;
  } else if (normalizedPref === 'government') {
    const govHospitals = hospitalsWithDistance.filter((h) => h.type === 'government');
    if (govHospitals.length > 0) {
      selected = govHospitals[0];
    } else {
      selected = nearestHospital;
      fallback = true;
      fallbackReason = 'No government hospital available, defaulted to nearest';
    }
  } else if (normalizedPref === 'private') {
    const privHospitals = hospitalsWithDistance.filter((h) => h.type === 'private');
    if (privHospitals.length > 0) {
      selected = privHospitals[0];
    } else {
      selected = nearestHospital;
      fallback = true;
      fallbackReason = 'No private hospital available, defaulted to nearest';
    }
  } else {
    // Check specific hospital ID
    const match = hospitalsWithDistance.find((h) => h.id.toLowerCase() === normalizedPref);
    if (match) {
      selected = match;
    } else {
      selected = nearestHospital;
      fallback = true;
      fallbackReason = `Hospital "${preference}" not found, defaulted to nearest`;
    }
  }

  return {
    hospital: selected,
    preference: normalizedPref,
    fallback,
    fallbackReason,
    disclaimer: 'DUMMY DATA — HOSPITAL PARTNERSHIPS PLANNED IN ROADMAP'
  };
}
