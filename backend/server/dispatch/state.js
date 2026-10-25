// Dispatch State Machine: Active Requests, Assigned Units & Spike Zone Tracking
import { MAP_CONFIG, THRESHOLDS } from '../config.js';
import { rank } from './rank.js';
import { requestQueue } from './queue.js';
import { selectHospital } from '../hospitals/list.js';

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

export class DispatchStateManager {
  constructor() {
    this.requests = new Map();
    this.requestCounter = 0;
    this.spikeZone = {
      active: false,
      lat: null,
      lng: null,
      startedAt: null,
      expiresAt: null,
      durationSeconds: THRESHOLDS.SPIKE_DURATION_SECONDS,
      radiusKm: THRESHOLDS.SPIKE_RADIUS_KM
    };
    this.listeners = new Set();
  }

  /**
   * Retrieves current spike zone with expiry evaluation
   */
  getSpikeZone(now = Date.now()) {
    if (this.spikeZone.active && this.spikeZone.expiresAt && now >= this.spikeZone.expiresAt) {
      this.spikeZone.active = false;
      this.spikeZone.lat = null;
      this.spikeZone.lng = null;
      this.spikeZone.startedAt = null;
      this.spikeZone.expiresAt = null;
      this.emitChange('spike_expired', { spikeZone: this.spikeZone });
    }

    const remainingSeconds = this.spikeZone.active && this.spikeZone.expiresAt
      ? Math.max(0, Math.ceil((this.spikeZone.expiresAt - now) / 1000))
      : 0;

    return {
      active: Boolean(this.spikeZone.active),
      lat: this.spikeZone.lat,
      lng: this.spikeZone.lng,
      radiusKm: this.spikeZone.radiusKm,
      remainingSeconds
    };
  }

  /**
   * Triggers a 30-second demand spike at given or random coordinate
   */
  triggerSpike(coords = null, fleetSimulator = null, now = Date.now()) {
    const lat = coords?.lat ?? Number(randomInRange(MAP_CONFIG.MIN_LAT + 0.015, MAP_CONFIG.MAX_LAT - 0.015).toFixed(6));
    const lng = coords?.lng ?? Number(randomInRange(MAP_CONFIG.MIN_LNG + 0.015, MAP_CONFIG.MAX_LNG - 0.015).toFixed(6));

    this.spikeZone = {
      active: true,
      lat,
      lng,
      startedAt: now,
      expiresAt: now + THRESHOLDS.SPIKE_DURATION_SECONDS * 1000,
      durationSeconds: THRESHOLDS.SPIKE_DURATION_SECONDS,
      radiusKm: THRESHOLDS.SPIKE_RADIUS_KM
    };

    let reRankedCount = 0;
    if (fleetSimulator) {
      reRankedCount = this.reRankPending(fleetSimulator, now);
    }

    const payload = {
      spikeZone: this.getSpikeZone(now),
      reRankedCount
    };

    this.emitChange('spike_activated', payload);
    return payload;
  }

  /**
   * Creates a drill emergency request and computes ranking
   */
  createRequest(params, fleetSimulator, now = Date.now()) {
    const { lat, lng, severity = 'minor' } = params;

    // Validation per Section 3 rule 3
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new Error('Invalid coordinates: lat and lng must be numbers');
    }

    if (
      lat < MAP_CONFIG.MIN_LAT ||
      lat > MAP_CONFIG.MAX_LAT ||
      lng < MAP_CONFIG.MIN_LNG ||
      lng > MAP_CONFIG.MAX_LNG
    ) {
      throw new Error(
        `Coordinates (${lat}, ${lng}) out of bounds [${MAP_CONFIG.MIN_LAT}-${MAP_CONFIG.MAX_LAT}, ${MAP_CONFIG.MIN_LNG}-${MAP_CONFIG.MAX_LNG}]`
      );
    }

    const normalizedSeverity = severity.toLowerCase();
    if (!['critical', 'minor'].includes(normalizedSeverity)) {
      throw new Error(`Invalid severity: "${severity}". Allowed: "critical", "minor"`);
    }

    this.requestCounter++;
    const requestId = `REQ-${String(this.requestCounter).padStart(3, '0')}`;

    // Get current units snapshot and active spike zone
    const units = fleetSimulator ? fleetSimulator.getUnits(now) : [];
    const spike = this.getSpikeZone(now);

    const ranking = rank(units, { lat, lng, severity: normalizedSeverity }, { now, spikeZone: spike });

    let status = 'pending';
    let assignedUnitId = null;
    let queuePosition = null;

    const hospital = selectHospital({ lat, lng }, params.hospitalPreference || 'nearest');

    if (ranking.chosen) {
      status = 'assigned';
      assignedUnitId = ranking.chosen.id;
      if (fleetSimulator) {
        fleetSimulator.setUnitBusy(ranking.chosen.id, THRESHOLDS.BUSY_DURATION_SECONDS, { lat, lng });
      }
    } else {
      // If no unit free, enqueue with critical-first priority
      status = 'queued';
      queuePosition = requestQueue.enqueue({
        id: requestId,
        lat,
        lng,
        severity: normalizedSeverity,
        hospitalPreference: params.hospitalPreference || 'nearest',
        hospital,
        createdAt: now
      });
    }

    const requestRecord = {
      id: requestId,
      lat,
      lng,
      severity: normalizedSeverity,
      status,
      queuePosition,
      assignedUnitId,
      ranking,
      hospital,
      hospitalPreference: params.hospitalPreference || 'nearest',
      createdAt: now,
      spikeActiveAtCreation: spike.active
    };

    this.requests.set(requestId, requestRecord);

    this.emitChange('request_created', { request: requestRecord, ranking });
    return { request: requestRecord, ranking };
  }

  /**
   * Re-ranks all pending requests
   */
  reRankPending(fleetSimulator, now = Date.now()) {
    if (!fleetSimulator) return 0;

    let updated = 0;
    const spike = this.getSpikeZone(now);
    const units = fleetSimulator.getUnits(now);

    for (const req of this.requests.values()) {
      if (req.status === 'pending' || req.status === 'queued') {
        const ranking = rank(units, { lat: req.lat, lng: req.lng, severity: req.severity }, { now, spikeZone: spike });
        req.ranking = ranking;

        if (ranking.chosen) {
          req.status = 'assigned';
          req.assignedUnitId = ranking.chosen.id;
          fleetSimulator.setUnitBusy(ranking.chosen.id, THRESHOLDS.BUSY_DURATION_SECONDS, { lat: req.lat, lng: req.lng });
          requestQueue.remove(req.id);
        }
        updated++;
      }
    }

    if (updated > 0) {
      this.emitChange('requests_reranked', { count: updated });
    }
    return updated;
  }

  getRequest(id) {
    return this.requests.get(id) || null;
  }

  getAllRequests() {
    return Array.from(this.requests.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getLatestRequest() {
    const list = this.getAllRequests();
    return list.length > 0 ? list[0] : null;
  }

  updateHospitalPreference(requestId, preference) {
    const req = this.requests.get(requestId);
    if (!req) return null;

    req.hospitalPreference = preference;
    req.hospital = selectHospital({ lat: req.lat, lng: req.lng }, preference);
    this.emitChange('hospital_updated', { request: req });
    return req;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitChange(eventType, data) {
    for (const listener of this.listeners) {
      try {
        listener(eventType, data);
      } catch (err) {
        console.error('[DispatchState] Listener error:', err.message);
      }
    }
  }

  reset() {
    this.requests.clear();
    this.requestCounter = 0;
    this.spikeZone = {
      active: false,
      lat: null,
      lng: null,
      startedAt: null,
      expiresAt: null,
      durationSeconds: THRESHOLDS.SPIKE_DURATION_SECONDS,
      radiusKm: THRESHOLDS.SPIKE_RADIUS_KM
    };
  }
}

export const dispatchState = new DispatchStateManager();
