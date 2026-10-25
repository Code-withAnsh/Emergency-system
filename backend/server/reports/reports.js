// Accident / incident reports from the public report form (Phase A)
// A report becomes a normal dispatch request. Red-flag answers force critical;
// otherwise the description goes through the existing triage chain.
// NEVER logs the phone number, the name, or the description text.

import { dispatchState } from '../dispatch/state.js';
import { fleetSimulator } from '../sim/fleet.js';
import { triageRequest } from '../explain/triage.js';
import { MAP_CONFIG } from '../config.js';
import { haversineDistanceKm } from '../dispatch/rank.js';
import { getActiveHospitals } from '../hospitals/list.js';
import { hospitalOptions, hospitalOptionFor, HOSPITAL_RADIUS_KM } from '../hospitals/options.js';
import { notifyHospital, latestForRequest, requestChange, ACTIVE_STATES } from '../hospitals/inbox.js';

const INCIDENT_TYPES = ['accident', 'injury', 'illness', 'other'];
const reportsByRequestId = new Map();
const closedRequestIds = new Set();

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function inDrillBox(lat, lng) {
  return (
    lat >= MAP_CONFIG.MIN_LAT && lat <= MAP_CONFIG.MAX_LAT &&
    lng >= MAP_CONFIG.MIN_LNG && lng <= MAP_CONFIG.MAX_LNG
  );
}

export function validateReport(body = {}) {
  const incidentType = INCIDENT_TYPES.includes(body.incidentType) ? body.incidentType : null;
  if (!incidentType) throw httpError('incidentType must be accident, injury, illness or other');

  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length < 3 || description.length > 500) {
    throw httpError('description must be 3 to 500 characters');
  }

  const phone = typeof body.phone === 'string' ? body.phone.replace(/\s+/g, '') : '';
  if (!/^\+?\d{10,13}$/.test(phone)) throw httpError('phone must be a valid number (10 digits)');

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';

  const peopleInjured = Number.isInteger(body.peopleInjured) ? body.peopleInjured : 1;
  if (peopleInjured < 1 || peopleInjured > 50) throw httpError('peopleInjured must be 1 to 50');

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw httpError('Location is required: use live location or pick a point on the map');
  }
  if (!inDrillBox(lat, lng)) {
    throw httpError('This demo covers only the Bhopal drill area. Pick a point inside the map box.');
  }

  // Red flags from the form's yes/no questions
  const redFlags = {
    notConscious: body.notConscious === true,
    notBreathing: body.notBreathing === true,
    heavyBleeding: body.heavyBleeding === true
  };

  return {
    incidentType,
    description,
    phoneLast4: phone.slice(-4),
    name,
    peopleInjured,
    lat,
    lng,
    isSafe: body.isSafe !== false,
    landmark: typeof body.landmark === 'string' ? body.landmark.trim().slice(0, 100) : '',
    redFlags
  };
}

export async function createReport(body) {
  const report = validateReport(body);

  let severity;
  let severitySource;
  if (report.redFlags.notConscious || report.redFlags.notBreathing || report.redFlags.heavyBleeding) {
    severity = 'critical';
    severitySource = 'red-flag';
  } else {
    const triaged = await triageRequest(report.description);
    severity = triaged.severity;
    severitySource = triaged.source;
  }

  const { request } = dispatchState.createRequest(
    { lat: report.lat, lng: report.lng, severity },
    fleetSimulator
  );

  reportsByRequestId.set(request.id, {
    incidentType: report.incidentType,
    description: report.description,
    name: report.name,
    phoneLast4: report.phoneLast4,
    peopleInjured: report.peopleInjured,
    isSafe: report.isSafe,
    landmark: report.landmark,
    redFlags: report.redFlags,
    severitySource
  });

  return { requestId: request.id, severity, severitySource, status: request.status };
}

// Public tracking view: never includes the phone number
export function getTracking(requestId, now = Date.now()) {
  const request = dispatchState.getRequest(requestId);
  if (!request) throw httpError('Report not found', 404);
  const meta = reportsByRequestId.get(requestId) || {};

  let unit = null;
  let distanceKm = null;
  if (request.assignedUnitId) {
    const u = fleetSimulator.getUnit(request.assignedUnitId);
    if (u) {
      distanceKm = Number(haversineDistanceKm(u.lat, u.lng, request.lat, request.lng).toFixed(2));
      unit = { id: u.id, type: u.type, lat: u.lat, lng: u.lng, status: u.status, speedKmh: u.speed };
    }
  }

  const chosen = request.ranking?.chosen;
  const current = latestForRequest(requestId);
  const active = current && ACTIVE_STATES.includes(current.status) ? current : null;
  return {
    requestId: request.id,
    status: request.status,
    severity: request.severity,
    incident: {
      lat: request.lat,
      lng: request.lng,
      type: meta.incidentType,
      peopleInjured: meta.peopleInjured,
      landmark: meta.landmark || ''
    },
    unit,
    distanceKm,
    etaMinutes: chosen ? Number(chosen.eta_minutes.toFixed(1)) : null,
    hospital: request.hospital?.hospital
      ? {
          name: request.hospital.hospital.name,
          type: request.hospital.hospital.type,
          transitEtaMinutes: request.hospital.hospital.transit_eta_minutes ?? null,
          isDummy: request.hospital.hospital.isDummy === true
        }
      : null,
    // Citizen picks one of these; the chosen hospital gets a message and decides
    hospitalOptions: closedRequestIds.has(requestId) ? [] : hospitalOptions(request.lat, request.lng),
    chosenHospitalId: active?.hospitalId ?? null,
    chosenHospitalName: active?.hospitalName ?? null,
    selection: current
      ? {
          messageId: current.id,
          hospitalId: current.hospitalId,
          hospitalName: current.hospitalName,
          state: current.status,
          responseSeconds: Number(process.env.HOSPITAL_RESPONSE_SECONDS) || 120,
          changeRequested: current.changeRequested,
          rejectReason: current.rejectReason
        }
      : null,
    queuePosition: request.queuePosition ?? null,
    updatedAt: now
  };
}

// Citizen chooses a hospital from the cards. The hospital panel gets the incoming message.
export function chooseHospital(requestId, hospitalId) {
  const meta = reportsByRequestId.get(requestId);
  if (!meta) throw httpError('Report not found', 404);
  if (closedRequestIds.has(requestId)) throw httpError('This incident is already closed', 409);

  // One hospital at a time: switching needs a change request that the hospital releases
  const current = latestForRequest(requestId);
  if (current && ACTIVE_STATES.includes(current.status)) {
    throw httpError(`Hospital already chosen (${current.hospitalName}). Ask for a change to switch.`, 409);
  }

  const request = dispatchState.getRequest(requestId);
  if (!request) throw httpError('Report not found', 404);

  const hospital = getActiveHospitals().find((h) => h.id === hospitalId);
  if (!hospital) throw httpError('Hospital not found', 404);

  const option = hospitalOptionFor(hospital, request.lat, request.lng);
  if (option.distanceKm > HOSPITAL_RADIUS_KM) {
    throw httpError(`Hospital is more than ${HOSPITAL_RADIUS_KM} km away`, 400);
  }

  dispatchState.updateHospitalPreference(requestId, hospital.id);

  const chosenUnit = request.assignedUnitId ? fleetSimulator.getUnit(request.assignedUnitId) : null;
  const message = notifyHospital({
    hospital: { ...option, lat: hospital.lat, lng: hospital.lng },
    requestId,
    unitId: chosenUnit?.id || null,
    etaMinutes: option.etaMinutes,
    severity: request.severity,
    incidentType: meta.incidentType,
    peopleInjured: meta.peopleInjured,
    redFlags: meta.redFlags,
    description: meta.description,
    landmark: meta.landmark,
    isSafe: meta.isSafe,
    phoneLast4: meta.phoneLast4,
    patient: { lat: request.lat, lng: request.lng }
  });

  return { requestId, hospitalId: hospital.id, hospitalName: hospital.name, messageId: message.id, state: message.status };
}

// Citizen asks to switch hospital. The current hospital must release or keep the patient.
export function askHospitalChange(requestId) {
  if (!reportsByRequestId.has(requestId)) throw httpError('Report not found', 404);
  const msg = requestChange(requestId);
  return { requestId, messageId: msg.id, changeRequested: true };
}

export function getReportMeta(requestId) {
  return reportsByRequestId.get(requestId) || null;
}

// Authority view: every citizen report with its details (admin only)
export function listReports() {
  return dispatchState.getAllRequests()
    .filter((r) => reportsByRequestId.has(r.id))
    .map((r) => {
      const meta = reportsByRequestId.get(r.id);
      return {
        requestId: r.id,
        status: r.status,
        severity: r.severity,
        severitySource: meta.severitySource,
        incidentType: meta.incidentType,
        description: meta.description,
        peopleInjured: meta.peopleInjured,
        landmark: meta.landmark,
        redFlags: meta.redFlags,
        isSafe: meta.isSafe,
        callerName: meta.name || null,
        phoneLast4: meta.phoneLast4,
        lat: r.lat,
        lng: r.lng,
        assignedUnitId: r.assignedUnitId,
        closed: closedRequestIds.has(r.id),
        createdAt: r.createdAt
      };
    })
    .sort((a, b) => (a.severity === b.severity ? b.createdAt - a.createdAt : a.severity === 'critical' ? -1 : 1));
}

// Control room: officer marks an incident as handled (admin only)
export function closeReport(requestId) {
  if (!reportsByRequestId.has(requestId)) throw httpError('Report not found', 404);
  closedRequestIds.add(requestId);
  return { requestId, closed: true };
}
