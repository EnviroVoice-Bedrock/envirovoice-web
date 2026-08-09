import { env } from "../../config/env";
import type { SignalingMessage } from "../../types/signaling";
import { logger } from "../../utils/logger";

type SignalListener = (message: SignalingMessage) => void;
type StatusListener = (status: "connecting" | "connected" | "disconnected" | "reconnecting") => void;

const RECONNECT_MS = 1500;
const KEEPALIVE_PING_MS = 10_000;
const KEEPALIVE_STALE_MS = 35_000;

export class SignalingClient {
  private socket: WebSocket | null = null;
  private readonly listeners = new Set<SignalListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private reconnectTimer: number | undefined;
  private pingTimer: number | undefined;
  private keepAliveWatchdogTimer: number | undefined;
  private lastPongAt = 0;
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
      this.lastPongAt = Date.now();
      this.startKeepalive();
      this.updateStatus("connected");
    };

    this.socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as SignalingMessage;
        if (parsed.type === "pong") {
          this.lastPongAt = Date.now();
        }
        this.listeners.forEach((listener) => listener(parsed));
      } catch (err) {
        logger.error("Signaling", "Invalid message from server", err);
      }
    };

    this.socket.onerror = (event) => {
      logger.error("Signaling", "WebSocket error", event);
    };

    this.socket.onclose = () => {
      this.stopKeepalive();
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
    this.stopKeepalive();
    this.socket?.close();
    this.socket = null;
    this.updateStatus("disconnected");
  }

  isConnected(): boolean {
    return Boolean(this.socket && this.socket.readyState === WebSocket.OPEN);
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

  private startKeepalive(): void {
    this.stopKeepalive();

    this.pingTimer = window.setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }

      this.socket.send(JSON.stringify({ type: "ping", payload: { at: Date.now() } }));
    }, KEEPALIVE_PING_MS);

    this.keepAliveWatchdogTimer = window.setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }

      if (Date.now() - this.lastPongAt > KEEPALIVE_STALE_MS) {
        logger.error("Signaling", "WebSocket stale, forcing reconnect");
        this.socket.close();
      }
    }, 5000);
  }

  private stopKeepalive(): void {
    window.clearInterval(this.pingTimer);
    this.pingTimer = undefined;

    window.clearInterval(this.keepAliveWatchdogTimer);
    this.keepAliveWatchdogTimer = undefined;
  }
}
