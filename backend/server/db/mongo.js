// MongoDB Atlas connection. Uses ONLY the "emergency-system" database.
// The database name is fixed in code, so any other path in MONGO_URI is ignored.
// NEVER logs the connection string or credentials.

import { MongoClient } from 'mongodb';

export const DB_NAME = 'emergency-system';
const CONNECT_TIMEOUT_MS = 5000;

let client = null;
let db = null;

export async function connectMongo(uri = process.env.MONGO_URI) {
  if (db) return db;
  if (!uri) return null;
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS });
    await client.connect();
    db = client.db(DB_NAME);
    await db.command({ ping: 1 });
    return db;
  } catch (err) {
    // Log the reason only; the message is scrubbed of the URI
    console.warn(`[Mongo] not connected, using built-in data: ${String(err.message).replace(/mongodb(\+srv)?:\/\/\S+/g, '[uri]')}`);
    await client?.close().catch(() => {});
    client = null;
    db = null;
    return null;
  }
}

export function getDb() {
  return db;
}

export async function closeMongo() {
  await client?.close().catch(() => {});
  client = null;
  db = null;
}
