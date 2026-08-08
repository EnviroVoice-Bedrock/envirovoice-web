import { create } from "zustand";
import { apiClient } from "../services/api/client";
import { SignalingClient } from "../services/signaling/signalingClient";
import type { Room, RoomUser } from "../types/room";
import type { ConnectionStatus } from "../types/signaling";
import { logger } from "../utils/logger";

type UserSession = {
  id: string;
  name: string;
};

type AppState = {
  session: UserSession | null;
  rooms: Room[];
  currentRoom: Room | null;
  connectionStatus: ConnectionStatus;
  isSelfMuted: boolean;
  isSelfDeafened: boolean;
  deafenedUsers: Record<string, boolean>;
  errorMessage: string | null;
  signaling: SignalingClient;
  setSession: (name: string) => void;
  initialize: () => void;
  fetchRooms: () => Promise<void>;
  connectToRoomByName: (roomName: string) => Promise<void>;
  createRoom: (name: string) => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  setSelfMuted: (muted: boolean) => void;
  setSelfDeafened: (deafened: boolean) => void;
  toggleUserDeafen: (userId: string) => void;
  logout: () => Promise<void>;
  clearError: () => void;
};

const createId = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
};

const updateLocalUser = (room: Room, userId: string, muted: boolean): Room => ({
  ...room,
  users: room.users.map((user) => (user.id === userId ? { ...user, muted } : user))
});

const upsertRoom = (rooms: Room[], room: Room): Room[] => {
  const index = rooms.findIndex((item) => item.id === room.id);
  if (index === -1) {
    return [...rooms, room];
  }

  const cloned = [...rooms];
  cloned[index] = room;
  return cloned;
};

export const useAppStore = create<AppState>((set, get) => {
  const signaling = new SignalingClient();

  signaling.onStatusChange((status) => {
    set({ connectionStatus: status });
  });

  signaling.onMessage((message) => {
    if (message.type === "room-state" && message.payload) {
      const room = message.payload as Room;
      set((state) => ({
        currentRoom: state.currentRoom?.id === room.id ? room : state.currentRoom,
        rooms: upsertRoom(state.rooms, room)
      }));
      return;
    }

    if (message.type === "rooms-state" && message.payload) {
      const rooms = message.payload as Room[];
      set((state) => ({
        rooms,
        currentRoom: state.currentRoom
          ? rooms.find((room) => room.id === state.currentRoom?.id) ?? null
          : null
      }));
      return;
    }

    if (message.type === "user-joined") {
      logger.log("Rooms", "User joined", message.payload);
      return;
    }

    if (message.type === "user-left") {
      logger.log("Rooms", "User left", message.payload);
      return;
    }

    if (message.type === "error") {
      const payload = message.payload as { message?: string } | undefined;
      set({ errorMessage: payload?.message ?? "Unknown signaling error" });
    }
  });

  return {
    session: null,
    rooms: [],
    currentRoom: null,
    connectionStatus: "disconnected",
    isSelfMuted: false,
    isSelfDeafened: false,
    deafenedUsers: {},
    errorMessage: null,
    signaling,

    setSession: (name) => {
      const trimmed = name.trim();
      if (!trimmed) {
        set({ errorMessage: "Username is required" });
        return;
      }

      set({
        session: {
          id: createId(),
          name: trimmed
        },
        errorMessage: null
      });
    },

    initialize: () => {
      signaling.connect();
    },

    fetchRooms: async () => {
      try {
        const rooms = await apiClient.getRooms();
        set({ rooms, errorMessage: null });
      } catch (err) {
        logger.error("Rooms", "Failed to fetch rooms", err);
        set({ errorMessage: "Connection failed" });
      }
    },

    connectToRoomByName: async (roomName) => {
      const normalized = roomName.trim();
      if (!normalized) {
        return;
      }

      await get().fetchRooms();
      const existing = get().rooms.find((room) => room.name.toLowerCase() === normalized.toLowerCase());

      if (existing) {
        await get().joinRoom(existing.id);
        return;
      }

      await get().createRoom(normalized);
    },

    createRoom: async (name) => {
      const { session } = get();
      if (!session) {
        set({ errorMessage: "Login required" });
        return;
      }

      try {
        const room = await apiClient.createRoom(name, session.id, session.name);
        signaling.send({
          type: "join-room",
          roomId: room.id,
          from: session.id,
          payload: { userName: session.name }
        });

        set((state) => ({
          currentRoom: room,
          rooms: state.rooms.some((item) => item.id === room.id)
            ? state.rooms.map((item) => (item.id === room.id ? room : item))
            : [...state.rooms, room],
          errorMessage: null
        }));
      } catch (err) {
        logger.error("Rooms", "Failed to create room", err);
        set({ errorMessage: "Connection failed" });
      }
    },

    joinRoom: async (roomId) => {
      const { session } = get();
      if (!session) {
        set({ errorMessage: "Login required" });
        return;
      }

      try {
        const room = await apiClient.joinRoom(roomId, session.id, session.name);
        signaling.send({
          type: "join-room",
          roomId,
          from: session.id,
          payload: { userName: session.name }
        });

        set({ currentRoom: room, errorMessage: null });
      } catch (err) {
        logger.error("Rooms", "Failed to join room", err);
        set({ errorMessage: "Room full" });
      }
    },

    leaveRoom: async () => {
      const { session, currentRoom } = get();
      if (!session || !currentRoom) {
        return;
      }

      try {
        await apiClient.leaveRoom(currentRoom.id, session.id);
      } catch (err) {
        logger.error("Rooms", "Failed to leave room through API", err);
      }

      signaling.send({
        type: "leave-room",
        roomId: currentRoom.id,
        from: session.id,
        payload: { userName: session.name }
      });

      set({
        currentRoom: null,
        isSelfMuted: false,
        isSelfDeafened: false,
        deafenedUsers: {}
      });

      await get().fetchRooms();
    },

    setSelfMuted: (muted) => {
      const { session, currentRoom, signaling } = get();

      set((state) => ({
        isSelfMuted: muted,
        currentRoom: session && state.currentRoom ? updateLocalUser(state.currentRoom, session.id, muted) : state.currentRoom
      }));

      if (session && currentRoom) {
        signaling.send({
          type: "mute-state",
          roomId: currentRoom.id,
          from: session.id,
          payload: { muted }
        });
      }
    },

    setSelfDeafened: (deafened) => {
      set({ isSelfDeafened: deafened });
    },

    toggleUserDeafen: (userId) => {
      set((state) => ({
        deafenedUsers: {
          ...state.deafenedUsers,
          [userId]: !state.deafenedUsers[userId]
        }
      }));
    },

    logout: async () => {
      const { currentRoom } = get();

      if (currentRoom) {
        await get().leaveRoom();
      }

      set({
        session: null,
        rooms: [],
        currentRoom: null,
        isSelfMuted: false,
        isSelfDeafened: false,
        deafenedUsers: {},
        errorMessage: null
      });
    },

    clearError: () => {
      set({ errorMessage: null });
    }
  };
});

export const selectParticipants = (room: Room | null): RoomUser[] => room?.users ?? [];
