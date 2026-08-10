import { env } from "../../config/env";
import type { Room } from "../../types/room";

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

const REQUEST_TIMEOUT_MS = 8000;

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      ...init
    });
  } finally {
    window.clearTimeout(timeout);
  }

  const parsed = (await response.json()) as ApiResponse<T>;

  if (!response.ok) {
    throw new Error(parsed.message || `API request failed (${response.status})`);
  }

  return parsed.data;
};

export const apiClient = {
  health: () => request<{ service: string; status: string }>("/api/health"),
  resetTesting: () => request<{ reset: boolean }>("/api/testing/reset", { method: "POST" }),
  getRooms: () => request<Room[]>("/api/rooms"),
  createRoom: (name: string, userId: string, userName: string) =>
    request<Room>("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ name, userId, userName })
    }),
  joinRoom: (roomId: string, userId: string, userName: string) =>
    request<Room>(`/api/rooms/${roomId}/join`, {
      method: "POST",
      body: JSON.stringify({ userId, userName })
    }),
  leaveRoom: (roomId: string, userId: string) =>
    request<Room | null>(`/api/rooms/${roomId}/leave`, {
      method: "POST",
      body: JSON.stringify({ userId })
    })
};
