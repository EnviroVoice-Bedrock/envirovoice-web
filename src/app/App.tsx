import { useEffect, useState } from "react";
import { MainLayout } from "../layouts/MainLayout";
import { LoginPage } from "../pages/LoginPage";
import { RoomPage } from "../pages/RoomPage";
import { syncFirebaseVoiceState } from "../services/api/firebaseVoiceSync";
import { useAppStore } from "../stores/useAppStore";

const DEFAULT_ROOM = "minecraft-global";

const deriveRoomFromServerUrl = (input: string): string => {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return DEFAULT_ROOM;
  }

  try {
    const value = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(value);
    const host = url.hostname.replace(/\./g, "-");
    const path = url.pathname.replace(/^\/+/, "").replace(/\//g, "-");
    const combined = [host, path].filter(Boolean).join("-");
    const normalized = combined
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    return normalized || DEFAULT_ROOM;
  } catch {
    const normalized = trimmed
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    return normalized || DEFAULT_ROOM;
  }
};

export const App = () => {
  const [targetRoomName, setTargetRoomName] = useState(DEFAULT_ROOM);

  const {
    session,
    currentRoom,
    connectionStatus,
    peerStates,
    voiceMode,
    voiceStatus,
    localMicLevel,
    micSensitivity,
    monitorSelfVoice,
    availableMicrophones,
    selectedMicrophoneId,
    availableOutputDevices,
    selectedOutputDeviceId,
    debugPeerInfo,
    debugLastPlaybackError,
    debugLastOutputDeviceError,
    isSelfMuted,
    isSelfDeafened,
    deafenedUsers,
    peerVolumes,
    errorMessage,
    setSession,
    setVoiceMode,
    initialize,
    connectToRoomByName,
    startVoice,
    refreshMicrophones,
    refreshDiagnostics,
    setMicrophone,
    setOutputDevice,
    setMicSensitivity,
    setMonitorSelfVoice,
    setPeerVolume,
    setSelfMuted,
    setSelfDeafened,
    toggleUserDeafen,
    logout,
    resetForTesting,
    clearError
  } = useAppStore();

  const handleLogin = async (name: string, serverUrl: string): Promise<void> => {
    const isResetCommand = name.trim().toLowerCase() === "!reset" || serverUrl.trim().toLowerCase() === "!reset";
    if (isResetCommand) {
      await resetForTesting();
      return;
    }

    setTargetRoomName(deriveRoomFromServerUrl(serverUrl));
    setSession(name);
  };

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!session || currentRoom) {
      return;
    }

    void connectToRoomByName(targetRoomName);
  }, [session, currentRoom, targetRoomName, connectToRoomByName]);

  useEffect(() => {
    if (!session || !currentRoom) {
      return;
    }

    let cancelled = false;

    const syncNow = async (): Promise<void> => {
      try {
        await syncFirebaseVoiceState({
          roomName: currentRoom.name,
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
  }, [session, currentRoom, deafenedUsers]);

  useEffect(() => {
    if (!session || !currentRoom) {
      return;
    }

    refreshDiagnostics();
    const timer = window.setInterval(() => {
      refreshDiagnostics();
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [session, currentRoom, refreshDiagnostics]);

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
          voiceMode={voiceMode}
          voiceStatus={voiceStatus}
          localMicLevel={localMicLevel}
          micSensitivity={micSensitivity}
          monitorSelfVoice={monitorSelfVoice}
          availableMicrophones={availableMicrophones}
          selectedMicrophoneId={selectedMicrophoneId}
          availableOutputDevices={availableOutputDevices}
          selectedOutputDeviceId={selectedOutputDeviceId}
          connectionStatus={connectionStatus}
          peerStates={peerStates}
          debugPeerInfo={debugPeerInfo}
          debugLastPlaybackError={debugLastPlaybackError}
          debugLastOutputDeviceError={debugLastOutputDeviceError}
          selfMuted={isSelfMuted}
          selfDeafened={isSelfDeafened}
          deafenedUsers={deafenedUsers}
          peerVolumes={peerVolumes}
          onRefreshMicrophones={refreshMicrophones}
          onSetMicrophone={setMicrophone}
          onSetOutputDevice={setOutputDevice}
          onSetMicSensitivity={setMicSensitivity}
          onSetMonitorSelfVoice={setMonitorSelfVoice}
          onSetPeerVolume={setPeerVolume}
          onStartVoice={startVoice}
          onSetVoiceMode={setVoiceMode}
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
