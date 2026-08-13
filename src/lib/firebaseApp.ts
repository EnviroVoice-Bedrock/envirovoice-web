import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';

// Each server has its own Firebase project (just a databaseURL, no full
// config — the DB rules are expected to allow public read/write, same as
// the REST fetches already used for minecraft.json). We lazily spin up one
// Firebase app per distinct databaseURL and reuse it across the session.
const appsByUrl = new Map<string, FirebaseApp>();

function normalizeDbUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export function getDb(dbUrl: string): Database {
  const key = normalizeDbUrl(dbUrl);
  let app = appsByUrl.get(key);
  if (!app) {
    // Firebase requires a unique app name per distinct config in a session
    const name = `envirovoice-${key}`;
    const existing = getApps().find((a) => a.name === name);
    app = existing ?? initializeApp({ databaseURL: key }, name);
    appsByUrl.set(key, app);
  }
  return getDatabase(app);
}
