import type { RoomUser } from "../types/room";

type Props = {
  users: RoomUser[];
  currentUserId: string;
  deafenedUsers: Record<string, boolean>;
  onToggleDeafen: (userId: string) => void;
};

const getAvatarUrl = (playerName: string): string =>
  `https://mc-api.io/render/face/${encodeURIComponent(playerName.trim() || "WprousG")}/bedrock?size=256`;

export const ParticipantList = ({ users, currentUserId, deafenedUsers, onToggleDeafen }: Props) => {
  return (
    <ul className="participant-list">
      {users.map((user) => {
        const isSelf = user.id === currentUserId;
        const isDeafened = deafenedUsers[user.id];

        return (
          <li key={user.id} className="participant-item">
            <img className="avatar avatar-image" src={getAvatarUrl(user.name)} alt={`Avatar de ${user.name}`} />
            <div className="participant-info">
              <strong>{user.name}</strong>
              <span>{user.speaking ? "Hablando" : "En silencio"}</span>
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
