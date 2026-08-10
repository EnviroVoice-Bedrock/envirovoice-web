import { ParticipantList } from "../components/ParticipantList";
import type { Room } from "../types/room";
import envirovoiceLogo from "../../assets/Envirovoice Logo.png";
import muteIcon from "../../assets/mute.png";
import unmuteIcon from "../../assets/unmute.png";
import { useState } from "react";

type Props = {
  room: Room;
  userId: string;
  minecraftRoomUrl: string;
  minecraftPlayers: Array<{ name: string; x: number; y: number; z: number; dimension: string }>;
  minecraftMaxDistance: number;
  voiceStatus: "idle" | "requesting" | "ready" | "denied" | "unavailable" | "failed";
  localMicLevel: number;
  availableMicrophones: Array<{ id: string; label: string }>;
  selectedMicrophoneId: string | null;
  selfMuted: boolean;
  selfDeafened: boolean;
  deafenedUsers: Record<string, boolean>;
  peerVolumes: Record<string, number>;
  onRefreshMicrophones: () => Promise<void>;
  onSetMicrophone: (deviceId: string | null) => Promise<void>;
  onSetPeerVolume: (userId: string, volume: number) => void;
  onStartVoice: () => Promise<void>;
  onToggleSelfMute: () => void;
  onToggleSelfDeafen: () => void;
  onToggleUserDeafen: (userId: string) => void;
  onLeave: () => Promise<void>;
};

const getDistance = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number => {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const dz = z1 - z2;
  return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
};

const hasMinecraftPosition = (user: Room["users"][number]): boolean => {
  const p = user.position;
  return !(p.x === 0 && p.y === 0 && p.z === 0 && p.dimension === "overworld");
};

const formatCoordinates = (user: Room["users"][number]): string =>
  `${user.position.x.toFixed(1)}, ${user.position.y.toFixed(1)}, ${user.position.z.toFixed(1)}`;

export const RoomPage = ({
  room,
  userId,
  minecraftRoomUrl,
  minecraftPlayers,
  minecraftMaxDistance,
  voiceStatus,
  localMicLevel,
  availableMicrophones,
  selectedMicrophoneId,
  selfMuted,
  selfDeafened,
  deafenedUsers,
  peerVolumes,
  onRefreshMicrophones,
  onSetMicrophone,
  onSetPeerVolume,
  onStartVoice,
  onToggleSelfMute,
  onToggleSelfDeafen,
  onToggleUserDeafen,
  onLeave
}: Props) => {
  const [showVoiceSettings, setShowVoiceSettings] = useState(true);
  const safeMaxDistance = Math.max(1, Math.min(300, minecraftMaxDistance));
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

  const usersWithDistance = nearbyUsers.map((user) => {
    if (!selfUser || !hasMinecraftPosition(selfUser) || !hasMinecraftPosition(user)) {
      return { user, distance: null as number | null, isNear: false, sameDimension: false };
    }

    const sameDimension = selfUser.position.dimension === user.position.dimension;
    const distance = getDistance(selfUser.position.x, selfUser.position.y, selfUser.position.z, user.position.x, user.position.y, user.position.z);
    const isNear = sameDimension && distance <= safeMaxDistance;

    return { user, distance, isNear, sameDimension };
  });

  const closeUsers = usersWithDistance.filter((item) => item.isNear);
  const farUsers = usersWithDistance.filter((item) => !item.isNear);

  const visibleUsers = selfUser ? [selfUser, ...closeUsers.map((item) => item.user)] : room.users;
  const roomUrlLabel = minecraftRoomUrl.trim() || "Esperando roomUrl de Minecraft";
  const selfCoordinates = selfUser && hasMinecraftPosition(selfUser) ? formatCoordinates(selfUser) : "Sin coordenadas";
  const micStatusText =
    voiceStatus === "ready"
      ? "Voz activa"
      : voiceStatus === "requesting"
        ? "Solicitando acceso al microfono..."
        : voiceStatus === "denied"
          ? "Permiso de microfono denegado"
          : voiceStatus === "unavailable"
            ? "No hay microfono disponible"
            : voiceStatus === "failed"
              ? "Error al iniciar voz"
              : "Voz inactiva";

  return (
    <section className="room-console-shell">
      <header className="room-topbar">
        <img className="room-topbar-logo" src={envirovoiceLogo} alt="EnviroVoice" />
        <div className="room-topbar-actions">
          <button type="button" className="button-secondary room-settings-button" onClick={() => setShowVoiceSettings((value) => !value)}>
            {showVoiceSettings ? "Ocultar ajustes" : "Ajustes de voz"}
          </button>
          <button type="button" className="room-disconnect" onClick={() => void onLeave()}>
            Disconnect
          </button>
        </div>
      </header>

      <main className="room-stage">
        <section className="nearby-users-panel" aria-label="Jugadores cerca">
          <div className="nearby-users-head">
            <h2>Jugadores cerca ({safeMaxDistance} bloques)</h2>
            <span>{closeUsers.length}</span>
          </div>

          {closeUsers.length === 0 && <p className="panel-note">No hay jugadores dentro de {safeMaxDistance} bloques.</p>}

          {closeUsers.length > 0 && (
            <ul className="nearby-users-list">
              {closeUsers.map(({ user, distance }) => (
                <li key={`near-${user.id}`}>
                  <div className="nearby-user-meta">
                    <strong>{user.name}</strong>
                    <small>{formatCoordinates(user)}</small>
                  </div>
                  <span>{distance ?? "--"} bloques</span>
                </li>
              ))}
            </ul>
          )}

          {farUsers.length > 0 && (
            <details className="nearby-users-far">
              <summary>Fuera de rango o dimension distinta ({farUsers.length})</summary>
              <ul className="nearby-users-list nearby-users-list-far">
                {farUsers.map(({ user, distance, sameDimension }) => (
                  <li key={`far-${user.id}`}>
                    <div className="nearby-user-meta">
                      <strong>{user.name}</strong>
                      <small>{formatCoordinates(user)}</small>
                    </div>
                    <span>{sameDimension ? `${distance ?? "--"} bloques` : "Dimension distinta"}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {visibleUsers.length ? (
          <ParticipantList
            users={visibleUsers}
            currentUserId={userId}
            minecraftPlayers={minecraftPlayers}
            deafenedUsers={deafenedUsers}
            peerVolumes={peerVolumes}
            onToggleDeafen={onToggleUserDeafen}
            onSetVolume={onSetPeerVolume}
          />
        ) : (
          <p className="panel-note">Todavia no hay otros jugadores cerca.</p>
        )}
      </main>

      {showVoiceSettings && (
        <aside className="room-settings-popover" aria-label="Ajustes de voz">
          <div className="voice-settings-head">
            <h2>Ajustes de voz</h2>
            <div className="voice-settings-head-actions">
              <span className={`voice-status voice-status-${voiceStatus}`}>{micStatusText}</span>
              <button type="button" className="button-secondary room-settings-close" onClick={() => setShowVoiceSettings(false)}>
                Cerrar
              </button>
            </div>
          </div>

          <div className="voice-controls-grid">
            <label htmlFor="microphone-select">Microfono</label>
            <div className="voice-inline-row">
              <select id="microphone-select" value={selectedMicrophoneId ?? ""} onChange={(event) => void onSetMicrophone(event.target.value || null)}>
                {availableMicrophones.length === 0 && <option value="">Sin microfonos detectados</option>}
                {availableMicrophones.map((mic) => (
                  <option key={mic.id} value={mic.id}>
                    {mic.label}
                  </option>
                ))}
              </select>
              <button type="button" className="button-secondary" onClick={() => void onRefreshMicrophones()}>
                Actualizar
              </button>
            </div>

            <div>
              <small>Nivel de entrada</small>
              <div className="mic-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(localMicLevel * 100)}>
                <div className="mic-meter-fill" style={{ width: `${Math.max(4, Math.round(localMicLevel * 100))}%` }} />
              </div>
            </div>

            <button type="button" className="button-secondary" onClick={() => void onStartVoice()}>
              {voiceStatus === "ready" ? "Reiniciar voz" : "Activar voz"}
            </button>

            <section className="admin-panel" aria-label="Panel admin">
              <small className="section-kicker">ESTADO DE MINECRAFT</small>
              <p>Sala activa: {roomUrlLabel}</p>
              <p>Rango de voz: {safeMaxDistance} bloques</p>
              <p>Tu posicion: {selfCoordinates}</p>
              <ul>
                {visibleUsers.map((user) => (
                  <li key={`talk-${user.id}`}>
                    {user.name}: {formatCoordinates(user)} isTalking={user.speaking ? "true" : "false"}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </aside>
      )}

      <footer className="room-bottom-dock">
        <div className="dock-block dock-input">
          <small>INPUT DEVICE</small>
          <div className="dock-select-row">
            <button type="button" className={`button-secondary ${selfMuted ? "button-warn" : ""}`} onClick={onToggleSelfMute}>
              <span className="button-with-icon">
                <img className="control-icon" src={selfMuted ? unmuteIcon : muteIcon} alt="Mic state" />
              </span>
            </button>
            <select value={selectedMicrophoneId ?? ""} onChange={(event) => void onSetMicrophone(event.target.value || null)}>
              {availableMicrophones.length === 0 && <option value="">Sin microfonos detectados</option>}
              {availableMicrophones.map((mic) => (
                <option key={mic.id} value={mic.id}>
                  {mic.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="dock-block dock-actions">
          <button type="button" className={`button-secondary ${selfDeafened ? "button-warn" : ""}`} onClick={onToggleSelfDeafen}>
            {selfDeafened ? "Escuchar" : "Ensordecer"}
          </button>
        </div>
      </footer>
    </section>
  );
};
