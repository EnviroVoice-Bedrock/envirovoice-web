const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

export const env = {
  port: parseNumber(process.env.PORT, 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  maxRoomUsers: parseNumber(process.env.MAX_ROOM_USERS, 7)
};
