import { ParticipantList } from "../components/ParticipantList";
import type { Room } from "../types/room";
import envirovoiceLogo from "../../assets/Envirovoice Logo.png";
import muteIcon from "../../assets/mute.png";
import unmuteIcon from "../../assets/unmute.png";

type Props = {
  room: Room;
  userId: string;
  voiceMode: "call" | "minecraft";
  voiceStatus: "idle" | "requesting" | "ready" | "denied" | "unavailable" | "failed";
  localMicLevel: number;
  micSensitivity: number;
  monitorSelfVoice: boolean;
  availableMicrophones: Array<{ id: string; label: string }>;
  selectedMicrophoneId: string | null;
  selfMuted: boolean;
  selfDeafened: boolean;
  deafenedUsers: Record<string, boolean>;
  peerVolumes: Record<string, number>;
  onRefreshMicrophones: () => Promise<void>;
  onSetMicrophone: (deviceId: string | null) => Promise<void>;
  onSetMicSensitivity: (value: number) => void;
  onSetMonitorSelfVoice: (enabled: boolean) => void;
  onSetPeerVolume: (userId: string, volume: number) => void;
  onStartVoice: () => Promise<void>;
  onSetVoiceMode: (mode: "call" | "minecraft") => void;
  onToggleSelfMute: () => void;
  onToggleSelfDeafen: () => void;
  onToggleUserDeafen: (userId: string) => void;
  onLeave: () => Promise<void>;
  onLogout: () => void;
};

const getDistance = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number => {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const dz = z1 - z2;
  return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
};

export const RoomPage = ({
  room,
  userId,
  voiceMode,
  voiceStatus,
  localMicLevel,
  micSensitivity,
  monitorSelfVoice,
  availableMicrophones,
  selectedMicrophoneId,
  selfMuted,
  selfDeafened,
  deafenedUsers,
  peerVolumes,
  onRefreshMicrophones,
  onSetMicrophone,
  onSetMicSensitivity,
  onSetMonitorSelfVoice,
  onSetPeerVolume,
  onStartVoice,
  onSetVoiceMode,
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

  const visibleUsers = selfUser ? [selfUser, ...nearbyUsers] : room.users;

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
        <button type="button" className="room-disconnect" onClick={() => void onLeave()}>
          Disconnect
        </button>
      </header>

      <main className="room-stage">
        {visibleUsers.length ? (
          <ParticipantList
            users={visibleUsers}
            currentUserId={userId}
            deafenedUsers={deafenedUsers}
            peerVolumes={peerVolumes}
            onToggleDeafen={onToggleUserDeafen}
            onSetVolume={onSetPeerVolume}
          />
        ) : (
          <p className="panel-note">Todavia no hay otros jugadores cerca.</p>
        )}
      </main>

      <aside className="room-settings-popover" aria-label="Ajustes de voz">
        <div className="voice-settings-head">
          <h2>Ajustes de voz</h2>
          <span className={`voice-status voice-status-${voiceStatus}`}>{micStatusText}</span>
        </div>

        <div className="voice-mode-toggle" role="group" aria-label="Modo de voz">
          <button type="button" className={`button-secondary ${voiceMode === "call" ? "mode-active" : ""}`} onClick={() => onSetVoiceMode("call")}>
            Modo llamada
          </button>
          <button
            type="button"
            className={`button-secondary ${voiceMode === "minecraft" ? "mode-active" : ""}`}
            onClick={() => onSetVoiceMode("minecraft")}
          >
            Modo Minecraft
          </button>
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

          <label htmlFor="sensitivity-range">Sensibilidad: {micSensitivity}%</label>
          <input
            id="sensitivity-range"
            type="range"
            min={1}
            max={100}
            value={micSensitivity}
            onChange={(event) => onSetMicSensitivity(Number(event.target.value))}
          />

          <label htmlFor="self-monitor" className="checkbox-row">
            <input id="self-monitor" type="checkbox" checked={monitorSelfVoice} onChange={(event) => onSetMonitorSelfVoice(event.target.checked)} />
            Monitor local
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
      </aside>

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

        <button type="button" className="dock-status-button" onClick={() => void onStartVoice()}>
          {voiceStatus === "ready" ? "VOICE ACTIVATED" : "ACTIVATE VOICE"}
        </button>

        <div className="dock-block dock-actions">
          <small>PUSH TO TALK</small>
          <button type="button" className={`button-secondary ${selfDeafened ? "button-warn" : ""}`} onClick={onToggleSelfDeafen}>
            {selfDeafened ? "Off" : "On"}
          </button>
          <button type="button" className="button-secondary" onClick={onLogout}>
            Logout
          </button>
        </div>
      </footer>
    </section>
  );
};
