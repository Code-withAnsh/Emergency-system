// One-off import: hospitals from OpenStreetMap inside the drill box, into
// "emergency-system".hospitals as UNVERIFIED staging records. Dispatch ignores them
// until a person sets verified: true. Upserts by id, never deletes.
// Run: node scripts/import-osm-hospitals.js   (needs MONGO_URI in backend/.env)

import 'dotenv/config';
import { connectMongo, closeMongo } from '../server/db/mongo.js';
import { MAP_CONFIG } from '../server/config.js';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
// 30 km around the city centre, so hospitals on JK Road and the outer ring are included
const RADIUS_M = 30000;
const { CENTER_LAT, CENTER_LNG } = MAP_CONFIG;

const query = `[out:json][timeout:50];(node["amenity"="hospital"](around:${RADIUS_M},${CENTER_LAT},${CENTER_LNG});way["amenity"="hospital"](around:${RADIUS_M},${CENTER_LAT},${CENTER_LNG}););out tags center 400;`;

// Overpass is busy at times (502/504): retry with a pause
let res = null;
for (let attempt = 1; attempt <= 4; attempt++) {
  res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'User-Agent': 'hackwave-prototype/1.0 (hackathon demo)', Accept: '*/*', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query)
  });
  if (res.ok) break;
  console.warn(`Overpass HTTP ${res.status}, retry ${attempt}/4`);
  await new Promise((r) => setTimeout(r, 4000 * attempt));
}
if (!res.ok) throw new Error(`Overpass HTTP ${res.status} after retries`);
const { elements } = await res.json();

const docs = elements
  .filter((e) => e.tags?.name)
  .map((e) => {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    const t = e.tags;
    return {
      id: `OSM-${e.type}-${e.id}`,
      name: t.name.trim(),
      type: 'unknown', // OSM rarely says government or private: a person must set this
      lat, lng,
      phone: t.phone || t['contact:phone'] || null,
      beds: t.beds ? Number(t.beds) || null : null,
      emergency: t.emergency === 'yes' ? true : null,
      address: [t['addr:street'], t['addr:suburb'], t['addr:city']].filter(Boolean).join(', ') || null,
      source: 'osm',
      verified: false
    };
  })
  .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng));

const db = await connectMongo();
if (!db) throw new Error('not connected to MongoDB (check MONGO_URI)');
const col = db.collection('hospitals');
await col.createIndex({ id: 1 }, { unique: true });

const ops = docs.map((d) => ({
  updateOne: { filter: { id: d.id }, update: { $setOnInsert: d }, upsert: true }
}));
const result = ops.length ? await col.bulkWrite(ops, { ordered: false }) : null;

console.log(JSON.stringify({
  database: db.databaseName,
  fetched: elements.length,
  usable: docs.length,
  inserted: result?.upsertedCount ?? 0,
  alreadyThere: docs.length - (result?.upsertedCount ?? 0),
  withPhone: docs.filter((d) => d.phone).length,
  withBeds: docs.filter((d) => d.beds).length
}, null, 2));
await closeMongo();
