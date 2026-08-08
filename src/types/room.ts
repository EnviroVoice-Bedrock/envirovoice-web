export type UserPosition = {
  x: number;
  y: number;
  z: number;
  dimension: "overworld" | "nether" | "end";
};

export type RoomUser = {
  id: string;
  name: string;
  muted: boolean;
  speaking: boolean;
  position: UserPosition;
};

export type Room = {
  id: string;
  name: string;
  ownerId: string;
  users: RoomUser[];
  maxUsers: number;
};
