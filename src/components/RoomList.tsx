import type { Room } from "../types/room";

type Props = {
  rooms: Room[];
  onJoin: (roomId: string) => void;
};

export const RoomList = ({ rooms, onJoin }: Props) => {
  if (!rooms.length) {
    return <p className="panel-muted">No rooms yet. Create the first one.</p>;
  }

  return (
    <ul className="room-list">
      {rooms.map((room) => (
        <li key={room.id} className="room-item">
          <div>
            <strong>{room.name}</strong>
            <p>
              {room.users.length} / {room.maxUsers} users
            </p>
          </div>
          <button type="button" className="button-secondary" onClick={() => onJoin(room.id)}>
            Join
          </button>
        </li>
      ))}
    </ul>
  );
};
