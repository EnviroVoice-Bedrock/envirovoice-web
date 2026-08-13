import { useEffect, useRef } from 'react';
import type { RemotePeer } from './useVoiceMesh';
import type { PlayerData, ServerConfig } from '../types';
import { directionFromRotation, distance3D, proximityVolume } from '../lib/proximity';

interface PeerAudioNodes {
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  dryGain: GainNode;
  wetGain: GainNode;
  convolver: ConvolverNode;
  panner: PannerNode;
}

type AudioContextWithSinkId = AudioContext & { setSinkId?: (id: string) => Promise<void> };

function applySinkId(ctx: AudioContext, outputDeviceId: string): void {
  if (!outputDeviceId) return;
  (ctx as AudioContextWithSinkId).setSinkId?.(outputDeviceId).catch(() => {
    // unsupported/failed — stays on the default output
  });
}

/** a short synthetic reverb tail — good enough for a "cave"/"open air" feel
 * without shipping an actual impulse-response audio file */
function buildImpulseResponse(ctx: AudioContext, duration = 1.6, decay = 3): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

/** sets position on a PannerNode/AudioListener across both the modern
 * AudioParam-based API and the older setPosition() method, whichever the
 * browser actually supports */
function setPosition(
  node: PannerNode | AudioListener,
  x: number,
  y: number,
  z: number,
  ctx: AudioContext
): void {
  if (node.positionX) {
    const t = ctx.currentTime;
    node.positionX.setTargetAtTime(x, t, 0.05);
    node.positionY.setTargetAtTime(y, t, 0.05);
    node.positionZ.setTargetAtTime(z, t, 0.05);
  } else if ('setPosition' in node && typeof node.setPosition === 'function') {
    node.setPosition(x, y, z);
  }
}

function setListenerOrientation(listener: AudioListener, forward: { x: number; y: number; z: number }, ctx: AudioContext): void {
  if (listener.forwardX) {
    const t = ctx.currentTime;
    listener.forwardX.setTargetAtTime(forward.x, t, 0.05);
    listener.forwardY.setTargetAtTime(forward.y, t, 0.05);
    listener.forwardZ.setTargetAtTime(forward.z, t, 0.05);
    listener.upX.setTargetAtTime(0, t, 0.05);
    listener.upY.setTargetAtTime(1, t, 0.05);
    listener.upZ.setTargetAtTime(0, t, 0.05);
  } else if ('setOrientation' in listener && typeof listener.setOrientation === 'function') {
    listener.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
  }
}

/**
 * Owns one shared AudioContext for every incoming peer stream and wires up,
 * per peer:
 *
 *   source -> biquad filter (underwater/buried muffle)
 *          -> dry/wet split into a convolver (cave/mountain reverb)
 *          -> panner (real 3D position, panned relative to where you're
 *             facing, using your rotation from minecraft.json)
 *          -> gain (proximity volume, speaker volume, deafen)
 *          -> output device
 *
 * Doesn't render anything — it's a pure side-effect hook managing the audio
 * graph directly via refs, driven by whatever data RoomScreen already polls
 * from minecraft.json (locations, rotation, dimension, environment flags).
 */
export function useRemoteAudioMixer(
  peers: RemotePeer[],
  selfPlayer: PlayerData | undefined,
  playersByName: Map<string, PlayerData>,
  server: ServerConfig | undefined,
  speakerVolume: number,
  deafened: boolean,
  outputDeviceId: string
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<Map<string, PeerAudioNodes>>(new Map());
  const impulseRef = useRef<AudioBuffer | null>(null);

  function disconnectAll(nodes: PeerAudioNodes) {
    nodes.source.disconnect();
    nodes.gain.disconnect();
    nodes.filter.disconnect();
    nodes.convolver.disconnect();
    nodes.wetGain.disconnect();
    nodes.dryGain.disconnect();
    nodes.panner.disconnect();
  }

  // the shared context — created once, torn down on unmount
  useEffect(() => {
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const nodes = nodesRef.current;
    return () => {
      nodes.forEach(disconnectAll);
      nodes.clear();
      ctx.close();
      ctxRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (ctxRef.current) applySinkId(ctxRef.current, outputDeviceId);
  }, [outputDeviceId]);

  // build/tear down per-peer node chains as streams appear or disappear
  const streamSignature = peers
    .map((p) => `${p.gamertag}:${p.stream?.id ?? ''}`)
    .sort()
    .join(',');

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const currentTags = new Set(peers.map((p) => p.gamertag));

    nodesRef.current.forEach((nodes, tag) => {
      if (!currentTags.has(tag)) {
        disconnectAll(nodes);
        nodesRef.current.delete(tag);
      }
    });

    peers.forEach((peer) => {
      if (!peer.stream || nodesRef.current.has(peer.gamertag)) return;

      if (!impulseRef.current) impulseRef.current = buildImpulseResponse(ctx);

      const source = ctx.createMediaStreamSource(peer.stream);
      const filter = ctx.createBiquadFilter();
      filter.type = 'allpass';

      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();
      dryGain.gain.value = 1;
      wetGain.gain.value = 0;

      const convolver = ctx.createConvolver();
      convolver.buffer = impulseRef.current;

      // handles the actual 3D positioning/panning — its own distance-based
      // attenuation is disabled (rolloffFactor 0) since our own gain node
      // already does proximity volume, using the game's real maxDistance
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'linear';
      panner.rolloffFactor = 0;

      const gain = ctx.createGain();
      gain.gain.value = 0;

      source.connect(filter);
      filter.connect(dryGain);
      filter.connect(convolver);
      convolver.connect(wetGain);
      dryGain.connect(panner);
      wetGain.connect(panner);
      panner.connect(gain);
      gain.connect(ctx.destination);

      nodesRef.current.set(peer.gamertag, { source, filter, dryGain, wetGain, convolver, panner, gain });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamSignature]);

  // live proximity volume, 3D positioning + environmental effects,
  // recomputed whenever the inputs that matter change (position/rotation
  // refresh every ~1.2s from the minecraft.json poll)
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;

    if (selfPlayer) {
      setPosition(ctx.listener, selfPlayer.location.x, selfPlayer.location.y, selfPlayer.location.z, ctx);
      setListenerOrientation(ctx.listener, directionFromRotation(selfPlayer.rotation), ctx);
    }

    nodesRef.current.forEach((nodes, tag) => {
      const target = playersByName.get(tag.toLowerCase());
      let volume = 0;

      if (!deafened && selfPlayer && target && server && selfPlayer.dimension === target.dimension) {
        const dist = distance3D(selfPlayer.location, target.location);
        volume = proximityVolume(dist, server.maxDistance) * (speakerVolume / 100);
        setPosition(nodes.panner, target.location.x, target.location.y, target.location.z, ctx);
      }

      nodes.gain.gain.setTargetAtTime(volume, now, 0.05);

      let wet = 0;
      let filterType: BiquadFilterType = 'allpass';
      let filterFreq = 20000;

      if (target && server) {
        if (target.isUnderWater && server.underwaterSound) {
          filterType = 'lowpass';
          filterFreq = 600;
        } else if (target.isBuried && server.buriedSound) {
          filterType = 'lowpass';
          filterFreq = 350;
        } else if (target.isInCave && server.caveSound) {
          wet = 0.35;
        } else if (target.isInMountain && server.mountainSound) {
          wet = 0.15;
        }
      }

      nodes.filter.type = filterType;
      nodes.filter.frequency.setTargetAtTime(filterFreq, now, 0.05);
      nodes.wetGain.gain.setTargetAtTime(wet, now, 0.1);
      nodes.dryGain.gain.setTargetAtTime(1 - wet * 0.5, now, 0.1);
    });
  });
}
