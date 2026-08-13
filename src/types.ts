export interface PlayerLocation {
  x: number;
  y: number;
  z: number;
}

export interface PlayerRotation {
  x: number;
  y: number;
}

export interface PlayerData {
  dimension: string;
  id: string;
  isBuried: boolean;
  isDeafen: boolean;
  isInCave: boolean;
  isInMountain: boolean;
  isMuted: boolean;
  isUnderWater: boolean;
  location: PlayerLocation;
  microphoneVolume: number;
  name: string;
  rotation: PlayerRotation;
  /** true when the in-game voice settings menu just changed mute/deafen —
   * the web must adopt this value immediately instead of its own */
  priority?: boolean;
}

export interface ServerConfig {
  buriedSound: boolean;
  caveSound: boolean;
  lastUpdated: string;
  maxDistance: number;
  mountainSound: boolean;
  muteAll: boolean;
  roomUrl: string;
  underwaterSound: boolean;
}

export interface MinecraftData {
  players: PlayerData[];
  server: ServerConfig;
}

/** written by the web client to `envirovoice.json`, read by the Minecraft
 * addon so it knows each player's real voice-chat state. */
export interface EnvirovoicePlayerState {
  connected: boolean;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  /** true right after an explicit mute/deafen action on the web (button or
   * keybind) — the addon must adopt this value immediately instead of its own */
  priority: boolean;
}

export interface EnvirovoiceData {
  updatedAt: string;
  players: Record<string, EnvirovoicePlayerState>;
}

export type Screen = 'login' | 'connecting' | 'room';

export type ConnectError = 'room-not-found' | 'player-not-online' | null;

export interface KeybindConfig {
  enabled: boolean;
  /** internal matcher, e.g. "key:KeyM" or "mouse:1" — compared against captured input events */
  code: string;
  /** human-readable label shown in the UI, e.g. "M" or "Middle mouse" */
  label: string;
}
