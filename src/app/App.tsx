import { useEffect } from "react";
import { MainLayout } from "../layouts/MainLayout";
import { LoginPage } from "../pages/LoginPage";
import { RoomPage } from "../pages/RoomPage";
import { useAppStore } from "../stores/useAppStore";

export const App = () => {
  const {
    session,
    currentRoom,
    voiceStatus,
    isSelfMuted,
    isSelfDeafened,
    deafenedUsers,
    errorMessage,
    setSession,
    initialize,
    connectToRoomByName,
    startVoice,
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
          selfMuted={isSelfMuted}
          selfDeafened={isSelfDeafened}
          deafenedUsers={deafenedUsers}
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
