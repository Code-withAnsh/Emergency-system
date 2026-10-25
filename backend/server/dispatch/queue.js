// Request Priority Queue: Critical-First Ordering & Auto-Assignment Engine
import { rank } from './rank.js';
import { THRESHOLDS } from '../config.js';
import { selectHospital } from '../hospitals/list.js';

export class RequestQueue {
  constructor() {
    this.queue = [];
    this.listeners = new Set();
  }

  /**
   * Enqueues a request adhering to critical-first priority then FIFO
   * @param {Object} request - Emergency request object
   */
  enqueue(request) {
    if (!request || !request.id) return -1;

    // Check if already in queue
    const existingIndex = this.queue.findIndex((r) => r.id === request.id);
    if (existingIndex !== -1) {
      return existingIndex + 1;
    }

    const item = {
      ...request,
      enqueuedAt: Date.now(),
      status: 'pending'
    };

    // Priority sorting insertion:
    // Critical requests jump ahead of Minor requests.
    // Within same severity: FIFO (earlier createdAt / enqueuedAt first).
    if (item.severity === 'critical') {
      // Find index of the first minor request in the queue
      const firstMinorIdx = this.queue.findIndex((r) => r.severity !== 'critical');
      if (firstMinorIdx === -1) {
        // All existing are critical, append to end of criticals
        this.queue.push(item);
      } else {
        // Insert right before the first minor request
        this.queue.splice(firstMinorIdx, 0, item);
      }
    } else {
      // Minor request: append to end of queue
      this.queue.push(item);
    }

    this.emitChange('queue_updated', { queue: this.getQueue(), action: 'enqueue', requestId: request.id });
    return this.getPosition(request.id);
  }

  /**
   * Returns 1-based position in queue (1 = head of queue)
   */
  getPosition(requestId) {
    const idx = this.queue.findIndex((r) => r.id === requestId);
    return idx === -1 ? null : idx + 1;
  }

  peek() {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  size() {
    return this.queue.length;
  }

  getQueue() {
    return this.queue.map((r, idx) => ({
      ...r,
      queuePosition: idx + 1,
      totalQueued: this.queue.length
    }));
  }

  remove(requestId) {
    const idx = this.queue.findIndex((r) => r.id === requestId);
    if (idx !== -1) {
      const removed = this.queue.splice(idx, 1)[0];
      this.emitChange('queue_updated', { queue: this.getQueue(), action: 'remove', requestId });
      return removed;
    }
    return null;
  }

  /**
   * Attempts to assign waiting requests when units become free
   * @param {Object} fleetSimulator - Global fleet simulator instance
   * @param {Object} spikeZone - Active spike zone state
   * @param {number} now - Current timestamp
   * @returns {Array} List of newly assigned requests
   */
  processQueue(fleetSimulator, spikeZone = null, now = Date.now()) {
    if (!fleetSimulator || this.queue.length === 0) return [];

    const assigned = [];
    let queueIdx = 0;

    while (queueIdx < this.queue.length) {
      const req = this.queue[queueIdx];
      const units = fleetSimulator.getUnits(now);
      const freeUnits = units.filter((u) => u.status === 'free');

      if (freeUnits.length === 0) {
        break; // No free units available to assign any further requests
      }

      const ranking = rank(units, { lat: req.lat, lng: req.lng, severity: req.severity }, { now, spikeZone });

      if (ranking.chosen) {
        // Assign unit
        fleetSimulator.setUnitBusy(ranking.chosen.id, THRESHOLDS.BUSY_DURATION_SECONDS, { lat: req.lat, lng: req.lng });

        // Remove from queue
        this.queue.splice(queueIdx, 1);

        req.status = 'assigned';
        req.assignedUnitId = ranking.chosen.id;
        req.ranking = ranking;
        req.hospital = selectHospital({ lat: req.lat, lng: req.lng }, req.hospitalPreference || 'nearest');
        req.assignedAt = now;

        assigned.push(req);
      } else {
        // Could not satisfy this request with current free units, check next in queue
        queueIdx++;
      }
    }

    if (assigned.length > 0) {
      this.emitChange('queue_processed', { assigned, queue: this.getQueue() });
    }

    return assigned;
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
        console.error('[RequestQueue] Listener error:', err.message);
      }
    }
  }

  clear() {
    this.queue = [];
  }
}

export const requestQueue = new RequestQueue();
