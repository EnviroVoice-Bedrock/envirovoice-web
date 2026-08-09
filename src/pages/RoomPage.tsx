import { ParticipantList } from "../components/ParticipantList";
import type { Room } from "../types/room";
import envirovoiceLogo from "../../assets/Envirovoice Logo.png";
import muteIcon from "../../assets/mute.png";
import unmuteIcon from "../../assets/unmute.png";
import { useState } from "react";

type Props = {
  room: Room;
  userId: string;
  connectionStatus: "connecting" | "connected" | "disconnected" | "reconnecting";
  voiceMode: "call" | "minecraft";
  voiceStatus: "idle" | "requesting" | "ready" | "denied" | "unavailable" | "failed";
  localMicLevel: number;
  micSensitivity: number;
  monitorSelfVoice: boolean;
  advancedNoiseSuppression: boolean;
  availableMicrophones: Array<{ id: string; label: string }>;
  selectedMicrophoneId: string | null;
  availableOutputDevices: Array<{ id: string; label: string }>;
  selectedOutputDeviceId: string | null;
  remoteTracksReceived: Record<string, boolean>;
  remotePlaybackBlocked: Record<string, boolean>;
  selfMuted: boolean;
  selfDeafened: boolean;
  deafenedUsers: Record<string, boolean>;
  peerVolumes: Record<string, number>;
  peerStates: Record<string, RTCPeerConnectionState>;
  onRefreshMicrophones: () => Promise<void>;
  onSetMicrophone: (deviceId: string | null) => Promise<void>;
  onSetOutputDevice: (deviceId: string | null) => Promise<void>;
  onSetMicSensitivity: (value: number) => void;
  onSetMonitorSelfVoice: (enabled: boolean) => void;
  onSetAdvancedNoiseSuppression: (enabled: boolean) => Promise<void>;
  onSetPeerVolume: (userId: string, volume: number) => void;
  onStartVoice: () => Promise<void>;
  onSetVoiceMode: (mode: "call" | "minecraft") => void;
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

export const RoomPage = ({
  room,
  userId,
  connectionStatus,
  voiceMode,
  voiceStatus,
  localMicLevel,
  micSensitivity,
  monitorSelfVoice,
  advancedNoiseSuppression,
  availableMicrophones,
  selectedMicrophoneId,
  availableOutputDevices,
  selectedOutputDeviceId,
  remoteTracksReceived,
  remotePlaybackBlocked,
  selfMuted,
  selfDeafened,
  deafenedUsers,
  peerVolumes,
  peerStates,
  onRefreshMicrophones,
  onSetMicrophone,
  onSetOutputDevice,
  onSetMicSensitivity,
  onSetMonitorSelfVoice,
  onSetAdvancedNoiseSuppression,
  onSetPeerVolume,
  onStartVoice,
  onSetVoiceMode,
  onToggleSelfMute,
  onToggleSelfDeafen,
  onToggleUserDeafen,
  onLeave
}: Props) => {
  const [showVoiceSettings, setShowVoiceSettings] = useState(true);
  const selfUser = room.users.find((user) => user.id === userId);
  const uniqueUsers = Array.from(new Map(room.users.map((user) => [user.id, user])).values());
  const nearbyUsers = uniqueUsers
    .filter((user) => user.id !== userId)
    .sort((a, b) => {
      if (!selfUser) {
        return a.name.localeCompare(b.name);
      }

      const distanceA = getDistance(selfUser.position.x, selfUser.position.y, selfUser.position.z, a.position.x, a.position.y, a.position.z);
      const distanceB = getDistance(selfUser.position.x, selfUser.position.y, selfUser.position.z, b.position.x, b.position.y, b.position.z);
      return distanceA - distanceB;
    });

  const visibleUsers = selfUser ? [selfUser, ...nearbyUsers] : uniqueUsers;
  const connectedPeerCount = Object.values(peerStates).filter((state) => state === "connected").length;
  const receivedTrackCount = Object.values(remoteTracksReceived).filter(Boolean).length;
  const blockedPlaybackCount = Object.values(remotePlaybackBlocked).filter(Boolean).length;
  const liveVoiceCount = visibleUsers.filter((user) => user.speaking && !user.muted).length;

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
        <section className="mini-status-panel" aria-label="Panel de diagnostico">
          <div className="mini-status-block mini-status-block-main">
            <span className="mini-status-label">Conexión</span>
            <strong className={`mini-status-pill mini-status-${connectionStatus}`}>{connectionStatus}</strong>
            <small className="mini-status-helper">WebSocket activo y sincronizando sala</small>
          </div>

          <div className="mini-status-block">
            <span className="mini-status-label">Voz</span>
            <strong className={`mini-status-pill mini-status-${voiceStatus}`}>{voiceStatus}</strong>
            <small className="mini-status-helper">Captura local y negociación WebRTC</small>
          </div>

          <div className="mini-status-block">
            <span className="mini-status-label">Track remoto</span>
            <strong className="mini-status-pill mini-status-ok">{receivedTrackCount}</strong>
            <small className="mini-status-helper">Señal de audio recibida</small>
          </div>

          <div className="mini-status-block">
            <span className="mini-status-label">Playback</span>
            <strong className={`mini-status-pill ${blockedPlaybackCount ? "mini-status-bad" : "mini-status-ok"}`}>{blockedPlaybackCount ? `${blockedPlaybackCount} bloqueado` : "listo"}</strong>
            <small className="mini-status-helper">Si está bloqueado, haz click en la ventana</small>
          </div>

          <div className="mini-status-block">
            <span className="mini-status-label">Hablando</span>
            <strong className="mini-status-pill mini-status-ok">{liveVoiceCount}</strong>
            <small className="mini-status-helper">Usuarios con voz activa</small>
          </div>

          <div className="mini-status-block">
            <span className="mini-status-label">Modo</span>
            <strong className="mini-status-pill mini-status-info">{voiceMode}</strong>
            <small className="mini-status-helper">Modo de mezcla activo</small>
          </div>

          <div className="mini-status-block">
            <span className="mini-status-label">Usuarios</span>
            <strong className="mini-status-pill mini-status-info">{visibleUsers.length}</strong>
            <small className="mini-status-helper">Participantes en pantalla</small>
          </div>

          <div className="mini-status-block">
            <span className="mini-status-label">Peers</span>
            <strong className="mini-status-pill mini-status-info">{connectedPeerCount}</strong>
            <small className="mini-status-helper">Conexiones WebRTC vivas</small>
          </div>

          <div className="mini-status-block">
            <span className="mini-status-label">Micro</span>
            <strong className="mini-status-pill mini-status-info">{Math.round(localMicLevel * 100)}%</strong>
            <small className="mini-status-helper">Nivel de entrada actual</small>
          </div>
        </section>

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

            <label htmlFor="output-select">Salida de audio</label>
            <select id="output-select" value={selectedOutputDeviceId ?? ""} onChange={(event) => void onSetOutputDevice(event.target.value || null)}>
              {availableOutputDevices.length === 0 && <option value="">Salida por defecto del sistema</option>}
              {availableOutputDevices.map((output) => (
                <option key={output.id} value={output.id}>
                  {output.label}
                </option>
              ))}
            </select>

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

            <label htmlFor="advanced-noise-suppression" className="checkbox-row">
              <input
                id="advanced-noise-suppression"
                type="checkbox"
                checked={advancedNoiseSuppression}
                onChange={(event) => void onSetAdvancedNoiseSuppression(event.target.checked)}
              />
              Supresor de ruido avanzado (solo voz)
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

        <div className="dock-block dock-input">
          <small>OUTPUT DEVICE</small>
          <div className="dock-select-row">
            <select value={selectedOutputDeviceId ?? ""} onChange={(event) => void onSetOutputDevice(event.target.value || null)}>
              {availableOutputDevices.length === 0 && <option value="">Salida por defecto del sistema</option>}
              {availableOutputDevices.map((output) => (
                <option key={output.id} value={output.id}>
                  {output.label}
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
