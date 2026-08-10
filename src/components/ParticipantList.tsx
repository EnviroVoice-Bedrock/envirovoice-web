import type { MinecraftPlayerPosition, MinecraftWorldState } from "../services/api/firebaseVoiceSync";
import type { RoomUser } from "../types/room";

type EnvironmentEffect = "none" | "cave" | "underwater" | "mountain" | "buried";

type Props = {
  users: RoomUser[];
  currentUserId: string;
  minecraftPlayers: MinecraftPlayerPosition[];
  minecraftEffects: MinecraftWorldState["effects"];
  deafenedUsers: Record<string, boolean>;
  peerVolumes: Record<string, number>;
  onToggleDeafen: (userId: string) => void;
  onSetVolume: (userId: string, volume: number) => void;
};

const getAvatarUrl = (playerName: string): string =>
  `https://mc-api.io/render/face/${encodeURIComponent(playerName.trim() || "WprousG")}/bedrock?size=256`;

const normalizeName = (name: string): string => name.trim().toLowerCase();

const resolveEnvironmentEffect = (
  player: MinecraftPlayerPosition | undefined,
  effects: MinecraftWorldState["effects"]
): EnvironmentEffect => {
  if (!player) {
    return "none";
  }

  if (effects.underwaterSound && player.isUnderWater) {
    return "underwater";
  }

  if (effects.buriedSound && player.isBuried) {
    return "buried";
  }

  if (effects.caveSound && player.isInCave) {
    return "cave";
  }

  if (effects.mountainSound && (player.isInMountain ?? player.y >= 128)) {
    return "mountain";
  }

  return "none";
};

const getEnvironmentEffectLabel = (effect: EnvironmentEffect): string | null => {
  switch (effect) {
    case "cave":
      return "Efecto: cave";
    case "underwater":
      return "Efecto: underwater";
    case "mountain":
      return "Efecto: mountain";
    case "buried":
      return "Efecto: buried";
    default:
      return null;
  }
};

export const ParticipantList = ({ users, currentUserId, minecraftPlayers, minecraftEffects, deafenedUsers, peerVolumes, onToggleDeafen, onSetVolume }: Props) => {
  const minecraftPlayersByName = new Map(minecraftPlayers.map((player) => [normalizeName(player.name), player]));

  return (
    <ul className="participant-list">
      {users.map((user) => {
        const isSelf = user.id === currentUserId;
        const isDeafened = deafenedUsers[user.id];
        const volume = Math.max(0, Math.min(2, peerVolumes[user.id] ?? 1));
        const isVoiceActive = user.speaking && !user.muted;
        const minecraftProfile = minecraftPlayersByName.get(normalizeName(user.name));
        const environmentLabel = getEnvironmentEffectLabel(resolveEnvironmentEffect(minecraftProfile, minecraftEffects));
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
              {environmentLabel && <small className="participant-minecraft-state">{environmentLabel}</small>}
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
