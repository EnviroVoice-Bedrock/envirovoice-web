import { z } from "zod";

const payloadSchema = z.unknown();

export const signalingMessageSchema = z.object({
  type: z.enum([
    "join-room",
    "leave-room",
    "user-joined",
    "user-left",
    "offer",
    "answer",
    "ice-candidate",
    "mute-state",
    "speaking-state",
    "room-state",
    "rooms-state",
    "ping",
    "pong",
    "error"
  ]),
  roomId: z.string().min(1).max(128).optional(),
  from: z.string().min(1).max(128).optional(),
  to: z.string().min(1).max(128).optional(),
  payload: payloadSchema.optional()
});

export type SignalingMessage = z.infer<typeof signalingMessageSchema>;
