import { logger } from "../../utils/logger";

type SignalSender = (message: {
  type: "offer" | "answer" | "ice-candidate";
  roomId: string;
  from: string;
  to: string;
  payload: unknown;
}) => void;

type RemoteTrackCallback = (userId: string, stream: MediaStream) => void;
type PeerStateCallback = (userId: string, state: RTCPeerConnectionState) => void;
type LocalSpeakingCallback = (speaking: boolean) => void;
type LocalLevelCallback = (level: number) => void;

type ServiceOptions = {
  sendSignal: SignalSender;
  onRemoteTrack?: RemoteTrackCallback;
  onPeerStateChange?: PeerStateCallback;
  onLocalSpeaking?: LocalSpeakingCallback;
  onLocalLevel?: LocalLevelCallback;
};

type RoomContext = {
  roomId: string;
  selfId: string;
};

const buildRtcConfiguration = (): RTCConfiguration => {
  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  const iceServers: RTCIceServer[] = [
    {
      urls: ["stun:stun.l.google.com:19302"]
    }
  ];

  if (turnUrl) {
    iceServers.push({
      urls: [turnUrl],
      username: turnUsername,
      credential: turnCredential
    });
  }

  return { iceServers };
};

const rtcConfiguration = buildRtcConfiguration();

export class WebRtcService {
  private readonly peers = new Map<string, RTCPeerConnection>();
  private readonly remoteStreams = new Map<string, MediaStream>();
  private readonly audioElements = new Map<string, HTMLAudioElement>();
  private readonly deafenState = new Map<string, boolean>();
  private readonly volumeState = new Map<string, number>();
  private localStream: MediaStream | null = null;
  private localAudioContext: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localSourceNode: MediaStreamAudioSourceNode | null = null;
  private localMonitorGain: GainNode | null = null;
  private localSpeakingTimer: number | undefined;
  private lastSpeakingState = false;
  private selectedDeviceId: string | null = null;
  private speakingThreshold = 0.04;
  private monitorSelf = false;
  private context: RoomContext | null = null;
  private readonly options: ServiceOptions;
  private readonly pendingPlaybackPeers = new Set<string>();
  private unlockAudioHandlerAttached = false;
  private readonly unlockAudioHandler = () => {
    void this.retryPendingRemoteAudio();
  };

  constructor(options: ServiceOptions) {
    this.options = options;
  }

  setContext(context: RoomContext): void {
    this.context = context;
  }

  configureInput(deviceId: string | null): void {
    this.selectedDeviceId = deviceId;
  }

  setSpeakingThreshold(threshold: number): void {
    this.speakingThreshold = Math.max(0.01, Math.min(0.2, threshold));
  }

  setSelfMonitor(enabled: boolean): void {
    this.monitorSelf = enabled;
    if (this.localMonitorGain) {
      this.localMonitorGain.gain.value = enabled ? 1 : 0;
    }
  }

  async restartLocalAudio(): Promise<MediaStream> {
    return this.createLocalAudio(true);
  }

  async ensureLocalAudio(): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
    }

    return this.createLocalAudio(false);
  }

  private async createLocalAudio(forceRestart: boolean): Promise<MediaStream> {
    if (!forceRestart && this.localStream) {
      return this.localStream;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasMicrophone = devices.some((device) => device.kind === "audioinput");
    if (!hasMicrophone) {
      throw new DOMException("No microphone detected", "NotFoundError");
    }

    if (forceRestart && this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    logger.log("EnviroVoice", "Requesting microphone");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: this.selectedDeviceId
        ? {
            deviceId: { exact: this.selectedDeviceId }
          }
        : true,
      video: false
    });

    const nextTrack = stream.getAudioTracks()[0];
    if (nextTrack) {
      this.replaceLocalTrackOnPeers(nextTrack, stream);
    }

    this.localStream = stream;
    this.startLocalSpeakingDetector(stream);
    return stream;
  }

  setMicrophoneEnabled(enabled: boolean): void {
    if (!this.localStream) {
      return;
    }

    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  async syncRoomPeers(peerIds: string[]): Promise<void> {
    if (!this.context) {
      return;
    }

    const expectedPeers = new Set(peerIds.filter((peerId) => peerId !== this.context?.selfId));

    for (const existingPeerId of this.peers.keys()) {
      if (!expectedPeers.has(existingPeerId)) {
        this.closePeer(existingPeerId);
      }
    }

    for (const peerId of expectedPeers) {
      this.ensurePeer(peerId);

      // Deterministic initiator election avoids double-offer glare.
      if (this.context.selfId < peerId) {
        await this.createOffer(peerId);
      }
    }
  }

  async handleOffer(from: string, payload: unknown): Promise<void> {
    const offer = (payload as { sdp?: RTCSessionDescriptionInit }).sdp;
    if (!offer) {
      return;
    }

    const peer = this.ensurePeer(from);
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    if (this.context?.roomId && this.context.selfId) {
      this.options.sendSignal({
        type: "answer",
        roomId: this.context.roomId,
        from: this.context.selfId,
        to: from,
        payload: {
          sdp: peer.localDescription
        }
      });
      logger.log("EnviroVoice", "Answer created");
    }
  }

  async handleAnswer(from: string, payload: unknown): Promise<void> {
    const answer = (payload as { sdp?: RTCSessionDescriptionInit }).sdp;
    if (!answer) {
      return;
    }

    const peer = this.peers.get(from);
    if (!peer) {
      return;
    }

    await peer.setRemoteDescription(new RTCSessionDescription(answer));
    logger.log("EnviroVoice", "Answer received");
  }

  async handleIceCandidate(from: string, payload: unknown): Promise<void> {
    const candidate = (payload as { candidate?: RTCIceCandidateInit }).candidate;
    if (!candidate) {
      return;
    }

    const peer = this.peers.get(from);
    if (!peer) {
      return;
    }

    await peer.addIceCandidate(new RTCIceCandidate(candidate));
    logger.log("EnviroVoice", "ICE candidate received");
  }

  setPeerDeafened(peerId: string, deafened: boolean): void {
    this.deafenState.set(peerId, deafened);
    const audio = this.audioElements.get(peerId);
    if (audio) {
      audio.muted = deafened;
    }
  }

  setPeerVolume(peerId: string, volume: number): void {
    const safeVolume = Math.max(0, Math.min(1, volume));
    this.volumeState.set(peerId, safeVolume);

    const audio = this.audioElements.get(peerId);
    if (audio) {
      audio.volume = safeVolume;
    }
  }

  closePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.close();
      this.peers.delete(peerId);
    }

    const audio = this.audioElements.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      this.audioElements.delete(peerId);
    }

    this.remoteStreams.delete(peerId);
    this.deafenState.delete(peerId);
    this.volumeState.delete(peerId);
    this.pendingPlaybackPeers.delete(peerId);
  }

  reset(): void {
    for (const peerId of [...this.peers.keys()]) {
      this.closePeer(peerId);
    }

    if (this.localSpeakingTimer) {
      window.clearInterval(this.localSpeakingTimer);
      this.localSpeakingTimer = undefined;
    }

    this.localSourceNode?.disconnect();
    this.localAnalyser?.disconnect();
    this.localMonitorGain?.disconnect();
    this.localSourceNode = null;
    this.localAnalyser = null;
    this.localMonitorGain = null;

    if (this.localAudioContext) {
      void this.localAudioContext.close();
      this.localAudioContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.context = null;
    this.lastSpeakingState = false;
    this.detachUnlockAudioHandlers();
  }

  private ensurePeer(peerId: string): RTCPeerConnection {
    const existing = this.peers.get(peerId);
    if (existing) {
      return existing;
    }

    if (!this.context) {
      throw new Error("WebRTC context must be set before creating peers");
    }

    logger.log("EnviroVoice", "Creating peer connection", { peerId });
    const peer = new RTCPeerConnection(rtcConfiguration);

    peer.onicecandidate = (event) => {
      if (!event.candidate || !this.context) {
        return;
      }

      this.options.sendSignal({
        type: "ice-candidate",
        roomId: this.context.roomId,
        from: this.context.selfId,
        to: peerId,
        payload: {
          candidate: event.candidate.toJSON()
        }
      });
    };

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) {
        return;
      }

      this.remoteStreams.set(peerId, stream);
      this.bindAudioElement(peerId, stream);
      logger.log("EnviroVoice", "Remote track received", { peerId });
      this.options.onRemoteTrack?.(peerId, stream);
    };

    peer.onconnectionstatechange = () => {
      this.options.onPeerStateChange?.(peerId, peer.connectionState);
    };

    this.peers.set(peerId, peer);
    this.attachLocalTracks(peer);
    return peer;
  }

  private async createOffer(peerId: string): Promise<void> {
    if (!this.context) {
      return;
    }

    const peer = this.ensurePeer(peerId);
    const hasPendingLocal = Boolean(peer.currentLocalDescription || peer.pendingLocalDescription);
    if (peer.signalingState !== "stable" || hasPendingLocal) {
      return;
    }

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    this.options.sendSignal({
      type: "offer",
      roomId: this.context.roomId,
      from: this.context.selfId,
      to: peerId,
      payload: {
        sdp: peer.localDescription
      }
    });
    logger.log("EnviroVoice", "Offer created", { peerId });
  }

  private attachLocalTracks(peer: RTCPeerConnection): void {
    if (!this.localStream) {
      return;
    }

    const senders = peer.getSenders();
    const senderTrackIds = new Set(senders.map((sender) => sender.track?.id).filter((id): id is string => Boolean(id)));

    for (const track of this.localStream.getTracks()) {
      if (!senderTrackIds.has(track.id)) {
        peer.addTrack(track, this.localStream);
      }
    }
  }

  private replaceLocalTrackOnPeers(track: MediaStreamTrack, stream: MediaStream): void {
    for (const peer of this.peers.values()) {
      const audioSender = peer.getSenders().find((sender) => sender.track?.kind === "audio");
      if (audioSender) {
        void audioSender.replaceTrack(track);
      } else {
        peer.addTrack(track, stream);
      }
    }
  }

  private bindAudioElement(peerId: string, stream: MediaStream): void {
    let audio = this.audioElements.get(peerId);
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      this.audioElements.set(peerId, audio);
    }

    audio.srcObject = stream;
    audio.muted = this.deafenState.get(peerId) ?? false;
    audio.volume = this.volumeState.get(peerId) ?? 1;
    void this.tryPlayRemoteAudio(peerId, audio);
  }

  private async tryPlayRemoteAudio(peerId: string, audio: HTMLAudioElement): Promise<void> {
    try {
      await audio.play();
      this.pendingPlaybackPeers.delete(peerId);
      if (this.pendingPlaybackPeers.size === 0) {
        this.detachUnlockAudioHandlers();
      }
    } catch (err) {
      this.pendingPlaybackPeers.add(peerId);
      this.attachUnlockAudioHandlers();
      logger.error("EnviroVoice", "Remote audio blocked until user interaction", err);
    }
  }

  private attachUnlockAudioHandlers(): void {
    if (this.unlockAudioHandlerAttached) {
      return;
    }

    window.addEventListener("click", this.unlockAudioHandler);
    window.addEventListener("touchstart", this.unlockAudioHandler);
    window.addEventListener("keydown", this.unlockAudioHandler);
    this.unlockAudioHandlerAttached = true;
  }

  private detachUnlockAudioHandlers(): void {
    if (!this.unlockAudioHandlerAttached) {
      return;
    }

    window.removeEventListener("click", this.unlockAudioHandler);
    window.removeEventListener("touchstart", this.unlockAudioHandler);
    window.removeEventListener("keydown", this.unlockAudioHandler);
    this.unlockAudioHandlerAttached = false;
  }

  private async retryPendingRemoteAudio(): Promise<void> {
    for (const peerId of [...this.pendingPlaybackPeers]) {
      const audio = this.audioElements.get(peerId);
      if (!audio) {
        this.pendingPlaybackPeers.delete(peerId);
        continue;
      }

      try {
        await audio.play();
        this.pendingPlaybackPeers.delete(peerId);
      } catch {
        // Keep pending until next user interaction.
      }
    }

    if (this.pendingPlaybackPeers.size === 0) {
      this.detachUnlockAudioHandlers();
    }
  }

  private startLocalSpeakingDetector(stream: MediaStream): void {
    if (this.localSpeakingTimer) {
      window.clearInterval(this.localSpeakingTimer);
      this.localSpeakingTimer = undefined;
    }

    if (this.localAudioContext) {
      void this.localAudioContext.close();
      this.localAudioContext = null;
    }

    this.localAudioContext = new AudioContext();
    this.localAnalyser = this.localAudioContext.createAnalyser();
    this.localAnalyser.fftSize = 512;
    this.localSourceNode = this.localAudioContext.createMediaStreamSource(stream);
    this.localMonitorGain = this.localAudioContext.createGain();
    this.localMonitorGain.gain.value = this.monitorSelf ? 1 : 0;
    this.localSourceNode.connect(this.localAnalyser);
    this.localSourceNode.connect(this.localMonitorGain);
    this.localMonitorGain.connect(this.localAudioContext.destination);

    const data = new Uint8Array(this.localAnalyser.frequencyBinCount);

    this.localSpeakingTimer = window.setInterval(() => {
      if (!this.localAnalyser) {
        return;
      }

      this.localAnalyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / data.length);
      const speaking = rms > this.speakingThreshold;
      const level = Math.min(1, rms * 12);

      this.options.onLocalLevel?.(level);

      if (speaking !== this.lastSpeakingState) {
        this.lastSpeakingState = speaking;
        this.options.onLocalSpeaking?.(speaking);
      }
    }, 250);
  }
}
