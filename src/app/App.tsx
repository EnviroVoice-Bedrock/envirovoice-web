import { useEffect, useState } from "react";
import { MainLayout } from "../layouts/MainLayout";
import { LoginPage } from "../pages/LoginPage";
import { RoomPage } from "../pages/RoomPage";
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
    voiceMode,
    voiceStatus,
    localMicLevel,
    micSensitivity,
    monitorSelfVoice,
    availableMicrophones,
    selectedMicrophoneId,
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
    setMicrophone,
    setMicSensitivity,
    setMonitorSelfVoice,
    setPeerVolume,
    leaveRoom,
    setSelfMuted,
    setSelfDeafened,
    toggleUserDeafen,
    clearError
  } = useAppStore();

  const handleLogin = (name: string, serverUrl: string): void => {
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
    if (!session || !currentRoom || ["ready", "requesting", "denied", "unavailable", "failed"].includes(voiceStatus)) {
      return;
    }

    void startVoice();
  }, [session, currentRoom, voiceStatus, startVoice]);

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
          selfMuted={isSelfMuted}
          selfDeafened={isSelfDeafened}
          deafenedUsers={deafenedUsers}
          peerVolumes={peerVolumes}
          onRefreshMicrophones={refreshMicrophones}
          onSetMicrophone={setMicrophone}
          onSetMicSensitivity={setMicSensitivity}
          onSetMonitorSelfVoice={setMonitorSelfVoice}
          onSetPeerVolume={setPeerVolume}
          onStartVoice={startVoice}
          onSetVoiceMode={setVoiceMode}
          onToggleSelfMute={() => setSelfMuted(!isSelfMuted)}
          onToggleSelfDeafen={() => setSelfDeafened(!isSelfDeafened)}
          onToggleUserDeafen={toggleUserDeafen}
          onLeave={leaveRoom}
        />
      )}

      {session && !currentRoom && <div className="loading-room">Entrando a la sala...</div>}

      {session && currentRoom && voiceStatus === "requesting" && <div className="loading-room">Solicitando acceso al microfono...</div>}
    </MainLayout>
  );
};
