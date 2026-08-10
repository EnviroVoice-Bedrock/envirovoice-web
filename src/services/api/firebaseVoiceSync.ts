import { env } from "../../config/env";

type VoiceSyncUser = {
  id: string;
  name: string;
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
};

type VoiceSyncInput = {
  roomName: string;
  users: VoiceSyncUser[];
};

type SyncedPlayer = {
  name: string;
  isSpeaking: boolean;
  isTalking: boolean;
  muted: boolean;
  deafened: boolean;
  connected: boolean;
};

type MinecraftSnapshot =
  | {
      players?: unknown;
      onlinePlayers?: unknown;
      [key: string]: unknown;
    }
  | unknown[]
  | Record<string, unknown>;

export type MinecraftPlayerPosition = {
  name: string;
  x: number;
  y: number;
  z: number;
  dimension: "overworld" | "nether" | "end";
  isMuted?: boolean;
  isDeafen?: boolean;
  isUnderWater?: boolean;
  isBuried?: boolean;
  isInCave?: boolean;
  isInMountain?: boolean;
  microphoneVolume?: number;
};

export type MinecraftWorldState = {
  players: MinecraftPlayerPosition[];
  maxDistance: number;
  roomUrl: string;
};

const REQUEST_TIMEOUT_MS = 1500;

const normalizeName = (name: string): string => name.trim().toLowerCase();

const DEFAULT_BASE_URI = "https://envirovoice-test-default-rtdb.europe-west1.firebasedatabase.app/";

const normalizeDimension = (value: unknown): "overworld" | "nether" | "end" => {
  if (typeof value !== "string") {
    return "overworld";
  }

  const text = value.trim().toLowerCase();
  if (text.includes("nether")) {
    return "nether";
  }

  if (text.includes("end")) {
    return "end";
  }

  return "overworld";
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const toBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "true") {
      return true;
    }

    if (text === "false") {
      return false;
    }
  }

  return null;
};

const ensureJsonUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }

  return trimmed.endsWith(".json") ? trimmed : `${trimmed}.json`;
};

const withCacheBuster = (url: string): string => {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_t=${Date.now()}`;
};

const normalizeBaseUri = (baseUri?: string): string => {
  const trimmed = (baseUri ?? "").trim();
  if (!trimmed) {
    return DEFAULT_BASE_URI;
  }

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
};

const buildFirebaseJsonUrl = (baseUri: string, resource: "minecraft" | "envirovoice"): string => {
  return ensureJsonUrl(`${normalizeBaseUri(baseUri)}${resource}`);
};

const getPlayerName = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const keys = ["name", "username", "playerName", "displayName"];

  for (const key of keys) {
    const item = candidate[key];
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }
  }

  return null;
};

const tryExtractPosition = (value: unknown, keyHint?: string): MinecraftPlayerPosition | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  let positionBlock: Record<string, unknown> = candidate;
  if (candidate.location && typeof candidate.location === "object") {
    positionBlock = candidate.location as Record<string, unknown>;
  } else if (candidate.position && typeof candidate.position === "object") {
    positionBlock = candidate.position as Record<string, unknown>;
  }

  const x = toNumber(positionBlock.x ?? positionBlock.posX ?? positionBlock.locationX);
  const y = toNumber(positionBlock.y ?? positionBlock.posY ?? positionBlock.locationY);
  const z = toNumber(positionBlock.z ?? positionBlock.posZ ?? positionBlock.locationZ);

  if (x == null || y == null || z == null) {
    return null;
  }

  const directName = getPlayerName(candidate);
  const fallbackName = keyHint && keyHint.trim() && keyHint !== "players" && keyHint !== "onlinePlayers" ? keyHint.trim() : null;
  const name = directName ?? fallbackName;

  if (!name) {
    return null;
  }

  const dimension = normalizeDimension(positionBlock.dimension ?? positionBlock.dim ?? candidate.dimension ?? candidate.world);

  const microphoneVolume = toNumber(candidate.microphoneVolume);
  const isMuted = toBoolean(candidate.isMuted);
  const isDeafen = toBoolean(candidate.isDeafen);
  const isUnderWater = toBoolean(candidate.isUnderWater ?? candidate.isUnderwater);
  const isBuried = toBoolean(candidate.isBuried);
  const isInCave = toBoolean(candidate.isInCave ?? candidate.IsinCave);
  const isInMountain = toBoolean(candidate.isInMountain ?? candidate.IsinMountain);

  return {
    name,
    x,
    y,
    z,
    dimension,
    microphoneVolume: microphoneVolume == null ? undefined : microphoneVolume,
    isMuted: isMuted ?? undefined,
    isDeafen: isDeafen ?? undefined,
    isUnderWater: isUnderWater ?? undefined,
    isBuried: isBuried ?? undefined,
    isInCave: isInCave ?? undefined,
    isInMountain: isInMountain ?? undefined
  };
};

const collectPlayerPositions = (snapshot: MinecraftSnapshot): MinecraftPlayerPosition[] => {
  const deduped = new Map<string, MinecraftPlayerPosition>();

  const walk = (value: unknown, keyHint?: string): void => {
    const extracted = tryExtractPosition(value, keyHint);
    if (extracted) {
      deduped.set(normalizeName(extracted.name), extracted);
    }

    if (!value || typeof value !== "object") {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }

    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested && typeof nested === "object") {
        walk(nested, key);
      }
    }
  };

  walk(snapshot);
  return [...deduped.values()];
};

const collectPlayerNames = (snapshot: MinecraftSnapshot): string[] => {
  const names = new Set<string>();

  const collectFromArray = (list: unknown[]): void => {
    for (const item of list) {
      const name = getPlayerName(item);
      if (name) {
        names.add(name);
      }
    }
  };

  if (Array.isArray(snapshot)) {
    collectFromArray(snapshot);
    return [...names];
  }

  const candidateArrays = [snapshot.players, snapshot.onlinePlayers];
  for (const source of candidateArrays) {
    if (Array.isArray(source)) {
      collectFromArray(source);
    }
  }

  for (const [key, value] of Object.entries(snapshot)) {
    if (key === "players" || key === "onlinePlayers") {
      continue;
    }

    if (typeof value === "boolean" || typeof value === "number" || value == null) {
      continue;
    }

    const nestedName = getPlayerName(value);
    if (nestedName) {
      names.add(nestedName);
      continue;
    }

    if (typeof key === "string" && key.trim()) {
      names.add(key.trim());
    }
  }

  return [...names];
};

const fetchMinecraftSnapshot = async (baseUri?: string): Promise<MinecraftSnapshot> => {
  const sourceUrl = baseUri?.trim() ? buildFirebaseJsonUrl(baseUri, "minecraft") : ensureJsonUrl(env.minecraftDataUrl);
  const url = withCacheBuster(sourceUrl);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, max-age=0",
        Pragma: "no-cache"
      }
    });

    if (!response.ok) {
      throw new Error(`Minecraft data request failed (${response.status})`);
    }

    return (await response.json()) as MinecraftSnapshot;
  } finally {
    window.clearTimeout(timeout);
  }
};

const extractMaxDistance = (snapshot: MinecraftSnapshot): number => {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return 50;
  }

  const server = (snapshot as Record<string, unknown>).server;
  if (!server || typeof server !== "object") {
    return 50;
  }

  const value = toNumber((server as Record<string, unknown>).maxDistance);
  if (value == null || value <= 0) {
    return 50;
  }

  return Math.max(1, Math.min(300, value));
};

const extractRoomUrl = (snapshot: MinecraftSnapshot): string => {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return "";
  }

  const normalizeRoomName = (value: unknown): string => {
    if (typeof value !== "string") {
      return "";
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    const withoutQuery = trimmed.split("?")[0] ?? trimmed;
    const slashSeparated = withoutQuery.split("/").filter(Boolean);
    const candidate = slashSeparated.length > 0 ? slashSeparated[slashSeparated.length - 1] : withoutQuery;
    return candidate.replace(/\.json$/i, "").trim();
  };

  const pickFromObject = (record: Record<string, unknown>): string => {
    const keys = ["roomUrl", "roomURL", "roomName", "room", "roomId", "voiceRoom", "url"];
    for (const key of keys) {
      const normalized = normalizeRoomName(record[key]);
      if (normalized) {
        return normalized;
      }
    }

    return "";
  };

  const root = snapshot as Record<string, unknown>;

  const fromServer = root.server && typeof root.server === "object"
    ? pickFromObject(root.server as Record<string, unknown>)
    : "";
  if (fromServer) {
    return fromServer;
  }

  const fromRoot = pickFromObject(root);
  if (fromRoot) {
    return fromRoot;
  }

  return "";
};

export const fetchMinecraftPlayerPositions = async (options?: { baseUri?: string }): Promise<MinecraftPlayerPosition[]> => {
  const snapshot = await fetchMinecraftSnapshot(options?.baseUri);
  return collectPlayerPositions(snapshot);
};

export const fetchMinecraftWorldState = async (options?: { baseUri?: string }): Promise<MinecraftWorldState> => {
  const snapshot = await fetchMinecraftSnapshot(options?.baseUri);
  return {
    players: collectPlayerPositions(snapshot),
    maxDistance: extractMaxDistance(snapshot),
    roomUrl: extractRoomUrl(snapshot)
  };
};

const putVoiceSyncPayload = async (
  payload: {
  roomName: string;
  updatedAt: string;
  users: VoiceSyncUser[];
  players: SyncedPlayer[];
  },
  options?: {
    baseUri?: string;
  }
): Promise<void> => {
  const url = options?.baseUri?.trim() ? buildFirebaseJsonUrl(options.baseUri, "envirovoice") : ensureJsonUrl(env.envirovoiceDataUrl);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`EnviroVoice sync request failed (${response.status})`);
    }
  } finally {
    window.clearTimeout(timeout);
  }
};

export const syncFirebaseVoiceState = async ({
  roomName,
  users,
  firebaseBaseUri
}: VoiceSyncInput & {
  firebaseBaseUri?: string;
}): Promise<void> => {
  const usersByName = new Map<string, VoiceSyncUser>();
  for (const user of users) {
    usersByName.set(normalizeName(user.name), user);
  }

  let minecraftPlayerNames: string[] = [];
  try {
    const snapshot = await fetchMinecraftSnapshot(firebaseBaseUri);
    minecraftPlayerNames = collectPlayerNames(snapshot);
  } catch {
    // Allow sync to proceed even when Minecraft data is unavailable.
  }

  const players: SyncedPlayer[] = (minecraftPlayerNames.length > 0 ? minecraftPlayerNames : users.map((user) => user.name)).map((name) => {
    const matched = usersByName.get(normalizeName(name));
    return {
      name,
      isSpeaking: matched?.speaking ?? false,
      isTalking: matched?.speaking ?? false,
      muted: matched?.muted ?? false,
      deafened: matched?.deafened ?? false,
      connected: Boolean(matched)
    };
  });

  await putVoiceSyncPayload({
    roomName,
    updatedAt: new Date().toISOString(),
    users,
    players
  }, { baseUri: firebaseBaseUri });
};
