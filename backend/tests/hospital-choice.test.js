// Tests for hospital choice: 30 km options, citizen picks a hospital, hospital panel inbox
// Red-flag reports are used so no live AI call is made.

import test from 'node:test';
import assert from 'node:assert';
import app from '../server/index.js';
import { hospitalOptions, HOSPITAL_RADIUS_KM } from '../server/hospitals/options.js';
import { DUMMY_HOSPITALS, setActiveHospitals } from '../server/hospitals/list.js';
import { createReport } from '../server/reports/reports.js';

process.env.HOSPITAL_USERNAME = 'test-hospital';
process.env.HOSPITAL_PASSWORD = 'test-hosp-pass-123';

const CENTER = { lat: 23.2599, lng: 77.4126 };

function withServer(fn) {
  return async () => {
    setActiveHospitals(DUMMY_HOSPITALS);
    const server = app.listen(0);
    try {
      await fn(`http://127.0.0.1:${server.address().port}`);
    } finally {
      server.close();
    }
  };
}

const post = (base, path, body, cookie) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: JSON.stringify(body)
});

test('1. options: only hospitals within 30 km, nearest-first with a recommended card', () => {
  const options = hospitalOptions(CENTER.lat, CENTER.lng);
  assert.ok(options.length > 0);
  options.forEach((o) => assert.ok(o.distanceKm <= HOSPITAL_RADIUS_KM));
  assert.strictEqual(options[0].recommended, true);
  assert.ok(options.slice(1).every((o) => o.recommended === false));
  // Dummy hospitals never claim Ayushman: the value stays null until verified
  options.forEach((o) => assert.strictEqual(o.ayushman, null));
});

test('2. options: a point far outside the 30 km radius gets no cards', () => {
  // Indore is about 190 km away from the drill centre
  assert.deepStrictEqual(hospitalOptions(22.7196, 75.8577), []);
});

test('3. hospital inbox without a session returns 401', withServer(async (base) => {
  const res = await fetch(`${base}/api/hospital/inbox`);
  assert.strictEqual(res.status, 401);
}));

test('4. hospital login: wrong password is 401, correct login sets the hw_hospital cookie', withServer(async (base) => {
  const bad = await post(base, '/api/hospital/login', { username: 'test-hospital', password: 'nope' });
  assert.strictEqual(bad.status, 401);

  const ok = await post(base, '/api/hospital/login', { username: 'test-hospital', password: 'test-hosp-pass-123' });
  assert.strictEqual(ok.status, 200);
  const cookie = ok.headers.get('set-cookie');
  assert.match(cookie, /hw_hospital=/);
  assert.match(cookie, /HttpOnly/);
}));

test('5. citizen picks a hospital: it gets a message with no phone or name, and tracking shows the choice', withServer(async (base) => {
  const created = await createReport({
    incidentType: 'accident',
    description: 'Bike accident, rider not breathing',
    phone: '9876543210',
    name: 'Secret Name',
    peopleInjured: 2,
    lat: CENTER.lat,
    lng: CENTER.lng,
    notBreathing: true
  });
  const tracking = await (await fetch(`${base}/api/reports/${created.requestId}`)).json();
  const pick = tracking.tracking.hospitalOptions[1] || tracking.tracking.hospitalOptions[0];
  assert.ok(pick, 'options are shown to the citizen');
  assert.ok(!JSON.stringify(tracking).includes('9876543210'), 'tracking never shows the phone');

  const chosen = await post(base, `/api/reports/${created.requestId}/hospital`, { hospitalId: pick.hospitalId });
  assert.strictEqual(chosen.status, 200);

  const login = await post(base, '/api/hospital/login', { username: 'test-hospital', password: 'test-hosp-pass-123' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const inbox = await (await fetch(`${base}/api/hospital/inbox`, { headers: { Cookie: cookie } })).json();
  const msg = inbox.messages.find((m) => m.requestId === created.requestId);
  assert.ok(msg, 'the chosen hospital received the message');
  assert.strictEqual(msg.hospitalId, pick.hospitalId);
  assert.strictEqual(msg.status, 'pending');
  assert.match(msg.text, /Patient aa raha hai/);
  const raw = JSON.stringify(msg);
  assert.ok(!raw.includes('Secret Name') && !raw.includes('9876543210'), 'no caller name or phone in the message');

  const after = await (await fetch(`${base}/api/reports/${created.requestId}`)).json();
  assert.strictEqual(after.tracking.chosenHospitalId, pick.hospitalId);
}));

test('6. choosing an unknown hospital is 404, and an unknown report is 404', withServer(async (base) => {
  const created = await createReport({
    incidentType: 'injury',
    description: 'Fell from a scooter',
    phone: '9876500000',
    peopleInjured: 1,
    lat: CENTER.lat,
    lng: CENTER.lng,
    heavyBleeding: true
  });
  const unknownHospital = await post(base, `/api/reports/${created.requestId}/hospital`, { hospitalId: 'NOPE' });
  assert.strictEqual(unknownHospital.status, 404);
  const unknownReport = await post(base, '/api/reports/REQ-999/hospital', { hospitalId: 'HOSP-01' });
  assert.strictEqual(unknownReport.status, 404);
}));

test('7. hospital decides: accept, then bed ready; invalid transitions are 409, bad action is 400', withServer(async (base) => {
  const login = await post(base, '/api/hospital/login', { username: 'test-hospital', password: 'test-hosp-pass-123' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const inbox = await (await fetch(`${base}/api/hospital/inbox`, { headers: { Cookie: cookie } })).json();
  const msg = inbox.messages.find((m) => m.requestId && m.status === 'pending');
  assert.ok(msg, 'there is a pending message from test 5');
  const bad = await post(base, `/api/hospital/inbox/${msg.id}/decision`, { action: 'done' }, cookie);
  assert.strictEqual(bad.status, 400);
  const notReady = await post(base, `/api/hospital/inbox/${msg.id}/decision`, { action: 'bed_ready' }, cookie);
  assert.strictEqual(notReady.status, 409, 'bed ready needs accept first');
  const accepted = await post(base, `/api/hospital/inbox/${msg.id}/decision`, { action: 'accept' }, cookie);
  assert.strictEqual(accepted.status, 200);
  const ready = await post(base, `/api/hospital/inbox/${msg.id}/decision`, { action: 'bed_ready' }, cookie);
  assert.strictEqual(ready.status, 200);
}));

test('8. one hospital at a time: a second choice is 409 while the first is active', withServer(async (base) => {
  const created = await createReport({
    incidentType: 'accident', description: 'Two wheeler crash, unconscious', phone: '9876511111',
    peopleInjured: 1, lat: CENTER.lat, lng: CENTER.lng, notConscious: true
  });
  const tr = (await (await fetch(`${base}/api/reports/${created.requestId}`)).json()).tracking;
  const [a, b] = tr.hospitalOptions;
  assert.strictEqual((await post(base, `/api/reports/${created.requestId}/hospital`, { hospitalId: a.hospitalId })).status, 200);
  const second = await post(base, `/api/reports/${created.requestId}/hospital`, { hospitalId: b.hospitalId });
  assert.strictEqual(second.status, 409);
  const after = (await (await fetch(`${base}/api/reports/${created.requestId}`)).json()).tracking;
  assert.strictEqual(after.selection.state, 'pending');
  assert.strictEqual(after.selection.hospitalId, a.hospitalId);
}));

test('9. change request: hospital must release; then the citizen can choose another', withServer(async (base) => {
  const created = await createReport({
    incidentType: 'injury', description: 'Fell from a scooter, bleeding', phone: '9876522222',
    peopleInjured: 1, lat: CENTER.lat, lng: CENTER.lng, heavyBleeding: true
  });
  const tr = (await (await fetch(`${base}/api/reports/${created.requestId}`)).json()).tracking;
  const [a, b] = tr.hospitalOptions;
  await post(base, `/api/reports/${created.requestId}/hospital`, { hospitalId: a.hospitalId });

  const login = await post(base, '/api/hospital/login', { username: 'test-hospital', password: 'test-hosp-pass-123' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const inbox = await (await fetch(`${base}/api/hospital/inbox`, { headers: { Cookie: cookie } })).json();
  const msg = inbox.messages.find((m) => m.requestId === created.requestId);

  // Release is refused until the citizen asks for a change
  await post(base, `/api/hospital/inbox/${msg.id}/decision`, { action: 'accept' }, cookie);
  assert.strictEqual((await post(base, `/api/hospital/inbox/${msg.id}/decision`, { action: 'release' }, cookie)).status, 409);

  assert.strictEqual((await post(base, `/api/reports/${created.requestId}/hospital/change`, {})).status, 200);
  assert.strictEqual((await post(base, `/api/hospital/inbox/${msg.id}/decision`, { action: 'release' }, cookie)).status, 200);

  const again = await post(base, `/api/reports/${created.requestId}/hospital`, { hospitalId: b.hospitalId });
  assert.strictEqual(again.status, 200);
}));

test('10. rejection frees the citizen to pick another hospital, with the reason kept', withServer(async (base) => {
  const created = await createReport({
    incidentType: 'illness', description: 'Chest pain, sweating', phone: '9876533333',
    peopleInjured: 1, lat: CENTER.lat, lng: CENTER.lng, notBreathing: true
  });
  const tr = (await (await fetch(`${base}/api/reports/${created.requestId}`)).json()).tracking;
  const [a, b] = tr.hospitalOptions;
  await post(base, `/api/reports/${created.requestId}/hospital`, { hospitalId: a.hospitalId });

  const login = await post(base, '/api/hospital/login', { username: 'test-hospital', password: 'test-hosp-pass-123' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const inbox = await (await fetch(`${base}/api/hospital/inbox`, { headers: { Cookie: cookie } })).json();
  const msg = inbox.messages.find((m) => m.requestId === created.requestId);
  const rej = await post(base, `/api/hospital/inbox/${msg.id}/decision`, { action: 'reject', reason: 'no_bed' }, cookie);
  assert.strictEqual(rej.status, 200);
  const after = (await (await fetch(`${base}/api/reports/${created.requestId}`)).json()).tracking;
  assert.strictEqual(after.selection.state, 'rejected');
  assert.strictEqual(after.selection.rejectReason, 'no_bed');
  assert.strictEqual((await post(base, `/api/reports/${created.requestId}/hospital`, { hospitalId: b.hospitalId })).status, 200);
}));

test('11. live detail: patient and hospital locations, ambulance speed and ETA for the hospital', withServer(async (base) => {
  const created = await createReport({
    incidentType: 'accident', description: 'Auto hit a pole, one person hurt', phone: '9876544444',
    peopleInjured: 1, lat: CENTER.lat, lng: CENTER.lng, notConscious: true, landmark: 'Near JK Road signal'
  });
  const tr = (await (await fetch(`${base}/api/reports/${created.requestId}`)).json()).tracking;
  await post(base, `/api/reports/${created.requestId}/hospital`, { hospitalId: tr.hospitalOptions[0].hospitalId });

  const login = await post(base, '/api/hospital/login', { username: 'test-hospital', password: 'test-hosp-pass-123' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const inbox = await (await fetch(`${base}/api/hospital/inbox`, { headers: { Cookie: cookie } })).json();
  const msg = inbox.messages.find((m) => m.requestId === created.requestId);

  const res = await (await fetch(`${base}/api/hospital/inbox/${msg.id}/detail`, { headers: { Cookie: cookie } })).json();
  const d = res.detail;
  assert.strictEqual(d.patient.lat, CENTER.lat);
  assert.ok(d.hospital.location, 'hospital location is known');
  assert.strictEqual(d.landmark, 'Near JK Road signal');
  assert.ok(!JSON.stringify(d).includes('9876544444'), 'full phone never leaves the server');
  if (d.unit) {
    assert.ok(d.unit.speedKmh > 0, 'speed is shown');
    assert.ok(d.etaMinutes >= 0);
  }
  assert.strictEqual((await fetch(`${base}/api/hospital/inbox/MSG-9999/detail`, { headers: { Cookie: cookie } })).status, 404);
  assert.strictEqual((await fetch(`${base}/api/hospital/inbox/${msg.id}/detail`)).status, 401);
}));

test('12. no answer in time: the citizen may choose another hospital, and the late accept is refused', withServer(async (base) => {
  const created = await createReport({
    incidentType: 'injury', description: 'Lorry hit a bike, one hurt', phone: '9876555555',
    peopleInjured: 1, lat: CENTER.lat, lng: CENTER.lng, notConscious: true
  });
  const tr = (await (await fetch(`${base}/api/reports/${created.requestId}`)).json()).tracking;
  const [a, b] = tr.hospitalOptions;
  await post(base, `/api/reports/${created.requestId}/hospital`, { hospitalId: a.hospitalId });

  const login = await post(base, '/api/hospital/login', { username: 'test-hospital', password: 'test-hosp-pass-123' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const inbox = await (await fetch(`${base}/api/hospital/inbox`, { headers: { Cookie: cookie } })).json();
  const msg = inbox.messages.find((m) => m.requestId === created.requestId);

  process.env.HOSPITAL_RESPONSE_SECONDS = '0';
  try {
    const late = await post(base, `/api/hospital/inbox/${msg.id}/decision`, { action: 'accept' }, cookie);
    assert.strictEqual(late.status, 409, 'late accept is refused');
    const switched = await post(base, `/api/reports/${created.requestId}/hospital`, { hospitalId: b.hospitalId });
    assert.strictEqual(switched.status, 200, 'citizen can choose another hospital');
  } finally {
    delete process.env.HOSPITAL_RESPONSE_SECONDS;
  }
}));
