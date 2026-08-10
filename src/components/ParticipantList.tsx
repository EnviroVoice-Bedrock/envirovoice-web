import type { RoomUser } from "../types/room";

type Props = {
  users: RoomUser[];
  currentUserId: string;
  minecraftPlayers: Array<{ name: string; isMuted?: boolean; isDeafen?: boolean; microphoneVolume?: number }>;
  deafenedUsers: Record<string, boolean>;
  peerVolumes: Record<string, number>;
  onToggleDeafen: (userId: string) => void;
  onSetVolume: (userId: string, volume: number) => void;
};

const getAvatarUrl = (playerName: string): string =>
  `https://mc-api.io/render/face/${encodeURIComponent(playerName.trim() || "WprousG")}/bedrock?size=256`;

const normalizeName = (name: string): string => name.trim().toLowerCase();

export const ParticipantList = ({ users, currentUserId, minecraftPlayers, deafenedUsers, peerVolumes, onToggleDeafen, onSetVolume }: Props) => {
  const minecraftPlayersByName = new Map(minecraftPlayers.map((player) => [normalizeName(player.name), player]));

  return (
    <ul className="participant-list">
      {users.map((user) => {
        const isSelf = user.id === currentUserId;
        const isDeafened = deafenedUsers[user.id];
        const volume = Math.max(0, Math.min(2, peerVolumes[user.id] ?? 1));
        const isVoiceActive = user.speaking && !user.muted;
        const minecraftProfile = minecraftPlayersByName.get(normalizeName(user.name));
        const minecraftMuted = Boolean(minecraftProfile?.isMuted) || (minecraftProfile?.microphoneVolume ?? 100) === 0;
        const minecraftDeafened = Boolean(minecraftProfile?.isDeafen);
        const volumeMuted = volume === 0;
        const pillMuted = user.muted || minecraftMuted || volumeMuted;

        return (
          <li key={user.id} className={`participant-item ${isVoiceActive ? "participant-item-speaking" : ""}`}>
            <div className={`avatar-frame ${isVoiceActive ? "avatar-frame-speaking" : ""}`}>
              <img className="avatar avatar-image" src={getAvatarUrl(user.name)} alt={`Avatar de ${user.name}`} />
            </div>
            <div className="participant-info">
              <strong>{user.name}</strong>
              <small className="participant-minecraft-state">
                {minecraftMuted ? "Muteado en Minecraft" : minecraftDeafened ? "Ensordecido en Minecraft" : `Minecraft vol ${minecraftProfile?.microphoneVolume ?? 100}%`}
              </small>
              {!isSelf && (
                <div className="participant-volume">
                  <button type="button" className="button-secondary participant-volume-btn" onClick={() => onSetVolume(user.id, volume - 0.2)}>
                    Vol -
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(volume * 100)}
                    onChange={(event) => onSetVolume(user.id, Number(event.target.value) / 100)}
                    aria-label={`Volumen de ${user.name}`}
                  />
                  <button type="button" className="button-secondary participant-volume-btn" onClick={() => onSetVolume(user.id, volume + 0.2)}>
                    Vol +
                  </button>
                  <small>{Math.round(volume * 100)}%</small>
                </div>
              )}
            </div>
            <span className={`pill ${pillMuted ? "pill-muted" : "pill-live"}`}>{pillMuted ? "Muteado" : "Con voz"}</span>
            {!isSelf && (
              <button type="button" className={`button-secondary ${isDeafened ? "button-warn" : ""}`} onClick={() => onToggleDeafen(user.id)}>
                {isDeafened ? "Escuchar" : "Ensordecer"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
};
