// Pure ranking function for emergency unit allocation
import { SPEEDS, THRESHOLDS, PENALTIES } from '../config.js';

/**
 * Calculates Haversine distance in kilometers between two GPS coordinates
 */
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates ETA in minutes: (distance / speed) * 60 + 1 min pickup
 */
export function calculateEtaMinutes(distanceKm, unitType) {
  const speed = SPEEDS[unitType] || SPEEDS.ambulance;
  return (distanceKm / speed) * 60 + THRESHOLDS.PICKUP_TIME_MINUTES;
}

/**
 * Computes GPS age in seconds
 */
export function getGpsAgeSeconds(unit, now = Date.now()) {
  if (typeof unit.gpsAge === 'number') {
    return unit.gpsAge;
  }
  if (unit.gpsUpdatedAt) {
    const updatedAt = new Date(unit.gpsUpdatedAt).getTime();
    return Math.max(0, (now - updatedAt) / 1000);
  }
  return 0;
}

/**
 * Pure ranking function
 * @param {Array} units - Array of units [{ id, type, lat, lng, status, gpsUpdatedAt }]
 * @param {Object} request - Emergency request { lat, lng, severity: 'critical' | 'minor' }
 * @param {Object} [options] - Optional parameters: { now, spikeZone }
 * @returns {Object} Ranking result { chosen, runnerUp, nearest, bikeFallback, ranked }
 */
export function rank(units = [], request, options = {}) {
  const now = options.now || Date.now();
  const spikeZone = options.spikeZone || null;
  const severity = (request?.severity || 'minor').toLowerCase();
  const reqLat = request?.lat;
  const reqLng = request?.lng;

  if (!Array.isArray(units) || units.length === 0 || reqLat === undefined || reqLng === undefined) {
    return {
      chosen: null,
      runnerUp: null,
      nearest: null,
      bikeFallback: false,
      ranked: []
    };
  }

  // 1. Find all free units and identify the overall nearest free unit (ignoring stale/penalties)
  const freeUnits = units.filter((u) => u.status === 'free');

  let nearest = null;
  let minDistance = Infinity;

  for (const u of freeUnits) {
    const dist = haversineDistanceKm(reqLat, reqLng, u.lat, u.lng);
    if (dist < minDistance) {
      minDistance = dist;
      const gpsAge = getGpsAgeSeconds(u, now);
      const eta = calculateEtaMinutes(dist, u.type);
      nearest = {
        id: u.id,
        type: u.type,
        lat: u.lat,
        lng: u.lng,
        distance_km: Number(dist.toFixed(3)),
        eta_minutes: Number(eta.toFixed(2)),
        gpsAge_s: Number(gpsAge.toFixed(1))
      };
    }
  }

  if (freeUnits.length === 0) {
    return {
      chosen: null,
      runnerUp: null,
      nearest: null,
      bikeFallback: false,
      ranked: []
    };
  }

  // 2. Evaluate candidates based on severity rules
  let candidatePool = [];
  let isBikeFallback = false;

  if (severity === 'critical') {
    // Critical: stale units (> 20s) are EXCLUDED
    const nonStaleFree = freeUnits.filter(
      (u) => getGpsAgeSeconds(u, now) <= THRESHOLDS.STALE_GPS_SECONDS
    );

    // Prefer ambulances
    const ambulances = nonStaleFree.filter((u) => u.type === 'ambulance');

    if (ambulances.length > 0) {
      candidatePool = ambulances.map((u) => ({
        unit: u,
        capabilityPenalty: 0,
        isBikeFallback: false
      }));
    } else {
      // If no free non-stale ambulance, bikes may be used with +5 min penalty
      const bikes = nonStaleFree.filter((u) => u.type === 'bike');
      if (bikes.length > 0) {
        isBikeFallback = true;
        candidatePool = bikes.map((u) => ({
          unit: u,
          capabilityPenalty: PENALTIES.CRITICAL_BIKE_FALLBACK_MINUTES,
          isBikeFallback: true
        }));
      }
    }
  } else {
    // Minor: bikes preferred, stale units get +3 min penalty, ambulance gets +2 min penalty
    candidatePool = freeUnits.map((u) => {
      const isStale = getGpsAgeSeconds(u, now) > THRESHOLDS.STALE_GPS_SECONDS;
      const stalePenalty = isStale ? PENALTIES.MINOR_STALE_MINUTES : 0;
      const capabilityPenalty = u.type === 'ambulance' ? PENALTIES.MINOR_AMBULANCE_MINUTES : 0;

      return {
        unit: u,
        stalePenalty,
        capabilityPenalty,
        isBikeFallback: false
      };
    });
  }

  // 3. Compute score for each candidate in the pool
  const scoredCandidates = candidatePool.map((item) => {
    const u = item.unit;
    const distance_km = haversineDistanceKm(reqLat, reqLng, u.lat, u.lng);
    const eta_minutes = calculateEtaMinutes(distance_km, u.type);
    const gpsAge_s = getGpsAgeSeconds(u, now);

    let penalties = (item.capabilityPenalty || 0) + (item.stalePenalty || 0);

    // Spike zone penalty: +1 min if within 1.5km of active spike center
    let inSpikeZone = false;
    if (spikeZone && spikeZone.active && spikeZone.lat !== undefined && spikeZone.lng !== undefined) {
      const distToSpike = haversineDistanceKm(u.lat, u.lng, spikeZone.lat, spikeZone.lng);
      if (distToSpike <= THRESHOLDS.SPIKE_RADIUS_KM) {
        penalties += PENALTIES.SPIKE_ZONE_MINUTES;
        inSpikeZone = true;
      }
    }

    const score = eta_minutes + penalties;

    return {
      id: u.id,
      type: u.type,
      lat: u.lat,
      lng: u.lng,
      distance_km: Number(distance_km.toFixed(3)),
      eta_minutes: Number(eta_minutes.toFixed(2)),
      gpsAge_s: Number(gpsAge_s.toFixed(1)),
      penalties: Number(penalties.toFixed(2)),
      score: Number(score.toFixed(3)),
      inSpikeZone,
      isBikeFallback: Boolean(item.isBikeFallback)
    };
  });

  // 4. Sort candidates: lowest score wins.
  // Tie-break: lower GPS age, then lower id
  scoredCandidates.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 1e-6) {
      return a.score - b.score;
    }
    // Tie-break 1: lower GPS age
    if (Math.abs(a.gpsAge_s - b.gpsAge_s) > 1e-6) {
      return a.gpsAge_s - b.gpsAge_s;
    }
    // Tie-break 2: lower id (natural comparison)
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });

  const chosen = scoredCandidates.length > 0 ? scoredCandidates[0] : null;
  const runnerUp = scoredCandidates.length > 1 ? scoredCandidates[1] : null;

  return {
    chosen,
    runnerUp,
    nearest,
    bikeFallback: isBikeFallback,
    ranked: scoredCandidates
  };
}
