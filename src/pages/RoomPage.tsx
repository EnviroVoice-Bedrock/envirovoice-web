import { ParticipantList } from "../components/ParticipantList";
import type { Room } from "../types/room";

type Props = {
  room: Room;
  userId: string;
  selfMuted: boolean;
  selfDeafened: boolean;
  deafenedUsers: Record<string, boolean>;
  onToggleSelfMute: () => void;
  onToggleSelfDeafen: () => void;
  onToggleUserDeafen: (userId: string) => void;
  onLeave: () => Promise<void>;
  onLogout: () => void;
};

const getAvatarUrl = (playerName: string): string =>
  `https://mc-api.io/render/face/${encodeURIComponent(playerName.trim() || "WprousG")}/bedrock?size=256`;

const getDistance = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number => {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const dz = z1 - z2;
  return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
};

export const RoomPage = ({
  room,
  userId,
  selfMuted,
  selfDeafened,
  deafenedUsers,
  onToggleSelfMute,
  onToggleSelfDeafen,
  onToggleUserDeafen,
  onLeave,
  onLogout
}: Props) => {
  const selfUser = room.users.find((user) => user.id === userId);
  const nearbyUsers = room.users
    .filter((user) => user.id !== userId)
    .sort((a, b) => {
      if (!selfUser) {
        return a.name.localeCompare(b.name);
      }

      const distanceA = getDistance(selfUser.position.x, selfUser.position.y, selfUser.position.z, a.position.x, a.position.y, a.position.z);
      const distanceB = getDistance(selfUser.position.x, selfUser.position.y, selfUser.position.z, b.position.x, b.position.y, b.position.z);
      return distanceA - distanceB;
    });

  return (
    <section className="room-shell">
      <article className="room-card">
        <small className="section-kicker">SALA ACTIVA</small>
        <h1>{room.name}</h1>
        <p>
          {room.users.length} / {room.maxUsers} jugadores conectados
        </p>

        {selfUser && (
          <div className="self-user-card">
            <img src={getAvatarUrl(selfUser.name)} alt={`Avatar de ${selfUser.name}`} />
            <div>
              <small>TU PERFIL</small>
              <strong>{selfUser.name}</strong>
            </div>
          </div>
        )}

        <div className="self-controls">
          <button type="button" className={`button-secondary ${selfMuted ? "button-warn" : ""}`} onClick={onToggleSelfMute}>
            {selfMuted ? "🎙️ Activar microfono" : "🎙️ Silenciar microfono"}
          </button>
          <button type="button" className={`button-secondary ${selfDeafened ? "button-warn" : ""}`} onClick={onToggleSelfDeafen}>
            {selfDeafened ? "🔊 Escuchar jugadores" : "🔇 Ensordecer"}
          </button>
        </div>

        <div className="nearby-header">
          <h2>Jugadores cerca</h2>
          <span>{nearbyUsers.length}</span>
        </div>

        {nearbyUsers.length ? (
          <ParticipantList users={nearbyUsers} currentUserId={userId} deafenedUsers={deafenedUsers} onToggleDeafen={onToggleUserDeafen} />
        ) : (
          <p className="panel-note">Todavia no hay otros jugadores cerca.</p>
        )}

        <footer className="room-actions">
          <button type="button" className="button-secondary" onClick={() => void onLeave()}>
            Salir de sala
          </button>
          <button type="button" className="button-secondary" onClick={onLogout}>
            Cerrar sesion
          </button>
        </footer>
      </article>
    </section>
  );
};
