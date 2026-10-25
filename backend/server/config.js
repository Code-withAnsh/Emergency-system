// Constants and operational parameters for HackWave Dispatch Engine

export const MAP_CONFIG = {
  CENTER_LAT: 23.2599,
  CENTER_LNG: 77.4126,
  DELTA: 0.06,
  MIN_LAT: 23.2599 - 0.06, // 23.1999
  MAX_LAT: 23.2599 + 0.06, // 23.3199
  MIN_LNG: 77.4126 - 0.06, // 77.3526
  MAX_LNG: 77.4126 + 0.06  // 77.4726
};

export const SPEEDS = {
  ambulance: 40, // km/h
  bike: 25       // km/h
};

export const THRESHOLDS = {
  STALE_GPS_SECONDS: 20,
  PICKUP_TIME_MINUTES: 1,
  BUSY_DURATION_SECONDS: 30,
  SPIKE_DURATION_SECONDS: 30,
  SPIKE_RADIUS_KM: 1.5
};

export const PENALTIES = {
  CRITICAL_BIKE_FALLBACK_MINUTES: 5,
  MINOR_STALE_MINUTES: 3,
  MINOR_AMBULANCE_MINUTES: 2,
  SPIKE_ZONE_MINUTES: 1
};

export const FLEET_CONFIG = {
  TOTAL_UNITS: 60,
  AMBULANCE_RATIO: 0.5 // 30 ambulances, 30 bikes
};
