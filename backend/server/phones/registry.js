// Phone units: registration, GPS location, drill alerts, Accept, and timeout
// A phone is a real unit in the fleet, tagged source 'phone'.
// Alerts are derived from the latest 'assigned' request for that unit, so the
// assignment code (state.js, queue.js) does not need to know about phones.
// NEVER logs phone names or request text.

import { fleetSimulator } from '../sim/fleet.js';
import { dispatchState } from '../dispatch/state.js';
import { MAP_CONFIG } from '../config.js';

export const PHONE_ACCEPT_TIMEOUT_S = 20; // shorter than the 30s busy timer
export const DEMO_LOCATION = { lat: MAP_CONFIG.CENTER_LAT, lng: MAP_CONFIG.CENTER_LNG };

const VALID_TYPES = ['ambulance', 'bike'];
const acceptedRequestIds = new Set();
const expiredRequestIds = new Set();
let phoneCounter = 0;

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function getPhone(id) {
  const unit = fleetSimulator.getUnit(id);
  if (!unit || unit.source !== 'phone') {
    throw httpError('Phone not found', 404);
  }
  return unit;
}

export function registerPhone({ name, type } = {}) {
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 30) {
    throw httpError('name is required (1 to 30 characters)', 400);
  }
  if (!VALID_TYPES.includes(type)) {
    throw httpError('type must be ambulance or bike', 400);
  }

  phoneCounter += 1;
  const id = `PHONE-${String(phoneCounter).padStart(2, '0')}`;
  // gpsUpdatedAt 0 means "no GPS yet": the ranking treats the unit as stale
  // until the first location arrives, so it is not assigned blindly
  fleetSimulator.registerPhoneUnit({
    id,
    name: name.trim(),
    type,
    speed: 0,
    lat: DEMO_LOCATION.lat,
    lng: DEMO_LOCATION.lng,
    isDemoLocation: false,
    gpsUpdatedAt: 0
  });
  return { id, name: name.trim(), type };
}

export function updateLocation(id, { lat, lng, demo = false } = {}) {
  getPhone(id);
  const point = demo ? DEMO_LOCATION : { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    throw httpError('lat and lng must be numbers', 400);
  }
  const inBox =
    point.lat >= MAP_CONFIG.MIN_LAT && point.lat <= MAP_CONFIG.MAX_LAT &&
    point.lng >= MAP_CONFIG.MIN_LNG && point.lng <= MAP_CONFIG.MAX_LNG;
  if (!inBox) {
    throw httpError('location is outside the drill area', 400);
  }
  fleetSimulator.updatePhoneLocation(id, point.lat, point.lng, Boolean(demo));
  return { id, lat: point.lat, lng: point.lng, isDemoLocation: Boolean(demo) };
}

// Latest request assigned to this unit that is still awaiting Accept
function pendingAssignment(unitId) {
  let latest = null;
  for (const req of dispatchState.getAllRequests()) {
    if (req.assignedUnitId === unitId && req.status === 'assigned') {
      if (!latest || req.createdAt > latest.createdAt) latest = req;
    }
  }
  return latest;
}

export function getAlert(id, now = Date.now()) {
  getPhone(id);
  const req = pendingAssignment(id);
  if (!req || expiredRequestIds.has(req.id)) return null;
  const elapsedS = Math.max(0, (now - req.createdAt) / 1000);
  return {
    requestId: req.id,
    severity: req.severity,
    accepted: acceptedRequestIds.has(req.id),
    secondsLeft: Math.max(0, Math.ceil(PHONE_ACCEPT_TIMEOUT_S - elapsedS)),
    // Drill only: the phone shows a demo incident, not real patient data
    note: 'PROTOTYPE / DRILL'
  };
}

export function acceptAlert(id) {
  getPhone(id);
  const req = pendingAssignment(id);
  if (!req || expiredRequestIds.has(req.id)) {
    throw httpError('No active alert to accept', 404);
  }
  acceptedRequestIds.add(req.id);
  return { requestId: req.id, accepted: true };
}

// Frees phone units whose alert was not accepted within the timeout.
// Returns the unit ids it freed (called on every fleet tick).
export function expireAlerts(now = Date.now()) {
  const freed = [];
  for (const unit of fleetSimulator.getUnits()) {
    if (unit.source !== 'phone') continue;
    const req = pendingAssignment(unit.id);
    if (!req || acceptedRequestIds.has(req.id) || expiredRequestIds.has(req.id)) continue;
    if (now - req.createdAt >= PHONE_ACCEPT_TIMEOUT_S * 1000) {
      expiredRequestIds.add(req.id);
      fleetSimulator.setUnitFree(unit.id);
      freed.push(unit.id);
    }
  }
  return freed;
}

export function removePhone(id) {
  getPhone(id);
  fleetSimulator.setUnitFree(id);
  fleetSimulator.removePhoneUnit(id);
  return { id, removed: true };
}
