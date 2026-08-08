const withDefault = (value: string | undefined, key: string, fallback: string): string => {
  if (!value) {
    console.warn(`[EnviroVoice] Missing environment variable: ${key}. Using default: ${fallback}`);
    return fallback;
  }

  return value;
};

export const env = {
  apiUrl: withDefault(import.meta.env.VITE_API_URL, "VITE_API_URL", "http://localhost:3000"),
  signalingUrl: withDefault(import.meta.env.VITE_SIGNALING_URL, "VITE_SIGNALING_URL", "ws://localhost:3000")
};
