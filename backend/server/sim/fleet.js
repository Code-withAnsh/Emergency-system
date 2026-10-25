// Fleet Simulation Engine for HackWave Dispatch Prototype
import { MAP_CONFIG, SPEEDS, THRESHOLDS, FLEET_CONFIG } from '../config.js';

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

export class FleetSimulator {
  constructor(options = {}) {
    this.totalUnits = options.totalUnits || FLEET_CONFIG.TOTAL_UNITS;
    this.ambulanceRatio = options.ambulanceRatio ?? FLEET_CONFIG.AMBULANCE_RATIO;
    this.units = new Map();
    this.phoneUnits = new Map();
    this.intervalId = null;
    this.listeners = new Set();
    this.initFleet(options.now || Date.now());
  }

  /**
   * Initializes 60 simulated units (30 ambulances, 30 bikes) inside Bhopal box
   */
  initFleet(now = Date.now()) {
    this.units.clear();
    const ambulanceCount = Math.round(this.totalUnits * this.ambulanceRatio);
    const bikeCount = this.totalUnits - ambulanceCount;

    // Spawn Ambulances
    for (let i = 1; i <= ambulanceCount; i++) {
      const id = `AMB-${String(i).padStart(2, '0')}`;
      this.units.set(id, this.createSimulatedUnit(id, 'ambulance', now, i));
    }

    // Spawn First Responder Bikes
    for (let i = 1; i <= bikeCount; i++) {
      const id = `BIKE-${String(i).padStart(2, '0')}`;
      this.units.set(id, this.createSimulatedUnit(id, 'bike', now, ambulanceCount + i));
    }
  }

  createSimulatedUnit(id, type, now, index) {
    const lat = randomInRange(MAP_CONFIG.MIN_LAT + 0.005, MAP_CONFIG.MAX_LAT - 0.005);
    const lng = randomInRange(MAP_CONFIG.MIN_LNG + 0.005, MAP_CONFIG.MAX_LNG - 0.005);
    const targetLat = randomInRange(MAP_CONFIG.MIN_LAT + 0.008, MAP_CONFIG.MAX_LAT - 0.008);
    const targetLng = randomInRange(MAP_CONFIG.MIN_LNG + 0.008, MAP_CONFIG.MAX_LNG - 0.008);

    // About 1 in 10 units (index % 10 === 0) start in staggered stale states
    const isStaleEligible = index % 10 === 0;
    let staleState;
    let gpsUpdatedAt = now;

    if (isStaleEligible) {
      // Stagger some initially stale (e.g. 22s stale) and some about to become stale
      if (index % 20 === 0) {
        staleState = { active: true, remainingSeconds: 5, cooldownSeconds: 0 };
        gpsUpdatedAt = now - 22000; // already 22s stale (>20s threshold)
      } else {
        staleState = { active: false, remainingSeconds: 0, cooldownSeconds: 10 + (index % 5) * 5 };
      }
    } else {
      staleState = {
        active: false,
        remainingSeconds: 0,
        cooldownSeconds: Math.floor(randomInRange(30, 90))
      };
    }

    return {
      id,
      type,
      source: 'simulated',
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      speed: SPEEDS[type] || 40,
      status: 'free',
      busyRemainingSeconds: 0,
      targetLat: Number(targetLat.toFixed(6)),
      targetLng: Number(targetLng.toFixed(6)),
      gpsUpdatedAt,
      staleState
    };
  }

  /**
   * Run one simulation step (1 second)
   */
  tick(now = Date.now()) {
    // 1. Update simulated units
    for (const unit of this.units.values()) {
      // Handle Busy countdown
      if (unit.status === 'busy') {
        unit.busyRemainingSeconds = Math.max(0, (unit.busyRemainingSeconds || 0) - 1);
        if (unit.busyRemainingSeconds <= 0) {
          unit.status = 'free';
          // Pick a new wander target once free
          unit.targetLat = Number(randomInRange(MAP_CONFIG.MIN_LAT + 0.008, MAP_CONFIG.MAX_LAT - 0.008).toFixed(6));
          unit.targetLng = Number(randomInRange(MAP_CONFIG.MIN_LNG + 0.008, MAP_CONFIG.MAX_LNG - 0.008).toFixed(6));
        }
      }

      // Handle Stale simulation (1 in 10 stops updating for 25s at random times)
      const stale = unit.staleState;
      if (stale.active) {
        stale.remainingSeconds--;
        // GPS is NOT updated while active stale
        if (stale.remainingSeconds <= 0) {
          stale.active = false;
          stale.cooldownSeconds = Math.floor(randomInRange(45, 90));
          unit.gpsUpdatedAt = now; // resumes fresh GPS
        }
      } else {
        // Normal state: send fresh GPS timestamp every second
        unit.gpsUpdatedAt = now;
        stale.cooldownSeconds--;
        if (stale.cooldownSeconds <= 0) {
          stale.active = true;
          stale.remainingSeconds = 25; // stops updating for 25s
        }
      }

      // Movement Physics (1 second step)
      // speed in km/h -> km/s
      const speedKmH = unit.speed;
      const stepKm = speedKmH / 3600;

      // Coordinate degrees
      const dLat = unit.targetLat - unit.lat;
      const dLng = unit.targetLng - unit.lng;
      const distDeg = Math.hypot(dLat, dLng);

      // Degree distance threshold (~50m ≈ 0.00045 deg)
      if (distDeg < 0.00045) {
        // Target reached: assign new wander target inside Bhopal box
        unit.targetLat = Number(randomInRange(MAP_CONFIG.MIN_LAT + 0.008, MAP_CONFIG.MAX_LAT - 0.008).toFixed(6));
        unit.targetLng = Number(randomInRange(MAP_CONFIG.MIN_LNG + 0.008, MAP_CONFIG.MAX_LNG - 0.008).toFixed(6));
      } else {
        // Move towards target
        const kmPerLat = 111;
        const kmPerLng = 111 * Math.cos((unit.lat * Math.PI) / 180);

        const latDistKm = dLat * kmPerLat;
        const lngDistKm = dLng * kmPerLng;
        const totalDistKm = Math.hypot(latDistKm, lngDistKm);

        if (totalDistKm > 0) {
          const moveRatio = Math.min(1, stepKm / totalDistKm);
          unit.lat = Number((unit.lat + (dLat * moveRatio)).toFixed(6));
          unit.lng = Number((unit.lng + (dLng * moveRatio)).toFixed(6));
        }

        // Keep inside bounds
        if (unit.lat < MAP_CONFIG.MIN_LAT || unit.lat > MAP_CONFIG.MAX_LAT ||
            unit.lng < MAP_CONFIG.MIN_LNG || unit.lng > MAP_CONFIG.MAX_LNG) {
          unit.targetLat = Number(randomInRange(MAP_CONFIG.CENTER_LAT - 0.03, MAP_CONFIG.CENTER_LAT + 0.03).toFixed(6));
          unit.targetLng = Number(randomInRange(MAP_CONFIG.CENTER_LNG - 0.03, MAP_CONFIG.CENTER_LNG + 0.03).toFixed(6));
        }
      }
    }

    // 2. Notify subscribers
    const snapshot = this.getUnits(now);
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[FleetSimulator] Listener error:', err.message);
      }
    }
  }

  /**
   * Returns snapshot of all units (simulated + phone units) with computed fields
   */
  getUnits(now = Date.now()) {
    const all = [];

    for (const unit of this.units.values()) {
      const gpsAge = Math.max(0, Number(((now - unit.gpsUpdatedAt) / 1000).toFixed(1)));
      const isStale = gpsAge > THRESHOLDS.STALE_GPS_SECONDS;
      all.push({
        id: unit.id,
        type: unit.type,
        source: unit.source,
        lat: unit.lat,
        lng: unit.lng,
        speed: unit.speed,
        status: unit.status,
        gpsUpdatedAt: unit.gpsUpdatedAt,
        gpsAge,
        isStale,
        busyRemainingSeconds: unit.busyRemainingSeconds || 0
      });
    }

    for (const phone of this.phoneUnits.values()) {
      const gpsAge = Math.max(0, Number(((now - phone.gpsUpdatedAt) / 1000).toFixed(1)));
      const isStale = gpsAge > THRESHOLDS.STALE_GPS_SECONDS;
      all.push({
        id: phone.id,
        name: phone.name,
        type: phone.type,
        source: 'phone',
        isDemoLocation: Boolean(phone.isDemoLocation),
        lat: phone.lat,
        lng: phone.lng,
        speed: phone.speed,
        status: phone.status,
        gpsUpdatedAt: phone.gpsUpdatedAt,
        gpsAge,
        isStale,
        busyRemainingSeconds: phone.busyRemainingSeconds || 0
      });
    }

    return all;
  }

  getUnit(id) {
    return this.units.get(id) || this.phoneUnits.get(id) || null;
  }

  setUnitBusy(id, durationSeconds = THRESHOLDS.BUSY_DURATION_SECONDS, target = null) {
    const unit = this.units.get(id) || this.phoneUnits.get(id);
    if (!unit) return false;
    unit.status = 'busy';
    unit.busyRemainingSeconds = durationSeconds;
    if (target && target.lat && target.lng) {
      unit.targetLat = target.lat;
      unit.targetLng = target.lng;
    }
    return true;
  }

  setUnitFree(id) {
    const unit = this.units.get(id) || this.phoneUnits.get(id);
    if (!unit) return false;
    unit.status = 'free';
    unit.busyRemainingSeconds = 0;
    return true;
  }

  // Phone registration hooks (used in Phase 6)
  registerPhoneUnit(phone) {
    this.phoneUnits.set(phone.id, {
      ...phone,
      source: 'phone',
      status: phone.status || 'free',
      gpsUpdatedAt: phone.gpsUpdatedAt || Date.now(),
      busyRemainingSeconds: 0
    });
  }

  updatePhoneLocation(id, lat, lng, isDemoLocation = false) {
    const phone = this.phoneUnits.get(id);
    if (!phone) return false;
    phone.lat = lat;
    phone.lng = lng;
    phone.isDemoLocation = isDemoLocation;
    phone.gpsUpdatedAt = Date.now();
    return true;
  }

  removePhoneUnit(id) {
    return this.phoneUnits.delete(id);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this.tick();
    }, 1000);
    // Unref so process can cleanly exit if needed
    if (this.intervalId.unref) {
      this.intervalId.unref();
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// Global fleet singleton instance
export const fleetSimulator = new FleetSimulator();
