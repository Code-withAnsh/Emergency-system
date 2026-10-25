# HackWave Dispatch (prototype)

> **PROTOTYPE / DRILL.** Every screen and alert is for a hackathon drill. This app is not connected to any real emergency service (108, 112 or any hospital) and must never claim to be.

A real-time dispatch engine for a moving fleet in a Bhopal-area drill box. A dispatcher map shows 60 simulated units (30 ambulances, 30 bikes). Drill requests get the best free unit, not just the nearest, with a reason card that explains the choice. Teammates can join with their phones as real units.

## Requirements
- Node.js 20 or newer
- npm
- Optional: a Gemini API key and a Groq API key (the app works without them, using the template fallback)

## Setup

```bash
# from the project root
cd backend && npm install
cd ../frontend && npm install
cd ..
```

Create the backend config. Only put keys in this file. Never commit it.

```bash
cp .env.example backend/.env
```

Then edit `backend/.env`:
- `GEMINI_API_KEY`: primary AI for explanation and triage
- `GROQ_API_KEY`: backup AI (optional)
- `GEMINI_MODEL`, `GROQ_MODEL`, `AI_TIMEOUT_MS`: defaults are in `.env.example`
- Authority login: `ADMIN_USERNAME` and `ADMIN_PASSWORD` (or the names `ADMIN` and `ADMIN_PASSOWRD` already in your `.env`; the spelling is as written). The console is not linked from the public site. Type `/admin` directly.

## Run (development)

```bash
npm run dev
```

- Citizen site (English, Hindi toggle): http://localhost:5173
- Accident report: http://localhost:5173/report
- Authority console (sign-in required, not linked publicly): http://localhost:5173/admin
- Backend API: http://localhost:4000 (health: `/api/health`)

## Run the tests

```bash
npm test
```

## Phone join (same Wi-Fi)

1. Put the laptop and phones on the same Wi-Fi.
2. Find the laptop's LAN IP:
   - macOS: `ipconfig getifaddr en0`
   - Windows: `ipconfig` and read the IPv4 address
3. On the phone, open `http://<laptop-LAN-IP>:4000/join`.
4. Enter a name and pick Ambulance or Bike, then tap **Join the drill**.
5. GPS:
   - Browsers only allow GPS on `https` or `localhost`. On a plain LAN `http` address, GPS is blocked.
   - Tap **Use demo location** on those phones. The unit then shows as `PHONE (demo)`.
6. When a request is assigned to your phone, an alert appears. Tap **Accept** within 20 seconds, or the unit is freed.
7. **Leave the drill** removes the phone from the map.

If the Wi-Fi fails, phone units drop out and the simulated fleet keeps running. The demo does not depend on phones.

## Project layout

```
backend/server/
  index.js            Express app, REST and SSE routes, /join page
  config.js           map box, speeds, thresholds, penalties
  sim/fleet.js        60-unit simulator and phone unit hooks
  dispatch/rank.js    ranking engine (pure functions)
  dispatch/state.js   requests, spike zone, re-ranking
  dispatch/queue.js   critical-first queue with auto-assign
  hospitals/list.js   4 DUMMY hospitals and patient choices
  explain/            Gemini -> Groq -> template chain, triage
  phones/registry.js  phone register, location, alert, Accept, timeout
  benchmark/          1000-incident comparison (nearest vs ranking)
backend/public/join.html   phone join page (plain HTML)
backend/tests/             node --test suites
frontend/src/              React + Vite dispatcher UI
```

## Data and limits
- Units, requests and hospitals are simulated or dummy data. Hospitals are marked DUMMY DATA.
- State is in memory. Restarting the server resets everything.
- The 1000-incident benchmark uses simulated incidents. Its numbers describe the simulation only.

## Deploy on Render

One web service, from the repository root.

- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Node version:** 20 or newer (set `NODE_VERSION` if Render asks)
- **Environment variables** (Render dashboard, not a file): `NODE_ENV=production`, `MONGO_URI`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `HOSPITAL_USERNAME`, `HOSPITAL_PASSWORD`, and optionally `GEMINI_API_KEY`, `GROQ_API_KEY`, `AI_TIMEOUT_MS`. Render sets `PORT` itself.
- **MongoDB Atlas:** allow Render's outbound IPs in the Network Access list (or `0.0.0.0/0` for the prototype). The app only uses the `emergency-system` database.

Notes for the drill:
- Sessions and reports are in memory. A Render restart or a free-tier sleep logs everyone out and clears open incidents.
- Login and report endpoints are rate limited per IP (15 logins per 15 minutes, 20 reports per minute).
- Cookies are `Secure` when `NODE_ENV=production`, so use the Render HTTPS URL, not plain HTTP.

