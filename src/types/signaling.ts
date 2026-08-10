export type SignalingMessageType =
  | "join-room"
  | "leave-room"
  | "user-joined"
  | "user-left"
  | "offer"
  | "answer"
  | "ice-candidate"
  | "mute-state"
  | "speaking-state"
  | "room-state"
  | "rooms-state"
  | "ping"
  | "pong"
  | "error";

export type SignalingMessage<TPayload = unknown> = {
  type: SignalingMessageType;
  roomId?: string;
  from?: string;
  to?: string;
  payload?: TPayload;
};

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";
