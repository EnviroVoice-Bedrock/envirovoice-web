import { env } from "../../config/env";

type WebVoiceUser = {
  id: string;
  name: string;
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
};

type MinecraftPlayerPayload = {
  id?: string | number;
  name?: string;
  [key: string]: unknown;
};

type MinecraftSnapshot = {
  players?: MinecraftPlayerPayload[];
  server?: unknown;
  [key: string]: unknown;
};

type SyncInput = {
  roomName: string;
  users: WebVoiceUser[];
};

const SYNC_TIMEOUT_MS = 7000;

const normalizeName = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
};

const timedFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }
};

const buildPayload = (source: MinecraftSnapshot, roomName: string, users: WebVoiceUser[]): MinecraftSnapshot => {
  const usersByName = new Map<string, WebVoiceUser>();
  for (const user of users) {
    usersByName.set(normalizeName(user.name), user);
  }

  const players = Array.isArray(source.players) ? source.players : [];
  const uniquePlayers: MinecraftPlayerPayload[] = [];
  const seenKeys = new Set<string>();

  for (const player of players) {
    const key = normalizeName(player.id ?? player.name);
    if (key && seenKeys.has(key)) {
      continue;
    }

    if (key) {
      seenKeys.add(key);
    }

    uniquePlayers.push(player);
  }

  const enrichedPlayers = uniquePlayers.map((player) => {
    const key = normalizeName(player.name);
    const matched = usersByName.get(key);

    return {
      ...player,
      isSpeaking: matched?.speaking ?? false,
      webUserId: matched?.id ?? null,
      webMuted: matched?.muted ?? null,
      webDeafened: matched?.deafened ?? null
    };
  });

  return {
    ...source,
    players: enrichedPlayers,
    voice: {
      roomCode: roomName,
      updatedAt: Date.now(),
      onlineUsers: users.length
    }
  };
};

export const syncFirebaseVoiceState = async ({ roomName, users }: SyncInput): Promise<void> => {
  const readUrl = env.minecraftDataUrl;
  const writeUrl = env.envirovoiceDataUrl;

  if (!readUrl || !writeUrl) {
    return;
  }

  const getResponse = await timedFetch(readUrl, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  if (!getResponse.ok) {
    throw new Error(`Minecraft data fetch failed (${getResponse.status})`);
  }

  const source = (await getResponse.json()) as MinecraftSnapshot;
  const payload = buildPayload(source ?? {}, roomName, users);

  const putResponse = await timedFetch(writeUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!putResponse.ok) {
    throw new Error(`EnviroVoice data update failed (${putResponse.status})`);
  }
};
