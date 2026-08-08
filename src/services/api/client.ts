import { env } from "../../config/env";
import type { Room } from "../../types/room";

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${env.apiUrl}${path}`, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  if (!response.ok) {
    throw new Error(`API request failed (${response.status})`);
  }

  const parsed = (await response.json()) as ApiResponse<T>;
  return parsed.data;
};

export const apiClient = {
  health: () => request<{ service: string; status: string }>("/api/health"),
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
