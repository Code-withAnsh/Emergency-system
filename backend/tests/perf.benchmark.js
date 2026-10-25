import { rank } from '../server/dispatch/rank.js';
import { MAP_CONFIG } from '../server/config.js';

// Benchmark decision time for rank() with 60 units over 200 runs
function runBenchmark() {
  const units = [];
  for (let i = 1; i <= 60; i++) {
    units.push({
      id: `unit-${i}`,
      type: i <= 30 ? 'ambulance' : 'bike',
      lat: MAP_CONFIG.MIN_LAT + Math.random() * (MAP_CONFIG.MAX_LAT - MAP_CONFIG.MIN_LAT),
      lng: MAP_CONFIG.MIN_LNG + Math.random() * (MAP_CONFIG.MAX_LNG - MAP_CONFIG.MIN_LNG),
      status: Math.random() > 0.15 ? 'free' : 'busy',
      gpsUpdatedAt: Date.now() - Math.floor(Math.random() * 25000)
    });
  }

  const request = {
    lat: MAP_CONFIG.CENTER_LAT,
    lng: MAP_CONFIG.CENTER_LNG,
    severity: 'critical'
  };

  const timesMs = [];
  const WARMUP = 20;
  const RUNS = 200;

  for (let i = 0; i < WARMUP; i++) {
    rank(units, request, { now: Date.now() });
  }

  for (let i = 0; i < RUNS; i++) {
    const start = process.hrtime.bigint();
    rank(units, request, { now: Date.now() });
    const end = process.hrtime.bigint();
    timesMs.push(Number(end - start) / 1e6); // convert ns to ms
  }

  timesMs.sort((a, b) => a - b);
  const median = timesMs[Math.floor(RUNS * 0.5)];
  const p95 = timesMs[Math.floor(RUNS * 0.95)];
  const min = timesMs[0];
  const max = timesMs[RUNS - 1];

  console.log(JSON.stringify({
    runs: RUNS,
    unitsCount: 60,
    medianMs: Number(median.toFixed(4)),
    p95Ms: Number(p95.toFixed(4)),
    minMs: Number(min.toFixed(4)),
    maxMs: Number(max.toFixed(4)),
    nodeVersion: process.version,
    platform: process.platform
  }));
}

runBenchmark();
