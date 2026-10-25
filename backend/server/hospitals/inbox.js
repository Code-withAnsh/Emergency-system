// Hospital inbox: one message per hospital choice. The hospital decides, not the citizen alone.
//
// Message states:  pending -> accepted -> bed_ready
//                  pending -> rejected            (citizen may then choose another hospital)
//                  pending -> timed_out           (no answer in HOSPITAL_RESPONSE_SECONDS, default 120)
//                  accepted/bed_ready -> released (only after the citizen asked for a change)
//
// A citizen can choose again only when the current message is rejected, released or timed out.
// The message carries the medical picture and ETA, never the caller's name or phone.
// In memory for the prototype (same as requests).

const messages = new Map();
let counter = 0;

export const ACTIVE_STATES = ['pending', 'accepted', 'bed_ready'];

// If the hospital does not answer in time, the request is released to the citizen.
// Read at call time so tests and config changes apply without a restart.
function responseMs() {
  const sec = Number(process.env.HOSPITAL_RESPONSE_SECONDS);
  return (Number.isFinite(sec) && sec >= 0 ? sec : 120) * 1000;
}

function expireStale(now = Date.now()) {
  for (const m of messages.values()) {
    if (m.status === 'pending' && now - m.createdAt >= responseMs()) m.status = 'timed_out';
  }
}
export const REJECT_REASONS = ['no_bed', 'no_doctor', 'speciality', 'other'];

const TRANSITIONS = {
  accept: { from: ['pending'], to: 'accepted' },
  reject: { from: ['pending'], to: 'rejected' },
  bed_ready: { from: ['accepted'], to: 'bed_ready' },
  release: { from: ['accepted', 'bed_ready'], to: 'released', needsChangeRequest: true },
  keep: { from: ['accepted', 'bed_ready'], to: null, needsChangeRequest: true }
};

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

export function notifyHospital({ hospital, requestId, unitId, etaMinutes, severity, incidentType, peopleInjured, redFlags, description, landmark, isSafe, phoneLast4, patient }) {
  counter += 1;
  const id = `MSG-${String(counter).padStart(4, '0')}`;
  const flags = Object.entries(redFlags || {}).filter(([, on]) => on).map(([k]) => k);
  const message = {
    id,
    seq: counter,
    requestId,
    hospitalId: hospital.hospitalId,
    hospitalName: hospital.name,
    status: 'pending',
    changeRequested: false,
    rejectReason: null,
    severity,
    incidentType,
    peopleInjured,
    redFlags: flags,
    description,
    landmark: landmark || '',
    isSafe: isSafe !== false,
    phoneLast4: phoneLast4 || null,
    patient: patient || null,
    hospitalLocation: hospital.lat != null ? { lat: hospital.lat, lng: hospital.lng } : null,
    unitId: unitId || null,
    etaMinutes: etaMinutes ?? null,
    text: `Patient aa raha hai: ${peopleInjured} injured, ${severity}${flags.length ? `, red flags: ${flags.join(', ')}` : ''}. ` +
      `Ambulance ${unitId || 'assigned soon'}${etaMinutes != null ? `, ETA about ${etaMinutes} min` : ''}.`,
    createdAt: Date.now()
  };
  messages.set(id, message);
  return message;
}

export function getMessage(id) {
  return messages.get(id) || null;
}

// The newest message for a report is the citizen's current hospital choice
export function latestForRequest(requestId) {
  expireStale();
  let latest = null;
  for (const m of messages.values()) {
    if (m.requestId === requestId && (!latest || m.seq > latest.seq)) latest = m;
  }
  return latest;
}

export function requestChange(requestId) {
  const current = latestForRequest(requestId);
  if (!current || !ACTIVE_STATES.includes(current.status)) {
    throw httpError('There is no active hospital to change', 409);
  }
  current.changeRequested = true;
  return current;
}

// Hospital staff see what needs them first: pending, then active patients, then closed ones
const RANK = { pending: 0, accepted: 1, bed_ready: 2, rejected: 3, released: 3, timed_out: 3 };
export function listInbox() {
  expireStale();
  return [...messages.values()].sort((a, b) => (RANK[a.status] - RANK[b.status]) || (b.seq - a.seq));
}

export function decide(id, action, reason) {
  expireStale();
  const msg = messages.get(id);
  if (!msg) return null;
  const rule = TRANSITIONS[action];
  if (!rule) throw httpError('action must be accept, reject, bed_ready, release or keep', 400);
  if (!rule.from.includes(msg.status)) {
    throw httpError(`Cannot ${action} a message that is ${msg.status}`, 409);
  }
  if (rule.needsChangeRequest && !msg.changeRequested) {
    throw httpError('The citizen has not asked for a change', 409);
  }

  if (action === 'keep') {
    msg.changeRequested = false;
    return msg;
  }
  if (action === 'reject') {
    msg.rejectReason = REJECT_REASONS.includes(reason) ? reason : 'other';
  }
  if (rule.to === 'released') msg.changeRequested = false;
  msg.status = rule.to;
  return msg;
}
