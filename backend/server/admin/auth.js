// Admin login for the authority console (/admin).
// Credentials come from backend/.env only. Accepted names:
//   ADMIN_USERNAME / ADMIN_PASSWORD   (preferred)
//   ADMIN / ADMIN_PASSOWRD            (names already in the owner's .env)
// NEVER logs the username, password, or session token.

import { createSessionAuth } from '../auth/session.js';

const admin = createSessionAuth({
  label: 'Admin',
  cookie: 'hw_admin',
  userEnvs: ['ADMIN_USERNAME', 'ADMIN'],
  passEnvs: ['ADMIN_PASSWORD', 'ADMIN_PASSOWRD']
});

export const login = admin.login;
export const logout = admin.logout;
export const isAdminRequest = admin.isRequestAuthed;
export const setSessionCookie = admin.setSessionCookie;
export const clearSessionCookie = admin.clearSessionCookie;
export const requireAdmin = admin.requireSession;
export const adminConfigured = admin.isConfigured;
