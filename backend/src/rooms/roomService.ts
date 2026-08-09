import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";
import type { Room, RoomUser } from "../types/room.js";

const defaultPosition = {
  x: 0,
  y: 0,
  z: 0,
  dimension: "overworld" as const
};

export class RoomService {
  private readonly rooms = new Map<string, Room>();

  resetAll(): void {
    this.rooms.clear();
  }

  listRooms(): Room[] {
    return [...this.rooms.values()];
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  createRoom(name: string, ownerId: string, ownerName: string): Room {
    const roomId = uuidv4();
    const owner: RoomUser = {
      id: ownerId,
      name: ownerName,
      muted: false,
      speaking: false,
      position: defaultPosition
    };

    const room: Room = {
      id: roomId,
      name,
      ownerId,
      users: [owner],
      maxUsers: env.maxRoomUsers
    };

    this.rooms.set(roomId, room);
    return room;
  }

  joinRoom(roomId: string, userId: string, userName: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    const existing = room.users.find((user) => user.id === userId);
    if (existing) {
      return room;
    }

    if (room.users.length >= room.maxUsers) {
      throw new Error("Room full");
    }

    room.users.push({
      id: userId,
      name: userName,
      muted: false,
      speaking: false,
      position: defaultPosition
    });

    return room;
  }

  leaveRoom(roomId: string, userId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    room.users = room.users.filter((user) => user.id !== userId);

    if (!room.users.length) {
      this.rooms.delete(roomId);
      return null;
    }

    if (room.ownerId === userId) {
      room.ownerId = room.users[0].id;
    }

    return room;
  }

  setMuteState(roomId: string, userId: string, muted: boolean): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    room.users = room.users.map((user) => (user.id === userId ? { ...user, muted } : user));
    return room;
  }
}

export const roomService = new RoomService();
