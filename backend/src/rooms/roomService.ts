import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";
import type { Room, RoomUser } from "../types/room.js";

const defaultPosition = {
  x: 0,
  y: 0,
  z: 0,
  dimension: "overworld" as const
};

const dedupeUsers = (users: RoomUser[]): RoomUser[] => {
  const seen = new Set<string>();
  const result: RoomUser[] = [];

  for (const user of users) {
    if (seen.has(user.id)) {
      continue;
    }

    seen.add(user.id);
    result.push(user);
  }

  return result;
};

export class RoomService {
  private readonly rooms = new Map<string, Room>();

  private static normalizeRoomName(name: string): string {
    return name.trim().toLowerCase();
  }

  private findRoomByName(name: string): Room | undefined {
    const normalized = RoomService.normalizeRoomName(name);
    for (const room of this.rooms.values()) {
      if (RoomService.normalizeRoomName(room.name) === normalized) {
        return room;
      }
    }

    return undefined;
  }

  resetAll(): void {
    this.rooms.clear();
  }

  listRooms(): Room[] {
    return [...this.rooms.values()].map((room) => ({
      ...room,
      users: dedupeUsers(room.users)
    }));
  }

  getRoom(roomId: string): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) {
      return undefined;
    }

    return {
      ...room,
      users: dedupeUsers(room.users)
    };
  }

  createRoom(name: string, ownerId: string, ownerName: string): Room {
    const existing = this.findRoomByName(name);
    if (existing) {
      const alreadyJoined = existing.users.some((user) => user.id === ownerId);
      if (alreadyJoined) {
        return existing;
      }

      if (existing.users.length >= existing.maxUsers) {
        throw new Error("Room full");
      }

      existing.users.push({
        id: ownerId,
        name: ownerName,
        muted: false,
        speaking: false,
        position: defaultPosition
      });

      return existing;
    }

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
      users: dedupeUsers([owner]),
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

    room.users = dedupeUsers(room.users);

    return room;
  }

  leaveRoom(roomId: string, userId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    room.users = room.users.filter((user) => user.id !== userId);
    room.users = dedupeUsers(room.users);

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
