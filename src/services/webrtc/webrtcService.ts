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

type PeerDebugState = {
  connectionState: RTCPeerConnectionState | "closed";
  signalingState: RTCSignalingState | "closed";
  audioSenders: number;
  audioReceivers: number;
};

type WebRtcDebugSnapshot = {
  peers: Record<string, PeerDebugState>;
  lastPlaybackError: string | null;
  lastOutputDeviceError: string | null;
};

type RoomContext = {
  roomId: string;
  selfId: string;
};

type SinkAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
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
  private remoteAudioContext: AudioContext | null = null;
  private readonly remoteSourceNodes = new Map<string, MediaStreamAudioSourceNode>();
  private readonly remoteGainNodes = new Map<string, GainNode>();
  private readonly remoteDestinations = new Map<string, MediaStreamAudioDestinationNode>();
  private readonly amplifiedPeers = new Set<string>();
  private localInputStream: MediaStream | null = null;
  private localStream: MediaStream | null = null;
  private localAudioContext: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localSourceNode: MediaStreamAudioSourceNode | null = null;
  private localDryGain: GainNode | null = null;
  private localWetGain: GainNode | null = null;
  private localNoiseGateGain: GainNode | null = null;
  private localMonitorGain: GainNode | null = null;
  private localProcessedDestination: MediaStreamAudioDestinationNode | null = null;
  private localSpeakingTimer: number | undefined;
  private lastSpeakingState = false;
  private selectedDeviceId: string | null = null;
  private selectedOutputDeviceId: string | null = null;
  private speakingThreshold = 0.04;
  private monitorSelf = false;
  private noiseSuppressionEnabled = true;
  private context: RoomContext | null = null;
  private readonly options: ServiceOptions;
  private readonly pendingPlaybackPeers = new Set<string>();
  private lastPlaybackError: string | null = null;
  private lastOutputDeviceError: string | null = null;
  private unlockAudioHandlerAttached = false;
  private readonly unlockAudioHandler = () => {
    void this.ensureAudioContextRunning();
    void this.ensureRemoteAudioContextRunning();
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

  setOutputDeviceId(deviceId: string | null): void {
    this.selectedOutputDeviceId = deviceId;
    for (const [peerId, audio] of this.audioElements.entries()) {
      void this.applyOutputDevice(peerId, audio);
    }
  }

  setSpeakingThreshold(threshold: number): void {
    this.speakingThreshold = Math.max(0.01, Math.min(0.2, threshold));
  }

  setSelfMonitor(enabled: boolean): void {
    this.monitorSelf = enabled;
    if (this.localMonitorGain) {
      this.localMonitorGain.gain.value = enabled ? 1 : 0;
    }

    if (enabled) {
      void this.ensureAudioContextRunning();
      this.attachUnlockAudioHandlers();
    }
  }

  setNoiseSuppressionEnabled(enabled: boolean): void {
    this.noiseSuppressionEnabled = enabled;

    if (this.localDryGain && this.localWetGain) {
      this.localDryGain.gain.value = enabled ? 0 : 1;
      this.localWetGain.gain.value = enabled ? 1 : 0;
    }

    if (this.localNoiseGateGain && !enabled) {
      this.localNoiseGateGain.gain.value = 1;
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

    if (forceRestart && this.localInputStream) {
      this.localInputStream.getTracks().forEach((track) => track.stop());
      this.localInputStream = null;
    }

    logger.log("EnviroVoice", "Requesting microphone");
    const inputStream = await navigator.mediaDevices.getUserMedia({
      audio: this.selectedDeviceId
        ? {
            deviceId: { exact: this.selectedDeviceId }
          }
        : true,
      video: false
    });

    this.localInputStream = inputStream;

    const stream = this.startLocalSpeakingDetector(inputStream);

    const nextTrack = stream.getAudioTracks()[0];
    if (nextTrack) {
      this.replaceLocalTrackOnPeers(nextTrack, stream);
    }

    this.localStream = stream;
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
    const safeVolume = Math.max(0, Math.min(2, volume));
    this.volumeState.set(peerId, safeVolume);

    if (safeVolume > 1) {
      this.enableAmplificationForPeer(peerId);
    } else {
      this.disableAmplificationForPeer(peerId);
    }

    const gainNode = this.remoteGainNodes.get(peerId);
    if (gainNode) {
      gainNode.gain.value = safeVolume;
    }

    const audio = this.audioElements.get(peerId);
    if (audio) {
      audio.volume = safeVolume > 1 ? 1 : safeVolume;
    }
  }

  getDebugSnapshot(): WebRtcDebugSnapshot {
    const peers: Record<string, PeerDebugState> = {};

    for (const [peerId, peer] of this.peers.entries()) {
      const audioSenders = peer.getSenders().filter((sender) => sender.track?.kind === "audio").length;
      const audioReceivers = peer.getReceivers().filter((receiver) => receiver.track?.kind === "audio").length;

      peers[peerId] = {
        connectionState: peer.connectionState,
        signalingState: peer.signalingState,
        audioSenders,
        audioReceivers
      };
    }

    return {
      peers,
      lastPlaybackError: this.lastPlaybackError,
      lastOutputDeviceError: this.lastOutputDeviceError
    };
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

    const sourceNode = this.remoteSourceNodes.get(peerId);
    if (sourceNode) {
      sourceNode.disconnect();
      this.remoteSourceNodes.delete(peerId);
    }

    const gainNode = this.remoteGainNodes.get(peerId);
    if (gainNode) {
      gainNode.disconnect();
      this.remoteGainNodes.delete(peerId);
    }

    const destination = this.remoteDestinations.get(peerId);
    if (destination) {
      destination.disconnect();
      this.remoteDestinations.delete(peerId);
    }

    this.amplifiedPeers.delete(peerId);

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
    this.localDryGain?.disconnect();
    this.localWetGain?.disconnect();
    this.localNoiseGateGain?.disconnect();
    this.localAnalyser?.disconnect();
    this.localMonitorGain?.disconnect();
    this.localProcessedDestination?.disconnect();
    this.localSourceNode = null;
    this.localDryGain = null;
    this.localWetGain = null;
    this.localNoiseGateGain = null;
    this.localAnalyser = null;
    this.localMonitorGain = null;
    this.localProcessedDestination = null;

    if (this.localAudioContext) {
      void this.localAudioContext.close();
      this.localAudioContext = null;
    }

    if (this.remoteAudioContext) {
      void this.remoteAudioContext.close();
      this.remoteAudioContext = null;
    }

    this.remoteSourceNodes.clear();
    this.remoteGainNodes.clear();
    this.remoteDestinations.clear();
    this.amplifiedPeers.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.localInputStream) {
      this.localInputStream.getTracks().forEach((track) => track.stop());
      this.localInputStream = null;
    }

    this.context = null;
    this.lastSpeakingState = false;
    this.lastPlaybackError = null;
    this.lastOutputDeviceError = null;
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
    const volume = this.volumeState.get(peerId) ?? 1;
    audio.volume = Math.min(1, volume);

    if (volume > 1) {
      this.enableAmplificationForPeer(peerId);
    } else {
      this.disableAmplificationForPeer(peerId);
    }

    void this.applyOutputDevice(peerId, audio);
    void this.tryPlayRemoteAudio(peerId, audio);
  }

  private enableAmplificationForPeer(peerId: string): void {
    const stream = this.remoteStreams.get(peerId);
    const audio = this.audioElements.get(peerId);
    if (!stream || !audio) {
      return;
    }

    const amplifiedStream = this.attachRemoteGainPipeline(peerId, stream);
    this.amplifiedPeers.add(peerId);

    if (audio.srcObject !== amplifiedStream) {
      audio.srcObject = amplifiedStream;
      void this.tryPlayRemoteAudio(peerId, audio);
    }
  }

  private disableAmplificationForPeer(peerId: string): void {
    const stream = this.remoteStreams.get(peerId);
    const audio = this.audioElements.get(peerId);
    if (!stream || !audio) {
      return;
    }

    if (this.amplifiedPeers.has(peerId)) {
      audio.srcObject = stream;
      this.amplifiedPeers.delete(peerId);
      void this.tryPlayRemoteAudio(peerId, audio);
    }

    const sourceNode = this.remoteSourceNodes.get(peerId);
    if (sourceNode) {
      sourceNode.disconnect();
      this.remoteSourceNodes.delete(peerId);
    }

    const gainNode = this.remoteGainNodes.get(peerId);
    if (gainNode) {
      gainNode.disconnect();
      this.remoteGainNodes.delete(peerId);
    }

    const destination = this.remoteDestinations.get(peerId);
    if (destination) {
      destination.disconnect();
      this.remoteDestinations.delete(peerId);
    }
  }

  private attachRemoteGainPipeline(peerId: string, stream: MediaStream): MediaStream {
    const context = this.ensureRemoteAudioContext();
    const existingSource = this.remoteSourceNodes.get(peerId);
    if (existingSource) {
      existingSource.disconnect();
      this.remoteSourceNodes.delete(peerId);
    }

    const existingGain = this.remoteGainNodes.get(peerId);
    if (existingGain) {
      existingGain.disconnect();
      this.remoteGainNodes.delete(peerId);
    }

    const existingDestination = this.remoteDestinations.get(peerId);
    if (existingDestination) {
      existingDestination.disconnect();
      this.remoteDestinations.delete(peerId);
    }

    const sourceNode = context.createMediaStreamSource(stream);
    const gainNode = context.createGain();
    gainNode.gain.value = this.volumeState.get(peerId) ?? 1;

    const destination = context.createMediaStreamDestination();
    sourceNode.connect(gainNode);
    gainNode.connect(destination);

    this.remoteSourceNodes.set(peerId, sourceNode);
    this.remoteGainNodes.set(peerId, gainNode);
    this.remoteDestinations.set(peerId, destination);

    void this.ensureRemoteAudioContextRunning();

    return destination.stream;
  }

  private ensureRemoteAudioContext(): AudioContext {
    if (!this.remoteAudioContext) {
      this.remoteAudioContext = new AudioContext();
    }

    return this.remoteAudioContext;
  }

  private async applyOutputDevice(peerId: string, audio: HTMLAudioElement): Promise<void> {
    const sinkAudio = audio as SinkAudioElement;
    if (!sinkAudio.setSinkId) {
      return;
    }

    const sinkId = this.selectedOutputDeviceId ?? "";

    try {
      await sinkAudio.setSinkId(sinkId);
      this.lastOutputDeviceError = null;
    } catch (err) {
      this.lastOutputDeviceError = err instanceof Error ? err.message : "Failed to apply output device";
      logger.error("EnviroVoice", "Failed to apply output device", { peerId, sinkId, err });
    }
  }

  private async tryPlayRemoteAudio(peerId: string, audio: HTMLAudioElement): Promise<void> {
    try {
      await this.ensureRemoteAudioContextRunning();
      await audio.play();
      this.lastPlaybackError = null;
      this.pendingPlaybackPeers.delete(peerId);
      if (this.pendingPlaybackPeers.size === 0) {
        this.detachUnlockAudioHandlers();
      }
    } catch (err) {
      this.lastPlaybackError = err instanceof Error ? err.message : "Remote audio playback blocked";
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

  private async ensureAudioContextRunning(): Promise<void> {
    if (!this.localAudioContext) {
      return;
    }

    if (this.localAudioContext.state === "running") {
      return;
    }

    try {
      await this.localAudioContext.resume();
    } catch (err) {
      logger.error("EnviroVoice", "Failed to resume local audio context", err);
    }
  }

  private async ensureRemoteAudioContextRunning(): Promise<void> {
    if (!this.remoteAudioContext) {
      return;
    }

    if (this.remoteAudioContext.state === "running") {
      return;
    }

    try {
      await this.remoteAudioContext.resume();
    } catch (err) {
      logger.error("EnviroVoice", "Failed to resume remote audio context", err);
    }
  }

  private startLocalSpeakingDetector(stream: MediaStream): MediaStream {
    if (this.localSpeakingTimer) {
      window.clearInterval(this.localSpeakingTimer);
      this.localSpeakingTimer = undefined;
    }

    if (this.localAudioContext) {
      void this.localAudioContext.close();
      this.localAudioContext = null;
    }

    this.localAudioContext = new AudioContext();
    void this.ensureAudioContextRunning();
    this.localAnalyser = this.localAudioContext.createAnalyser();
    this.localAnalyser.fftSize = 512;

    this.localSourceNode = this.localAudioContext.createMediaStreamSource(stream);
    this.localDryGain = this.localAudioContext.createGain();
    this.localWetGain = this.localAudioContext.createGain();
    this.localNoiseGateGain = this.localAudioContext.createGain();
    this.localProcessedDestination = this.localAudioContext.createMediaStreamDestination();
    this.localMonitorGain = this.localAudioContext.createGain();

    this.localDryGain.gain.value = this.noiseSuppressionEnabled ? 0 : 1;
    this.localWetGain.gain.value = this.noiseSuppressionEnabled ? 1 : 0;
    this.localNoiseGateGain.gain.value = 1;
    this.localMonitorGain.gain.value = this.monitorSelf ? 1 : 0;

    const highPass = this.localAudioContext.createBiquadFilter();
    highPass.type = "highpass";
    highPass.frequency.value = 120;
    highPass.Q.value = 0.707;

    const lowPass = this.localAudioContext.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.value = 7600;
    lowPass.Q.value = 0.707;

    const compressor = this.localAudioContext.createDynamicsCompressor();
    compressor.threshold.value = -38;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.16;

    this.localSourceNode.connect(this.localDryGain);
    this.localSourceNode.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(compressor);
    compressor.connect(this.localNoiseGateGain);
    this.localNoiseGateGain.connect(this.localWetGain);

    this.localDryGain.connect(this.localAnalyser);
    this.localWetGain.connect(this.localAnalyser);
    this.localAnalyser.connect(this.localProcessedDestination);
    this.localAnalyser.connect(this.localMonitorGain);
    this.localMonitorGain.connect(this.localAudioContext.destination);

    const data = new Uint8Array(this.localAnalyser.frequencyBinCount);

    this.localSpeakingTimer = window.setInterval(() => {
      if (!this.localAnalyser || !this.localAudioContext) {
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

      if (this.localNoiseGateGain) {
        if (this.noiseSuppressionEnabled) {
          const gateThreshold = this.speakingThreshold * 0.72;
          const target = rms > gateThreshold ? 1 : 0.18;
          const smoothing = target > this.localNoiseGateGain.gain.value ? 0.018 : 0.08;
          this.localNoiseGateGain.gain.setTargetAtTime(target, this.localAudioContext.currentTime, smoothing);
        } else {
          this.localNoiseGateGain.gain.setTargetAtTime(1, this.localAudioContext.currentTime, 0.03);
        }
      }

      this.options.onLocalLevel?.(level);

      if (speaking !== this.lastSpeakingState) {
        this.lastSpeakingState = speaking;
        this.options.onLocalSpeaking?.(speaking);
      }
    }, 250);

    return this.localProcessedDestination.stream;
  }
}
