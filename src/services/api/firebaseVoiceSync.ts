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

const REQUEST_TIMEOUT_MS = 5000;

const normalizeName = (name: string): string => name.trim().toLowerCase();

const ensureJsonUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }

  return trimmed.endsWith(".json") ? trimmed : `${trimmed}.json`;
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

const fetchMinecraftSnapshot = async (): Promise<MinecraftSnapshot> => {
  const url = ensureJsonUrl(env.minecraftDataUrl);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Minecraft data request failed (${response.status})`);
    }

    return (await response.json()) as MinecraftSnapshot;
  } finally {
    window.clearTimeout(timeout);
  }
};

const putVoiceSyncPayload = async (payload: {
  roomName: string;
  updatedAt: string;
  users: VoiceSyncUser[];
  players: SyncedPlayer[];
}): Promise<void> => {
  const url = ensureJsonUrl(env.envirovoiceDataUrl);
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

export const syncFirebaseVoiceState = async ({ roomName, users }: VoiceSyncInput): Promise<void> => {
  const usersByName = new Map<string, VoiceSyncUser>();
  for (const user of users) {
    usersByName.set(normalizeName(user.name), user);
  }

  let minecraftPlayerNames: string[] = [];
  try {
    const snapshot = await fetchMinecraftSnapshot();
    minecraftPlayerNames = collectPlayerNames(snapshot);
  } catch {
    // Allow sync to proceed even when Minecraft data is unavailable.
  }

  const players: SyncedPlayer[] = (minecraftPlayerNames.length > 0 ? minecraftPlayerNames : users.map((user) => user.name)).map((name) => {
    const matched = usersByName.get(normalizeName(name));
    return {
      name,
      isSpeaking: matched?.speaking ?? false,
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
  });
};
