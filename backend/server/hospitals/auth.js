// Hospital panel login (/hospital). Dummy for now: one shared login from env.
// Env names: HOSPITAL_USERNAME (or HOSPITAL) / HOSPITAL_PASSWORD. Later each hospital gets its own admin panel.
// NEVER logs the username, password, or session token.

import { createSessionAuth } from '../auth/session.js';

export const hospitalAuth = createSessionAuth({
  label: 'Hospital',
  cookie: 'hw_hospital',
  userEnvs: ['HOSPITAL_USERNAME', 'HOSPITAL'],
  passEnvs: ['HOSPITAL_PASSWORD']
});
