import { useEffect, useState } from "react";
import { ParticipantList } from "../components/ParticipantList";
import { RoomList } from "../components/RoomList";
import type { Room } from "../types/room";
import type { ConnectionStatus } from "../types/signaling";

type Props = {
  userId: string;
  userName: string;
  status: ConnectionStatus;
  rooms: Room[];
  currentRoom: Room | null;
  selfMuted: boolean;
  selfDeafened: boolean;
  deafenedUsers: Record<string, boolean>;
  peerVolumes?: Record<string, number>;
  onRefresh: () => Promise<void>;
  onCreateRoom: (name: string) => Promise<void>;
  onJoinRoom: (roomId: string) => Promise<void>;
  onLeaveRoom: () => Promise<void>;
  onToggleSelfMute: () => void;
  onToggleSelfDeafen: () => void;
  onToggleUserDeafen: (userId: string) => void;
  onSetPeerVolume?: (userId: string, volume: number) => void;
  onLogout: () => void;
};

const getAvatarUrl = (playerName: string): string =>
  `https://mc-api.io/render/face/${encodeURIComponent(playerName.trim() || "WprousG")}/bedrock?size=256`;

const statusTag = (status: ConnectionStatus): string => {
  if (status === "connected") {
    return "online";
  }

  if (status === "connecting" || status === "reconnecting") {
    return "connecting";
  }

  return "offline";
};

export const DashboardPage = ({
  userId,
  userName,
  status,
  rooms,
  currentRoom,
  selfMuted,
  selfDeafened,
  deafenedUsers,
  peerVolumes,
  onRefresh,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onToggleSelfMute,
  onToggleSelfDeafen,
  onToggleUserDeafen,
  onSetPeerVolume,
  onLogout
}: Props) => {
  const [newRoomName, setNewRoomName] = useState("minecraft-global");

  useEffect(() => {
    void onRefresh();
  }, [onRefresh]);

  const connectToRoom = async () => {
    const targetName = newRoomName.trim();
    if (!targetName) {
      return;
    }

    const existingRoom = rooms.find((room) => room.name.toLowerCase() === targetName.toLowerCase());

    if (existingRoom) {
      await onJoinRoom(existingRoom.id);
      return;
    }

    await onCreateRoom(targetName);
  };

  const logLines = [
    `Estado de conexion: ${status}`,
    `Salas disponibles: ${rooms.length}`,
    currentRoom ? `Sala activa: ${currentRoom.name}` : "Esperando datos..."
  ];

  return (
    <section className="voice-panel-shell">
      <article className="voice-header card-outline">
        <small className="section-kicker">ENVIROVOICE</small>
        <div className="voice-title-row">
          <img className="brand-mic" src={getAvatarUrl(userName)} alt={`Avatar de ${userName}`} />
          <h2>Voice Panel</h2>
        </div>
        <p>Panel de estado en tiempo real para la sesion actual.</p>

        <div className="chip-row">
          <span className="chip">Servidor: configurado</span>
          <span className="chip chip-user">
            <img src={getAvatarUrl(userName)} alt={`Avatar de ${userName}`} />
            {userName}
          </span>
          <span className="chip">Canal: {newRoomName || "sin definir"}</span>
          <span className={`chip chip-status chip-${statusTag(status)}`}>Estado: {statusTag(status)}</span>
        </div>
      </article>

      <article className="voice-actions card-outline">
        <button type="button" className="button-primary button-large" onClick={() => void connectToRoom()}>
          Conectar
        </button>
        <button type="button" className="button-secondary button-large" onClick={() => void onLeaveRoom()} disabled={!currentRoom}>
          Desconectar
        </button>
        <button type="button" className="button-secondary button-large" onClick={() => void onRefresh()}>
          Actualizar
        </button>
        <button type="button" className="button-secondary button-large" onClick={onLogout}>
          Volver
        </button>
      </article>

      <article className="voice-console card-outline">
        <div className="panel-header compact">
          <h3>CONSOLA EN VIVO</h3>
          <span className="panel-muted">🎙️ {selfMuted ? "muted" : "live"} | 🔇 {selfDeafened ? "deafened" : "monitor"}</span>
        </div>
        <div className="console-box">
          {logLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </article>

      <article className="panel panel-dashboard">
        <div className="panel-header compact">
          <h3>SALA CONFIGURADA</h3>
          <span className="panel-muted">{currentRoom ? `${currentRoom.users.length} usuarios` : "sin conexion"}</span>
        </div>

        <form
          className="create-room"
          onSubmit={(event) => {
            event.preventDefault();
            void connectToRoom();
          }}
        >
          <input
            value={newRoomName}
            onChange={(event) => setNewRoomName(event.target.value)}
            placeholder="minecraft-global"
            autoComplete="off"
          />
          <button type="submit" className="button-secondary">
            Conectar a sala
          </button>
        </form>

        {currentRoom ? (
          <>
            <ParticipantList
              users={currentRoom.users}
              currentUserId={userId}
              minecraftPlayers={[]}
              minecraftEffects={{
                caveSound: false,
                underwaterSound: false,
                mountainSound: false,
                buriedSound: false
              }}
              deafenedUsers={deafenedUsers}
              peerVolumes={peerVolumes ?? {}}
              onToggleDeafen={onToggleUserDeafen}
              onSetVolume={onSetPeerVolume ?? (() => undefined)}
            />

            <footer className="room-controls">
              <button type="button" className={`button-secondary ${selfMuted ? "button-warn" : ""}`} onClick={onToggleSelfMute}>
                {selfMuted ? "Activar microfono" : "Mutear microfono"}
              </button>
              <button type="button" className={`button-secondary ${selfDeafened ? "button-warn" : ""}`} onClick={onToggleSelfDeafen}>
                {selfDeafened ? "Escuchar usuarios" : "Ensordecer"}
              </button>
            </footer>
          </>
        ) : (
          <RoomList rooms={rooms} onJoin={(roomId) => void onJoinRoom(roomId)} />
        )}
      </article>
    </section>
  );
};
