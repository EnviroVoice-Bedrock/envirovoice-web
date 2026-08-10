import { Router } from "express";
import { z } from "zod";
import { roomService } from "../rooms/roomService.js";

const createRoomSchema = z.object({
  name: z.string().min(1).max(64),
  userId: z.string().min(1).max(128),
  userName: z.string().min(1).max(64)
});

const joinRoomSchema = z.object({
  userId: z.string().min(1).max(128),
  userName: z.string().min(1).max(64)
});

const leaveRoomSchema = z.object({
  userId: z.string().min(1).max(128)
});

export const roomsRouter = Router();

roomsRouter.get("/rooms", (_req, res) => {
  res.json({
    success: true,
    data: roomService.listRooms()
  });
});

roomsRouter.post("/rooms", (req, res) => {
  const parsed = createRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid room payload" });
    return;
  }

  const room = roomService.createRoom(parsed.data.name, parsed.data.userId, parsed.data.userName);
  console.info("[Room] Created", room.id);

  res.status(201).json({ success: true, data: room });
});

roomsRouter.post("/rooms/:roomId/join", (req, res) => {
  const parsed = joinRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid join payload" });
    return;
  }

  try {
    const room = roomService.joinRoom(req.params.roomId, parsed.data.userId, parsed.data.userName);
    console.info("[Room] User joined", { roomId: req.params.roomId, userId: parsed.data.userId });
    res.json({ success: true, data: room });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to join room";
    res.status(message === "Room full" ? 409 : 404).json({ success: false, message });
  }
});

roomsRouter.post("/rooms/:roomId/leave", (req, res) => {
  const parsed = leaveRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid leave payload" });
    return;
  }

  const room = roomService.leaveRoom(req.params.roomId, parsed.data.userId);
  console.info("[Room] User left", { roomId: req.params.roomId, userId: parsed.data.userId });

  res.json({ success: true, data: room });
});

roomsRouter.post("/testing/reset", (_req, res) => {
  roomService.resetAll();
  console.info("[Testing] In-memory room state reset");

  res.json({ success: true, data: { reset: true } });
});
