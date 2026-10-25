// Live detail for one incoming patient: where the patient is, where the ambulance is now,
// its speed, and the remaining ETA. Speed is the unit's configured speed (km/h), the same
// value the fleet simulator moves the unit with.

import { getMessage } from './inbox.js';
import { fleetSimulator } from '../sim/fleet.js';
import { dispatchState } from '../dispatch/state.js';
import { haversineDistanceKm } from '../dispatch/rank.js';

const ARRIVED_KM = 0.05; // within 50 m counts as arrived

function round(n, digits) {
  return Number(n.toFixed(digits));
}

export function hospitalDetail(messageId, now = Date.now()) {
  const msg = getMessage(messageId);
  if (!msg) return null;

  // The unit can be assigned after the hospital was chosen, so read it from the request
  const request = dispatchState.getRequest(msg.requestId);
  const unitId = request?.assignedUnitId || msg.unitId;
  const unit = unitId ? fleetSimulator.getUnit(unitId) : null;

  let distanceKm = null;
  let etaMinutes = null;
  let arrived = false;
  if (unit && msg.patient) {
    distanceKm = round(haversineDistanceKm(unit.lat, unit.lng, msg.patient.lat, msg.patient.lng), 2);
    arrived = distanceKm <= ARRIVED_KM;
    etaMinutes = arrived ? 0 : round((distanceKm / unit.speed) * 60, 1);
  }

  return {
    messageId: msg.id,
    requestId: msg.requestId,
    status: msg.status,
    changeRequested: msg.changeRequested,
    severity: msg.severity,
    incidentType: msg.incidentType,
    peopleInjured: msg.peopleInjured,
    redFlags: msg.redFlags,
    description: msg.description,
    landmark: msg.landmark,
    isSafe: msg.isSafe,
    phoneLast4: msg.phoneLast4,
    patient: msg.patient,
    hospital: { name: msg.hospitalName, location: msg.hospitalLocation },
    unit: unit
      ? { id: unit.id, type: unit.type, status: unit.status, lat: unit.lat, lng: unit.lng, speedKmh: unit.speed }
      : null,
    distanceKm,
    etaMinutes,
    arrived,
    updatedAt: now
  };
}
