import { env } from "../../config/env";
import type { SignalingMessage } from "../../types/signaling";
import { logger } from "../../utils/logger";

type SignalListener = (message: SignalingMessage) => void;
type StatusListener = (status: "connecting" | "connected" | "disconnected" | "reconnecting") => void;

const RECONNECT_MS = 1500;

export class SignalingClient {
  private socket: WebSocket | null = null;
  private readonly listeners = new Set<SignalListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private reconnectTimer: number | undefined;
  private manualClose = false;

  connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.manualClose = false;
    this.updateStatus(this.socket ? "reconnecting" : "connecting");
    logger.log("EnviroVoice", "Connecting...");

    this.socket = new WebSocket(env.signalingUrl);

    this.socket.onopen = () => {
      logger.log("EnviroVoice", "WebSocket connected");
      this.updateStatus("connected");
    };

    this.socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as SignalingMessage;
        this.listeners.forEach((listener) => listener(parsed));
      } catch (err) {
        logger.error("Signaling", "Invalid message from server", err);
      }
    };

    this.socket.onerror = (event) => {
      logger.error("Signaling", "WebSocket error", event);
    };

    this.socket.onclose = () => {
      this.updateStatus("disconnected");
      this.socket = null;

      if (!this.manualClose) {
        this.updateStatus("reconnecting");
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => this.connect(), RECONNECT_MS);
      }
    };
  }

  disconnect(): void {
    this.manualClose = true;
    window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
    this.updateStatus("disconnected");
  }

  send(message: SignalingMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      logger.error("Signaling", "Cannot send message while socket is disconnected");
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  onMessage(listener: SignalListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private updateStatus(status: "connecting" | "connected" | "disconnected" | "reconnecting"): void {
    this.statusListeners.forEach((listener) => listener(status));
  }
}
