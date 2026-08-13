const GAMERTAG_KEY = 'envirovoice:gamertag-history';
const DB_URL_KEY = 'envirovoice:dburl-history';
const MAX_ITEMS = 6;

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    // localStorage unavailable (private mode, etc.) — history just won't persist
  }
}

function pushToFront(list: string[], value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return list;
  const withoutDupes = list.filter((v) => v.toLowerCase() !== trimmed.toLowerCase());
  return [trimmed, ...withoutDupes];
}

export function getGamertagHistory(): string[] {
  return readList(GAMERTAG_KEY);
}

export function addGamertagHistory(gamertag: string): void {
  writeList(GAMERTAG_KEY, pushToFront(readList(GAMERTAG_KEY), gamertag));
}

export function removeGamertagHistory(gamertag: string): void {
  writeList(
    GAMERTAG_KEY,
    readList(GAMERTAG_KEY).filter((v) => v.toLowerCase() !== gamertag.toLowerCase())
  );
}

export function getDbUrlHistory(): string[] {
  return readList(DB_URL_KEY);
}

export function addDbUrlHistory(url: string): void {
  writeList(DB_URL_KEY, pushToFront(readList(DB_URL_KEY), url));
}

export function removeDbUrlHistory(url: string): void {
  writeList(
    DB_URL_KEY,
    readList(DB_URL_KEY).filter((v) => v.toLowerCase() !== url.toLowerCase())
  );
}

const LAST_DEVICE_KEY = 'envirovoice:last-device-id';
const LAST_OUTPUT_DEVICE_KEY = 'envirovoice:last-output-device-id';

export function getLastDeviceId(): string {
  try {
    return localStorage.getItem(LAST_DEVICE_KEY) || '';
  } catch {
    return '';
  }
}

export function setLastDeviceId(deviceId: string): void {
  try {
    if (deviceId) localStorage.setItem(LAST_DEVICE_KEY, deviceId);
  } catch {
    // localStorage unavailable — preference just won't persist
  }
}

export function getLastOutputDeviceId(): string {
  try {
    return localStorage.getItem(LAST_OUTPUT_DEVICE_KEY) || '';
  } catch {
    return '';
  }
}

export function setLastOutputDeviceId(deviceId: string): void {
  try {
    if (deviceId) localStorage.setItem(LAST_OUTPUT_DEVICE_KEY, deviceId);
  } catch {
    // localStorage unavailable — preference just won't persist
  }
}
