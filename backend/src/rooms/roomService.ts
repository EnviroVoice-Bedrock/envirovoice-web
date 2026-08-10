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
  private static readonly DUPLICATE_USER_NAME_ERROR = "Username already connected";

  private static normalizeRoomName(name: string): string {
    return name.trim().toLowerCase();
  }

  private static normalizeUserName(name: string): string {
    return name.trim().toLowerCase();
  }

  private dedupeRoomUsers(room: Room): void {
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    room.users = room.users.filter((user) => {
      const normalizedName = RoomService.normalizeUserName(user.name);
      if (seenIds.has(user.id) || seenNames.has(normalizedName)) {
        return false;
      }

      seenIds.add(user.id);
      seenNames.add(normalizedName);
      return true;
    });
  }

  private upsertRoomUser(room: Room, userId: string, userName: string): void {
    const byId = room.users.find((user) => user.id === userId);
    if (byId) {
      return;
    }

    const normalizedName = RoomService.normalizeUserName(userName);
    const byNameIndex = room.users.findIndex((user) => RoomService.normalizeUserName(user.name) === normalizedName);
    if (byNameIndex !== -1) {
      throw new Error(RoomService.DUPLICATE_USER_NAME_ERROR);
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
    return [...this.rooms.values()];
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  createRoom(name: string, ownerId: string, ownerName: string): Room {
    const existing = this.findRoomByName(name);
    if (existing) {
      this.dedupeRoomUsers(existing);
      this.upsertRoomUser(existing, ownerId, ownerName);
      existing.ownerId = ownerId;

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

    this.dedupeRoomUsers(room);
    this.upsertRoomUser(room, userId, userName);

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
