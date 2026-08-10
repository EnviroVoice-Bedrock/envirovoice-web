type LogScope = "EnviroVoice" | "Signaling" | "Rooms";

const log = (scope: LogScope, message: string, payload?: unknown): void => {
  if (payload === undefined) {
    console.info(`[${scope}] ${message}`);
    return;
  }

  console.info(`[${scope}] ${message}`, payload);
};

const error = (scope: LogScope, message: string, payload?: unknown): void => {
  if (payload === undefined) {
    console.error(`[${scope}] ${message}`);
    return;
  }

  console.error(`[${scope}] ${message}`, payload);
};

export const logger = {
  log,
  error
};
