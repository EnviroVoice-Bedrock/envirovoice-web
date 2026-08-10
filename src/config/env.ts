const withDefault = (value: string | undefined, key: string, fallback: string): string => {
  if (!value) {
    if (import.meta.env.DEV) {
      console.warn(`[EnviroVoice] Missing environment variable: ${key}. Using default: ${fallback}`);
    }
    return fallback;
  }

  return value;
};

const getDefaultApiUrl = (): string => {
  if (import.meta.env.DEV) {
    return "http://localhost:3000";
  }

  return "";
};

const getDefaultSignalingUrl = (): string => {
  if (import.meta.env.DEV) {
    return "ws://localhost:3000";
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/api/ws`;
  }

  return "ws://localhost:3000";
};

const FIREBASE_DB_BASE = "https://envirovoice-test-default-rtdb.europe-west1.firebasedatabase.app";

const getDefaultMinecraftDataUrl = (): string => `${FIREBASE_DB_BASE}/minecraft.json`;

const getDefaultEnvirovoiceDataUrl = (): string => `${FIREBASE_DB_BASE}/envirovoice.json`;

export const env = {
  apiUrl: withDefault(import.meta.env.VITE_API_URL, "VITE_API_URL", getDefaultApiUrl()),
  signalingUrl: withDefault(import.meta.env.VITE_SIGNALING_URL, "VITE_SIGNALING_URL", getDefaultSignalingUrl()),
  minecraftDataUrl: withDefault(import.meta.env.VITE_MINECRAFT_DATA_URL, "VITE_MINECRAFT_DATA_URL", getDefaultMinecraftDataUrl()),
  envirovoiceDataUrl: withDefault(import.meta.env.VITE_ENVIROVOICE_DATA_URL, "VITE_ENVIROVOICE_DATA_URL", getDefaultEnvirovoiceDataUrl())
};
