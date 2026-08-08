const withDefault = (value: string | undefined, key: string, fallback: string): string => {
  if (!value) {
    console.warn(`[EnviroVoice] Missing environment variable: ${key}. Using default: ${fallback}`);
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

export const env = {
  apiUrl: withDefault(import.meta.env.VITE_API_URL, "VITE_API_URL", getDefaultApiUrl()),
  signalingUrl: withDefault(import.meta.env.VITE_SIGNALING_URL, "VITE_SIGNALING_URL", getDefaultSignalingUrl())
};
