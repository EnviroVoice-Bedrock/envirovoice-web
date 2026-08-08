import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { roomService } from "../rooms/roomService.js";
import { signalingMessageSchema, type SignalingMessage } from "../types/signaling.js";

const MAX_MESSAGE_SIZE = 16_384;

type ClientSession = {
  socket: WebSocket;
  userId: string;
  roomId: string;
};

const clients = new Map<WebSocket, ClientSession>();
const allSockets = new Set<WebSocket>();

const safeSend = (socket: WebSocket, message: SignalingMessage): void => {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
};

const broadcastToRoom = (roomId: string, message: SignalingMessage, exceptSocket?: WebSocket): void => {
  for (const [socket, session] of clients.entries()) {
    if (session.roomId !== roomId || socket === exceptSocket) {
      continue;
    }

    safeSend(socket, message);
  }
};

const sendRoomState = (roomId: string): void => {
  const room = roomService.getRoom(roomId);
  if (!room) {
    return;
  }

  broadcastToRoom(roomId, {
    type: "room-state",
    roomId,
    payload: room
  });
};

const sendRoomsState = (): void => {
  const rooms = roomService.listRooms();

  for (const socket of allSockets) {
    safeSend(socket, {
      type: "rooms-state",
      payload: rooms
    });
  }
};

const forwardDirect = (fromSocket: WebSocket, message: SignalingMessage): void => {
  if (!message.to) {
    return;
  }

  for (const [socket, session] of clients.entries()) {
    if (socket === fromSocket) {
      continue;
    }

    if (session.userId === message.to && (!message.roomId || session.roomId === message.roomId)) {
      safeSend(socket, message);
      return;
    }
  }
};

export const attachWebSocketServer = (server: HttpServer): void => {
  const wsServer = new WebSocketServer({ server });

  wsServer.on("connection", (socket) => {
    console.info("[WebSocket] Client connected");
    allSockets.add(socket);
    sendRoomsState();

    socket.on("message", (raw) => {
      const text = raw.toString();
      if (text.length > MAX_MESSAGE_SIZE) {
        safeSend(socket, { type: "error", payload: { message: "Message too large" } });
        return;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch {
        safeSend(socket, { type: "error", payload: { message: "Invalid JSON message" } });
        return;
      }

      const parsed = signalingMessageSchema.safeParse(parsedJson);
      if (!parsed.success) {
        safeSend(socket, { type: "error", payload: { message: "Invalid signaling message" } });
        return;
      }

      const message = parsed.data;

      if (message.type === "ping") {
        safeSend(socket, { type: "pong", payload: { at: Date.now() } });
        return;
      }

      if (message.type === "join-room") {
        if (!message.roomId || !message.from) {
          safeSend(socket, { type: "error", payload: { message: "Missing roomId or from" } });
          return;
        }

        clients.set(socket, {
          socket,
          roomId: message.roomId,
          userId: message.from
        });

        console.info("[Room] User joined", { roomId: message.roomId, userId: message.from });
        broadcastToRoom(
          message.roomId,
          {
            type: "user-joined",
            roomId: message.roomId,
            from: message.from,
            payload: message.payload
          },
          socket
        );
        sendRoomState(message.roomId);
        sendRoomsState();
        return;
      }

      if (message.type === "leave-room") {
        if (!message.roomId || !message.from) {
          safeSend(socket, { type: "error", payload: { message: "Missing roomId or from" } });
          return;
        }

        clients.delete(socket);
        roomService.leaveRoom(message.roomId, message.from);

        console.info("[Room] User left", { roomId: message.roomId, userId: message.from });
        broadcastToRoom(message.roomId, {
          type: "user-left",
          roomId: message.roomId,
          from: message.from,
          payload: message.payload
        });
        sendRoomState(message.roomId);
        sendRoomsState();
        return;
      }

      if (message.type === "mute-state") {
        if (!message.roomId || !message.from || typeof message.payload !== "object" || message.payload === null) {
          safeSend(socket, { type: "error", payload: { message: "Invalid mute-state message" } });
          return;
        }

        const muted = (message.payload as { muted?: unknown }).muted;
        if (typeof muted !== "boolean") {
          safeSend(socket, { type: "error", payload: { message: "Invalid muted value" } });
          return;
        }

        roomService.setMuteState(message.roomId, message.from, muted);
        sendRoomState(message.roomId);
        return;
      }

      if (message.type === "offer") {
        console.info("[Signaling] Offer", { roomId: message.roomId, from: message.from, to: message.to });
        forwardDirect(socket, message);
        return;
      }

      if (message.type === "answer") {
        console.info("[Signaling] Answer", { roomId: message.roomId, from: message.from, to: message.to });
        forwardDirect(socket, message);
        return;
      }

      if (message.type === "ice-candidate") {
        console.info("[Signaling] ICE candidate", { roomId: message.roomId, from: message.from, to: message.to });
        forwardDirect(socket, message);
        return;
      }

      if (message.type === "speaking-state") {
        if (!message.roomId) {
          return;
        }

        broadcastToRoom(message.roomId, message, socket);
      }
    });

    socket.on("close", () => {
      const session = clients.get(socket);
      clients.delete(socket);
      allSockets.delete(socket);

      if (!session) {
        sendRoomsState();
        return;
      }

      roomService.leaveRoom(session.roomId, session.userId);
      broadcastToRoom(session.roomId, {
        type: "user-left",
        roomId: session.roomId,
        from: session.userId,
        payload: { disconnected: true }
      });
      sendRoomState(session.roomId);
      sendRoomsState();
    });
  });
};
