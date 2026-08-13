import type { MinecraftData, PlayerData } from '../types';

function normalizeDbUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function avatarUrl(gamertag: string, size = 256): string {
  return `https://mc-api.io/render/face/${encodeURIComponent(gamertag)}/bedrock?size=${size}`;
}

/**
 * Reads the current world/players snapshot the Minecraft addon writes to Firebase.
 * Throws if the database doesn't exist or the request fails — the caller treats
 * that as "room not found".
 */
export async function fetchMinecraftData(dbUrl: string): Promise<MinecraftData> {
  const res = await fetch(`${normalizeDbUrl(dbUrl)}minecraft.json`);
  if (!res.ok) {
    throw new Error('room-not-found');
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.players)) {
    throw new Error('room-not-found');
  }
  return data as MinecraftData;
}

export function findPlayer(data: MinecraftData, gamertag: string): PlayerData | undefined {
  const target = gamertag.trim().toLowerCase();
  return data.players.find((p) => p.name.toLowerCase() === target);
}

/**
 * The addon writes `server.lastUpdated` on every tick it's running. If that
 * timestamp is too old, the world isn't actively reporting anymore (closed,
 * crashed, addon disabled, etc.) — the player list could just be a stale
 * leftover from whenever it last ran, not a reliable "who's online" signal.
 */
export function isDataStale(data: MinecraftData, maxAgeMs = 8000): boolean {
  const lastUpdated = data.server?.lastUpdated;
  if (!lastUpdated) return false; // older addon versions won't send this yet — don't punish them
  const age = Date.now() - new Date(lastUpdated).getTime();
  return Number.isNaN(age) || age > maxAgeMs;
}

// Writing to envirovoice.json now happens through useVoiceMesh via the
// realtime Firebase SDK (not plain REST) so it can register onDisconnect —
// that way a tab closing abruptly still flips `connected` to false instead
// of leaving a stale "still connected" entry behind.

export function isValidDbUrl(url: string): boolean {
  return /^https:\/\/.+\.firebasedatabase\.app\/?$/.test(url.trim());
}
