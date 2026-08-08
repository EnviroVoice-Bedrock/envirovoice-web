import { useEffect } from "react";
import { MainLayout } from "../layouts/MainLayout";
import { LoginPage } from "../pages/LoginPage";
import { RoomPage } from "../pages/RoomPage";
import { useAppStore } from "../stores/useAppStore";

export const App = () => {
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
    leaveRoom,
    setSelfMuted,
    setSelfDeafened,
    toggleUserDeafen,
    logout,
    clearError
  } = useAppStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!session || currentRoom) {
      return;
    }

    void connectToRoomByName("minecraft-global");
  }, [session, currentRoom, connectToRoomByName]);

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

      {!session && <LoginPage onLogin={setSession} />}

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
          onRefreshMicrophones={refreshMicrophones}
          onSetMicrophone={setMicrophone}
          onSetMicSensitivity={setMicSensitivity}
          onSetMonitorSelfVoice={setMonitorSelfVoice}
          onStartVoice={startVoice}
          onSetVoiceMode={setVoiceMode}
          onToggleSelfMute={() => setSelfMuted(!isSelfMuted)}
          onToggleSelfDeafen={() => setSelfDeafened(!isSelfDeafened)}
          onToggleUserDeafen={toggleUserDeafen}
          onLeave={leaveRoom}
          onLogout={() => void logout()}
        />
      )}

      {session && !currentRoom && <div className="loading-room">Entrando a la sala...</div>}

      {session && currentRoom && voiceStatus === "requesting" && <div className="loading-room">Solicitando acceso al microfono...</div>}
    </MainLayout>
  );
};
