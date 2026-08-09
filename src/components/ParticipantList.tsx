import type { RoomUser } from "../types/room";

type Props = {
  users: RoomUser[];
  currentUserId: string;
  deafenedUsers: Record<string, boolean>;
  peerVolumes: Record<string, number>;
  onToggleDeafen: (userId: string) => void;
  onSetVolume: (userId: string, volume: number) => void;
};

const getAvatarUrl = (playerName: string): string =>
  `https://mc-api.io/render/face/${encodeURIComponent(playerName.trim() || "WprousG")}/bedrock?size=256`;

export const ParticipantList = ({ users, currentUserId, deafenedUsers, peerVolumes, onToggleDeafen, onSetVolume }: Props) => {
  return (
    <ul className="participant-list">
      {users.map((user) => {
        const isSelf = user.id === currentUserId;
        const isDeafened = deafenedUsers[user.id];
        const volume = Math.max(0, Math.min(1, peerVolumes[user.id] ?? 1));

        return (
          <li key={user.id} className="participant-item">
            <img className="avatar avatar-image" src={getAvatarUrl(user.name)} alt={`Avatar de ${user.name}`} />
            <div className="participant-info">
              <strong>{user.name}</strong>
              <span>{user.speaking ? "Hablando" : "En silencio"}</span>
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
            <span className={`pill ${user.muted ? "pill-muted" : "pill-live"}`}>{user.muted ? "Muteado" : "Con voz"}</span>
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
