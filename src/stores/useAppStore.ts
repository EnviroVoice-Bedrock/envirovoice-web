import { create } from "zustand";
import { apiClient } from "../services/api/client";
import { SignalingClient } from "../services/signaling/signalingClient";
import { WebRtcService } from "../services/webrtc/webrtcService";
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
  voiceStatus: "idle" | "requesting" | "ready" | "denied" | "unavailable" | "failed";
  peerStates: Record<string, RTCPeerConnectionState>;
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
  startVoice: () => Promise<void>;
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
  const webrtc = new WebRtcService({
    sendSignal: (message) => {
      signaling.send(message);
    },
    onPeerStateChange: (userId, state) => {
      set((store) => ({
        peerStates: {
          ...store.peerStates,
          [userId]: state
        }
      }));

      if (state === "failed") {
        set({ errorMessage: "WebRTC failed" });
      }
    },
    onLocalSpeaking: (speaking) => {
      const { session, currentRoom } = get();
      if (!session || !currentRoom) {
        return;
      }

      set((store) => {
        if (!store.currentRoom) {
          return store;
        }

        return {
          currentRoom: {
            ...store.currentRoom,
            users: store.currentRoom.users.map((user) => (user.id === session.id ? { ...user, speaking } : user))
          }
        };
      });

      signaling.send({
        type: "speaking-state",
        roomId: currentRoom.id,
        from: session.id,
        payload: { speaking }
      });
    }
  });

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

      const { session, currentRoom } = get();
      if (session && currentRoom?.id === room.id) {
        webrtc.setContext({ roomId: room.id, selfId: session.id });
        void webrtc.syncRoomPeers(room.users.map((user) => user.id));
      }
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
      if (message.from) {
        webrtc.closePeer(message.from);
      }
      return;
    }

    if (message.type === "offer" && message.from) {
      void webrtc.handleOffer(message.from, message.payload);
      return;
    }

    if (message.type === "answer" && message.from) {
      void webrtc.handleAnswer(message.from, message.payload);
      return;
    }

    if (message.type === "ice-candidate" && message.from) {
      void webrtc.handleIceCandidate(message.from, message.payload);
      return;
    }

    if (message.type === "speaking-state" && message.from) {
      const speaking = Boolean((message.payload as { speaking?: unknown } | undefined)?.speaking);
      set((state) => {
        if (!state.currentRoom) {
          return state;
        }

        return {
          currentRoom: {
            ...state.currentRoom,
            users: state.currentRoom.users.map((user) => (user.id === message.from ? { ...user, speaking } : user))
          }
        };
      });
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
    voiceStatus: "idle",
    peerStates: {},
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

    startVoice: async () => {
      const { session, currentRoom, isSelfMuted } = get();
      if (!session || !currentRoom) {
        return;
      }

      webrtc.setContext({ roomId: currentRoom.id, selfId: session.id });
      set({ voiceStatus: "requesting" });

      try {
        await webrtc.ensureLocalAudio();
        webrtc.setMicrophoneEnabled(!isSelfMuted);
        set({ voiceStatus: "ready", errorMessage: null });
        await webrtc.syncRoomPeers(currentRoom.users.map((user) => user.id));
      } catch (err) {
        logger.error("EnviroVoice", "Microphone setup failed", err);

        const errorName = err instanceof DOMException ? err.name : "Unknown";
        if (errorName === "NotAllowedError") {
          set({ voiceStatus: "denied", errorMessage: "Microphone denied" });
          return;
        }

        if (errorName === "NotFoundError" || errorName === "NotReadableError") {
          set({ voiceStatus: "unavailable", errorMessage: "Microphone unavailable" });
          return;
        }

        set({ voiceStatus: "failed", errorMessage: "No microphone" });
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
        voiceStatus: "idle",
        peerStates: {},
        isSelfMuted: false,
        isSelfDeafened: false,
        deafenedUsers: {}
      });

      webrtc.reset();

      await get().fetchRooms();
    },

    setSelfMuted: (muted) => {
      const { session, currentRoom, signaling } = get();

      set((state) => ({
        isSelfMuted: muted,
        currentRoom: session && state.currentRoom ? updateLocalUser(state.currentRoom, session.id, muted) : state.currentRoom
      }));

      webrtc.setMicrophoneEnabled(!muted);

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
      const { currentRoom, session } = get();
      if (currentRoom && session) {
        for (const user of currentRoom.users) {
          if (user.id !== session.id) {
            webrtc.setPeerDeafened(user.id, deafened);
          }
        }
      }

      set({ isSelfDeafened: deafened });
    },

    toggleUserDeafen: (userId) => {
      const nextState = !get().deafenedUsers[userId];

      set((state) => ({
        deafenedUsers: {
          ...state.deafenedUsers,
          [userId]: nextState
        }
      }));

      webrtc.setPeerDeafened(userId, nextState);
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
        voiceStatus: "idle",
        peerStates: {},
        isSelfMuted: false,
        isSelfDeafened: false,
        deafenedUsers: {},
        errorMessage: null
      });

      webrtc.reset();
    },

    clearError: () => {
      set({ errorMessage: null });
    }
  };
});

export const selectParticipants = (room: Room | null): RoomUser[] => room?.users ?? [];
