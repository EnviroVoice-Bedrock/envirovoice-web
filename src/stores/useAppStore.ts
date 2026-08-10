import { create } from "zustand";
import { apiClient } from "../services/api/client";
import type { MinecraftPlayerPosition, MinecraftWorldState } from "../services/api/firebaseVoiceSync";
import { SignalingClient } from "../services/signaling/signalingClient";
import { WebRtcService } from "../services/webrtc/webrtcService";
import type { Room, RoomUser } from "../types/room";
import type { ConnectionStatus } from "../types/signaling";
import { logger } from "../utils/logger";

type UserSession = {
  id: string;
  name: string;
};

type VoiceMode = "call" | "minecraft";

type MicrophoneOption = {
  id: string;
  label: string;
};

type PeerDebugInfo = {
  connectionState: RTCPeerConnectionState | "closed";
  signalingState: RTCSignalingState | "closed";
  audioSenders: number;
  audioReceivers: number;
};

type AppState = {
  session: UserSession | null;
  rooms: Room[];
  currentRoom: Room | null;
  voiceMode: VoiceMode;
  connectionStatus: ConnectionStatus;
  voiceStatus: "idle" | "requesting" | "ready" | "denied" | "unavailable" | "failed";
  peerStates: Record<string, RTCPeerConnectionState>;
  isSelfMuted: boolean;
  isSelfDeafened: boolean;
  micSensitivity: number;
  localMicLevel: number;
  monitorSelfVoice: boolean;
  minecraftMaxDistance: number;
  availableMicrophones: MicrophoneOption[];
  selectedMicrophoneId: string | null;
  debugPeerInfo: Record<string, PeerDebugInfo>;
  debugLastPlaybackError: string | null;
  deafenedUsers: Record<string, boolean>;
  peerVolumes: Record<string, number>;
  errorMessage: string | null;
  signaling: SignalingClient;
  setSession: (name: string) => void;
  setVoiceMode: (mode: VoiceMode) => void;
  initialize: () => void;
  fetchRooms: () => Promise<void>;
  connectToRoomByName: (roomName: string) => Promise<void>;
  createRoom: (name: string) => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
  startVoice: () => Promise<void>;
  refreshMicrophones: () => Promise<void>;
  refreshDiagnostics: () => void;
  applyMinecraftPlayerPositions: (players: MinecraftPlayerPosition[]) => void;
  applyMinecraftWorldState: (worldState: MinecraftWorldState) => void;
  setMicrophone: (deviceId: string | null) => Promise<void>;
  setMicSensitivity: (value: number) => void;
  setMonitorSelfVoice: (enabled: boolean) => void;
  setPeerVolume: (userId: string, volume: number) => void;
  leaveRoom: () => Promise<void>;
  setSelfMuted: (muted: boolean) => void;
  setSelfDeafened: (deafened: boolean) => void;
  toggleUserDeafen: (userId: string) => void;
  logout: () => Promise<void>;
  resetForTesting: () => Promise<void>;
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

const mergeRoomPreservingPositions = (nextRoom: Room, previousRoom: Room | null | undefined): Room => {
  if (!previousRoom) {
    return nextRoom;
  }

  const previousUsersById = new Map(previousRoom.users.map((user) => [user.id, user]));

  return {
    ...nextRoom,
    users: nextRoom.users.map((user) => {
      const previousUser = previousUsersById.get(user.id);
      if (!previousUser) {
        return user;
      }

      return {
        ...user,
        position: previousUser.position
      };
    })
  };
};

const hasMinecraftPosition = (user: RoomUser): boolean => {
  const p = user.position;
  return !(p.x === 0 && p.y === 0 && p.z === 0 && p.dimension === "overworld");
};

const normalizeUserName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/§[0-9a-fk-or]/gi, "")
    .replace(/[^a-z0-9_-]/g, "");

const computeMinecraftVolume = (selfUser: RoomUser, otherUser: RoomUser, maxDistance: number): number => {
  if (!hasMinecraftPosition(selfUser) || !hasMinecraftPosition(otherUser)) {
    return 0;
  }

  if (selfUser.position.dimension !== otherUser.position.dimension) {
    return 0;
  }

  const dx = selfUser.position.x - otherUser.position.x;
  const dy = selfUser.position.y - otherUser.position.y;
  const dz = selfUser.position.z - otherUser.position.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const safeMaxDistance = Math.max(1, Math.min(300, maxDistance));

  if (distance >= safeMaxDistance) {
    return 0;
  }

  return Math.max(0, Math.min(1, 1 - distance / safeMaxDistance));
};

export const useAppStore = create<AppState>((set, get) => {
  const signaling = new SignalingClient();
  const peerRecoveryTimers = new Map<string, number>();

  const clearPeerRecoveryTimer = (userId: string): void => {
    const timer = peerRecoveryTimers.get(userId);
    if (!timer) {
      return;
    }

    window.clearTimeout(timer);
    peerRecoveryTimers.delete(userId);
  };

  const schedulePeerRecovery = (userId: string): void => {
    clearPeerRecoveryTimer(userId);

    const timer = window.setTimeout(() => {
      peerRecoveryTimers.delete(userId);

      const { session, currentRoom, voiceStatus } = get();
      if (!session || !currentRoom || voiceStatus !== "ready") {
        return;
      }

      webrtc.setContext({ roomId: currentRoom.id, selfId: session.id });
      webrtc.closePeer(userId);
      void webrtc.syncRoomPeers(currentRoom.users.map((user) => user.id));
    }, 2200);

    peerRecoveryTimers.set(userId, timer);
  };

  const clearAllPeerRecoveryTimers = (): void => {
    for (const timer of peerRecoveryTimers.values()) {
      window.clearTimeout(timer);
    }

    peerRecoveryTimers.clear();
  };

  const webrtc = new WebRtcService({
    sendSignal: (message) => {
      signaling.send(message);
    },
    onPeerStateChange: (userId, state) => {
      const { session, currentRoom } = get();
      if (!session || !currentRoom) {
        return;
      }

      set((store) => ({
        peerStates: {
          ...store.peerStates,
          [userId]: state
        }
      }));

      if (state === "connected") {
        clearPeerRecoveryTimer(userId);
      }

      if (state === "disconnected" || state === "failed") {
        schedulePeerRecovery(userId);
      }

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
    },
    onLocalLevel: (level) => {
      set({ localMicLevel: level });
    }
  });

  signaling.onStatusChange((status) => {
    set({ connectionStatus: status });

    if (status !== "connected") {
      return;
    }

    const { session, currentRoom, voiceStatus, isSelfMuted } = get();
    if (!session || !currentRoom) {
      return;
    }

    signaling.send({
      type: "join-room",
      roomId: currentRoom.id,
      from: session.id,
      payload: { userName: session.name }
    });

    if (voiceStatus === "ready") {
      webrtc.setContext({ roomId: currentRoom.id, selfId: session.id });
      webrtc.setMicrophoneEnabled(!isSelfMuted);
      void webrtc.syncRoomPeers(currentRoom.users.map((user) => user.id));
    }
  });

  const applyVoiceMix = (): void => {
    const { currentRoom, session, minecraftMaxDistance, isSelfDeafened, deafenedUsers, peerVolumes } = get();
    if (!currentRoom || !session) {
      return;
    }

    const selfUser = currentRoom.users.find((user) => user.id === session.id);
    if (!selfUser) {
      return;
    }

    for (const user of currentRoom.users) {
      if (user.id === session.id) {
        continue;
      }

      const manuallyDeafened = Boolean(deafenedUsers[user.id]) || isSelfDeafened;
      const baseVolume = computeMinecraftVolume(selfUser, user, minecraftMaxDistance);
      const personalVolume = peerVolumes[user.id] ?? 1;
      const volume = Math.max(0, Math.min(1, baseVolume * personalVolume));

      webrtc.setPeerDeafened(user.id, manuallyDeafened);
      webrtc.setPeerVolume(user.id, manuallyDeafened ? 0 : volume);
    }
  };

  signaling.onMessage((message) => {
    if (message.type === "room-state" && message.payload) {
      const room = message.payload as Room;
      set((state) => ({
        currentRoom: state.currentRoom?.id === room.id ? mergeRoomPreservingPositions(room, state.currentRoom) : state.currentRoom,
        rooms: upsertRoom(state.rooms, mergeRoomPreservingPositions(room, state.currentRoom?.id === room.id ? state.currentRoom : null))
      }));

      applyVoiceMix();

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
        clearPeerRecoveryTimer(message.from);
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
    voiceMode: "minecraft",
    connectionStatus: "disconnected",
    voiceStatus: "idle",
    peerStates: {},
    isSelfMuted: false,
    isSelfDeafened: false,
    micSensitivity: 40,
    localMicLevel: 0,
    monitorSelfVoice: false,
    minecraftMaxDistance: 50,
    availableMicrophones: [],
    selectedMicrophoneId: null,
    debugPeerInfo: {},
    debugLastPlaybackError: null,
    deafenedUsers: {},
    peerVolumes: {},
    errorMessage: null,
    signaling,

    setSession: (name) => {
      const trimmed = name.trim();
      if (!trimmed) {
        set({ errorMessage: "Username is required" });
        return;
      }

      signaling.connect();

      set({
        session: {
          id: createId(),
          name: trimmed
        },
        errorMessage: null
      });
    },

    setVoiceMode: (mode) => {
      set({ voiceMode: mode });

      if (mode === "minecraft") {
        const { currentRoom, session } = get();
        const selfUser = currentRoom?.users.find((user) => user.id === session?.id);
        const hasData = Boolean(selfUser && hasMinecraftPosition(selfUser));
        if (!hasData) {
          set({ errorMessage: "Modo Minecraft activo: esperando datos de posicion del addon" });
        }
      }

      applyVoiceMix();
    },

    initialize: () => {
      signaling.connect();
      void get().refreshMicrophones();
    },

    refreshMicrophones: async () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        set({
          availableMicrophones: [],
          selectedMicrophoneId: null
        });
        return;
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const microphones = devices
          .filter((device) => device.kind === "audioinput")
          .map((device, index) => ({
            id: device.deviceId,
            label: device.label || `Microfono ${index + 1}`
          }));

        set((state) => {
          const selectedExists = state.selectedMicrophoneId
            ? microphones.some((mic) => mic.id === state.selectedMicrophoneId)
            : false;

          const nextSelectedId = selectedExists ? state.selectedMicrophoneId : (microphones[0]?.id ?? null);

          webrtc.configureInput(nextSelectedId);

          return {
            availableMicrophones: microphones,
            selectedMicrophoneId: nextSelectedId
          };
        });
      } catch (err) {
        logger.error("EnviroVoice", "Failed to enumerate microphones", err);
      }
    },

    refreshDiagnostics: () => {
      const debug = webrtc.getDebugSnapshot();
      set({
        debugPeerInfo: debug.peers,
        debugLastPlaybackError: debug.lastPlaybackError
      });
    },

    applyMinecraftPlayerPositions: (players) => {
      if (players.length === 0) {
        return;
      }

      const byName = new Map(players.map((player) => [normalizeUserName(player.name), player]));

      set((state) => {
        if (!state.currentRoom) {
          return state;
        }

        let changed = false;
        const users = state.currentRoom.users.map((user) => {
          const normalizedUserName = normalizeUserName(user.name);
          let match = byName.get(normalizedUserName);

          if (!match) {
            // Fallback for slight naming mismatches between login and Minecraft addon payload.
            match = players.find((player) => {
              const normalizedPlayerName = normalizeUserName(player.name);
              return (
                normalizedPlayerName.includes(normalizedUserName) ||
                normalizedUserName.includes(normalizedPlayerName)
              );
            });
          }

          if (!match) {
            return user;
          }

          if (
            user.position.x === match.x &&
            user.position.y === match.y &&
            user.position.z === match.z &&
            user.position.dimension === match.dimension
          ) {
            return user;
          }

          changed = true;
          return {
            ...user,
            position: {
              x: match.x,
              y: match.y,
              z: match.z,
              dimension: match.dimension
            }
          };
        });

        if (!changed) {
          return state;
        }

        const sessionId = state.session?.id;
        const selfUser = sessionId ? users.find((user) => user.id === sessionId) : null;
        const hasSelfData = Boolean(selfUser && hasMinecraftPosition(selfUser));
        const waitingError =
          typeof state.errorMessage === "string" && state.errorMessage.includes("Esperando coordenadas de Minecraft");

        return {
          currentRoom: {
            ...state.currentRoom,
            users
          },
          errorMessage: hasSelfData && waitingError ? null : state.errorMessage
        };
      });

      applyVoiceMix();
    },

    applyMinecraftWorldState: (worldState) => {
      set({ minecraftMaxDistance: worldState.maxDistance });
      get().applyMinecraftPlayerPositions(worldState.players);
      applyVoiceMix();
    },

    setMicrophone: async (deviceId) => {
      const nextId = deviceId || null;
      webrtc.configureInput(nextId);
      set({ selectedMicrophoneId: nextId });

      if (get().voiceStatus !== "ready") {
        return;
      }

      try {
        await webrtc.restartLocalAudio();
      } catch (err) {
        logger.error("EnviroVoice", "Failed to switch microphone", err);
        set({ errorMessage: "No se pudo cambiar el microfono" });
      }
    },

    setMicSensitivity: (value) => {
      const safeValue = Math.max(1, Math.min(100, Math.round(value)));
      const threshold = 0.02 + ((100 - safeValue) / 100) * 0.1;
      webrtc.setSpeakingThreshold(threshold);
      set({ micSensitivity: safeValue });
    },

    setMonitorSelfVoice: (enabled) => {
      webrtc.setSelfMonitor(enabled);
      set({ monitorSelfVoice: enabled });
    },

    setPeerVolume: (userId, volume) => {
      const safeVolume = Math.max(0, Math.min(1, volume));
      set((state) => ({
        peerVolumes: {
          ...state.peerVolumes,
          [userId]: safeVolume
        }
      }));
      applyVoiceMix();
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
      const { session, currentRoom, isSelfMuted, selectedMicrophoneId, micSensitivity, monitorSelfVoice } = get();
      if (!session || !currentRoom) {
        return;
      }

      webrtc.setContext({ roomId: currentRoom.id, selfId: session.id });
      webrtc.configureInput(selectedMicrophoneId);
      webrtc.setSelfMonitor(monitorSelfVoice);
      webrtc.setSpeakingThreshold(0.02 + ((100 - micSensitivity) / 100) * 0.1);
      set({ voiceStatus: "requesting" });

      try {
        await webrtc.ensureLocalAudio();
        await get().refreshMicrophones();
        webrtc.setMicrophoneEnabled(!isSelfMuted);
        set({ voiceStatus: "ready", errorMessage: null });
        await webrtc.syncRoomPeers(currentRoom.users.map((user) => user.id));
        applyVoiceMix();

        const latestRoom = get().currentRoom;
        const selfUser = latestRoom?.users.find((user) => user.id === session.id);
        const hasData = Boolean(selfUser && hasMinecraftPosition(selfUser));
        if (!hasData) {
          set({ errorMessage: "Esperando coordenadas de Minecraft para activar voz por proximidad" });
        } else {
          set((state) => {
            const waitingError =
              typeof state.errorMessage === "string" && state.errorMessage.includes("Esperando coordenadas de Minecraft");
            return waitingError ? { errorMessage: null } : state;
          });
        }
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

      const roomId = currentRoom.id;
      const userName = session.name;
      const userId = session.id;

      // Clear local state first so UI never remains stuck if network is slow.
      set({
        currentRoom: null,
        voiceMode: "minecraft",
        voiceStatus: "idle",
        peerStates: {},
        isSelfMuted: false,
        isSelfDeafened: false,
        micSensitivity: 40,
        localMicLevel: 0,
        monitorSelfVoice: false,
        debugPeerInfo: {},
        debugLastPlaybackError: null,
        deafenedUsers: {},
        peerVolumes: {},
        errorMessage: null
      });

      clearAllPeerRecoveryTimers();

      webrtc.reset();

      try {
        await apiClient.leaveRoom(roomId, userId);
      } catch (err) {
        logger.error("Rooms", "Failed to leave room through API", err);
      }

      signaling.send({
        type: "leave-room",
        roomId,
        from: userId,
        payload: { userName }
      });

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
      set({ isSelfDeafened: deafened });
      applyVoiceMix();
    },

    toggleUserDeafen: (userId) => {
      const nextState = !get().deafenedUsers[userId];

      set((state) => ({
        deafenedUsers: {
          ...state.deafenedUsers,
          [userId]: nextState
        }
      }));
      applyVoiceMix();
    },

    logout: async () => {
      const { session, currentRoom } = get();
      const roomId = currentRoom?.id;
      const userId = session?.id;

      set({
        session: null,
        rooms: [],
        currentRoom: null,
        voiceMode: "minecraft",
        connectionStatus: "disconnected",
        voiceStatus: "idle",
        peerStates: {},
        isSelfMuted: false,
        isSelfDeafened: false,
        micSensitivity: 40,
        localMicLevel: 0,
        monitorSelfVoice: false,
        debugPeerInfo: {},
        debugLastPlaybackError: null,
        deafenedUsers: {},
        peerVolumes: {},
        errorMessage: null
      });

      clearAllPeerRecoveryTimers();
      webrtc.reset();
      signaling.disconnect();

      if (roomId && userId) {
        try {
          await apiClient.leaveRoom(roomId, userId);
        } catch (err) {
          logger.error("Rooms", "Failed to leave room through API during logout", err);
        }
      }
    },

    resetForTesting: async () => {
      const { signaling } = get();

      try {
        await apiClient.resetTesting();
      } catch (err) {
        logger.error("Rooms", "Failed to reset backend testing state", err);
      }

      signaling.disconnect();

      set({
        session: null,
        rooms: [],
        currentRoom: null,
        voiceMode: "minecraft",
        connectionStatus: "disconnected",
        voiceStatus: "idle",
        peerStates: {},
        isSelfMuted: false,
        isSelfDeafened: false,
        micSensitivity: 40,
        localMicLevel: 0,
        monitorSelfVoice: false,
        selectedMicrophoneId: null,
        debugPeerInfo: {},
        debugLastPlaybackError: null,
        deafenedUsers: {},
        peerVolumes: {},
        errorMessage: null
      });

      clearAllPeerRecoveryTimers();

      webrtc.reset();
    },

    clearError: () => {
      set({ errorMessage: null });
    }
  };
});

export const selectParticipants = (room: Room | null): RoomUser[] => room?.users ?? [];
