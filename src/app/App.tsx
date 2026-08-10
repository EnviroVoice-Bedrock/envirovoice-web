import { useEffect, useState } from "react";
import { MainLayout } from "../layouts/MainLayout";
import { LoginPage } from "../pages/LoginPage";
import { RoomPage } from "../pages/RoomPage";
import type { MinecraftPlayerPosition } from "../services/api/firebaseVoiceSync";
import { fetchMinecraftWorldState, syncFirebaseVoiceState } from "../services/api/firebaseVoiceSync";
import { useAppStore } from "../stores/useAppStore";

const DEFAULT_ROOM = "minecraft-global";
const MINECRAFT_POLL_INTERVAL_MS = 250;

export const App = () => {
  const [firebaseBaseUri, setFirebaseBaseUri] = useState("");
  const [minecraftRoomUrl, setMinecraftRoomUrl] = useState("");
  const [minecraftPlayers, setMinecraftPlayers] = useState<MinecraftPlayerPosition[]>([]);
  const [fallbackRoomName] = useState(DEFAULT_ROOM);

  const {
    session,
    currentRoom,
    voiceStatus,
    localMicLevel,
    minecraftMaxDistance,
    availableMicrophones,
    selectedMicrophoneId,
    isSelfMuted,
    isSelfDeafened,
    deafenedUsers,
    peerVolumes,
    errorMessage,
    setSession,
    initialize,
    connectToRoomByName,
    startVoice,
    refreshMicrophones,
    setMicrophone,
    setPeerVolume,
    applyMinecraftWorldState,
    setSelfMuted,
    setSelfDeafened,
    toggleUserDeafen,
    leaveRoom,
    logout,
    resetForTesting,
    clearError
  } = useAppStore();

  const normalizeName = (name: string): string => name.trim().toLowerCase();

  const handleLogin = async (name: string, serverUrl: string): Promise<void> => {
    const isResetCommand = name.trim().toLowerCase() === "!reset" || serverUrl.trim().toLowerCase() === "!reset";
    if (isResetCommand) {
      await resetForTesting();
      return;
    }

    const nextBaseUri = serverUrl.trim();
    if (!nextBaseUri) {
      return;
    }
    setFirebaseBaseUri(nextBaseUri);
    setMinecraftRoomUrl("");
    setMinecraftPlayers([]);
    setSession(name);
  };

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!session || currentRoom) {
      return;
    }

    void connectToRoomByName(minecraftRoomUrl.trim() || fallbackRoomName);
  }, [session, currentRoom, minecraftRoomUrl, fallbackRoomName, connectToRoomByName]);

  useEffect(() => {
    if (!session || !currentRoom) {
      return;
    }

    const targetRoomName = minecraftRoomUrl.trim();
    if (!targetRoomName) {
      return;
    }

    if (currentRoom.name.trim().toLowerCase() === targetRoomName.toLowerCase()) {
      return;
    }

    void leaveRoom();
  }, [session, currentRoom, minecraftRoomUrl, leaveRoom]);

  useEffect(() => {
    if (!session || !currentRoom || voiceStatus !== "idle") {
      return;
    }

    void startVoice();
  }, [session, currentRoom, voiceStatus, startVoice]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;
    let polling = false;

    const pollMinecraft = async (): Promise<void> => {
      if (polling) {
        return;
      }

      polling = true;

      try {
        const worldState = await fetchMinecraftWorldState({ baseUri: firebaseBaseUri });
        if (!cancelled) {
          setMinecraftPlayers(worldState.players);
          if (worldState.roomUrl) {
            setMinecraftRoomUrl(worldState.roomUrl);
          }
          applyMinecraftWorldState(worldState);

          const selfPlayer = worldState.players.find((player) => normalizeName(player.name) === normalizeName(session.name));
          if (selfPlayer) {
            if (typeof selfPlayer.isMuted === "boolean" && selfPlayer.isMuted !== isSelfMuted) {
              setSelfMuted(selfPlayer.isMuted || (selfPlayer.microphoneVolume ?? 100) === 0);
            }

            if (typeof selfPlayer.isDeafen === "boolean" && selfPlayer.isDeafen !== isSelfDeafened) {
              setSelfDeafened(selfPlayer.isDeafen);
            }
          }

          if (errorMessage?.includes("Esperando coordenadas de Minecraft")) {
            const normalizedSelfName = session?.name.trim().toLowerCase() ?? "";
            const hasSelfPosition = worldState.players.some((player) => player.name.trim().toLowerCase() === normalizedSelfName);
            if (hasSelfPosition) {
              clearError();
            }
          }
        }
      } catch {
        // Ignore transient polling errors to avoid spamming user-facing alerts.
      } finally {
        polling = false;
      }
    };

    void pollMinecraft();
    const timer = window.setInterval(() => {
      void pollMinecraft();
    }, MINECRAFT_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session, firebaseBaseUri, currentRoom, applyMinecraftWorldState, errorMessage, clearError, isSelfMuted, isSelfDeafened, setPeerVolume, setSelfMuted, setSelfDeafened]);

  useEffect(() => {
    if (!session || !currentRoom) {
      return;
    }

    let cancelled = false;

    const syncNow = async (): Promise<void> => {
      try {
        await syncFirebaseVoiceState({
          roomName: currentRoom.name,
          firebaseBaseUri,
          users: currentRoom.users.map((user) => ({
            id: user.id,
            name: user.name,
            speaking: user.speaking,
            muted: user.muted,
            deafened: deafenedUsers[user.id] ?? false
          }))
        });
      } catch (err) {
        if (!cancelled) {
          console.warn("[EnviroVoice] Firebase sync failed", err);
        }
      }
    };

    void syncNow();
    const timer = window.setInterval(() => {
      void syncNow();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session, currentRoom, deafenedUsers, firebaseBaseUri]);

  return (
    <MainLayout>
      {errorMessage && (
        <div className="error-banner" onClick={clearError} role="button" tabIndex={0}>
          {errorMessage}
        </div>
      )}

      {!session && <LoginPage onLogin={handleLogin} />}

      {session && currentRoom && (
        <RoomPage
          room={currentRoom}
          userId={session.id}
          voiceStatus={voiceStatus}
          minecraftRoomUrl={minecraftRoomUrl}
          minecraftPlayers={minecraftPlayers}
          minecraftMaxDistance={minecraftMaxDistance}
          localMicLevel={localMicLevel}
          availableMicrophones={availableMicrophones}
          selectedMicrophoneId={selectedMicrophoneId}
          selfMuted={isSelfMuted}
          selfDeafened={isSelfDeafened}
          deafenedUsers={deafenedUsers}
          peerVolumes={peerVolumes}
          onRefreshMicrophones={refreshMicrophones}
          onSetMicrophone={setMicrophone}
          onSetPeerVolume={setPeerVolume}
          onStartVoice={startVoice}
          onToggleSelfMute={() => setSelfMuted(!isSelfMuted)}
          onToggleSelfDeafen={() => setSelfDeafened(!isSelfDeafened)}
          onToggleUserDeafen={toggleUserDeafen}
          onLeave={logout}
        />
      )}

      {session && !currentRoom && <div className="loading-room">Entrando a la sala...</div>}

      {session && currentRoom && voiceStatus === "requesting" && <div className="loading-room">Solicitando acceso al microfono...</div>}
    </MainLayout>
  );
};
