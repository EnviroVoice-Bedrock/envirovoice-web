import { ParticipantList } from "../components/ParticipantList";
import type { Room } from "../types/room";

type Props = {
  room: Room;
  userId: string;
  voiceStatus: "idle" | "requesting" | "ready" | "denied" | "unavailable" | "failed";
  localMicLevel: number;
  micSensitivity: number;
  monitorSelfVoice: boolean;
  availableMicrophones: Array<{ id: string; label: string }>;
  selectedMicrophoneId: string | null;
  selfMuted: boolean;
  selfDeafened: boolean;
  deafenedUsers: Record<string, boolean>;
  onRefreshMicrophones: () => Promise<void>;
  onSetMicrophone: (deviceId: string | null) => Promise<void>;
  onSetMicSensitivity: (value: number) => void;
  onSetMonitorSelfVoice: (enabled: boolean) => void;
  onStartVoice: () => Promise<void>;
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
  voiceStatus,
  localMicLevel,
  micSensitivity,
  monitorSelfVoice,
  availableMicrophones,
  selectedMicrophoneId,
  selfMuted,
  selfDeafened,
  deafenedUsers,
  onRefreshMicrophones,
  onSetMicrophone,
  onSetMicSensitivity,
  onSetMonitorSelfVoice,
  onStartVoice,
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

        <section className="voice-settings" aria-label="Ajustes de voz">
          <div className="voice-settings-head">
            <h2>Ajustes de voz</h2>
            <span className={`voice-status voice-status-${voiceStatus}`}>{micStatusText}</span>
          </div>

          <div className="voice-controls-grid">
            <label htmlFor="microphone-select">Microfono</label>
            <div className="voice-inline-row">
              <select
                id="microphone-select"
                value={selectedMicrophoneId ?? ""}
                onChange={(event) => void onSetMicrophone(event.target.value || null)}
              >
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

            <label htmlFor="sensitivity-range">Sensibilidad de voz: {micSensitivity}%</label>
            <input
              id="sensitivity-range"
              type="range"
              min={1}
              max={100}
              value={micSensitivity}
              onChange={(event) => onSetMicSensitivity(Number(event.target.value))}
            />

            <label htmlFor="self-monitor" className="checkbox-row">
              <input
                id="self-monitor"
                type="checkbox"
                checked={monitorSelfVoice}
                onChange={(event) => onSetMonitorSelfVoice(event.target.checked)}
              />
              Escuchar mi propia voz (prueba local)
            </label>

            <div>
              <small>Nivel de entrada</small>
              <div className="mic-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(localMicLevel * 100)}>
                <div className="mic-meter-fill" style={{ width: `${Math.max(4, Math.round(localMicLevel * 100))}%` }} />
              </div>
            </div>

            <button type="button" className="button-secondary" onClick={() => void onStartVoice()}>
              {voiceStatus === "ready" ? "Reiniciar voz" : "Activar voz"}
            </button>
          </div>

          <p className="panel-note">
            Puedes probar sin Minecraft abriendo esta web en dos pestañas con usuarios distintos en la misma sala.
          </p>
        </section>

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
