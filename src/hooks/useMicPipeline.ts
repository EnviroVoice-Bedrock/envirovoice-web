import { useEffect, useRef, useState } from 'react';
import { RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import { getRnnoiseWasmBinary, rnnoiseWorkletPath } from '../lib/rnnoise';

const SPEAKING_THRESHOLD = 12; // 0-255 scale from the analyser, tuned by ear
const HOLD_MS = 250; // keeps "speaking" true briefly after the level drops, avoids flicker

interface MicPipelineResult {
  speaking: boolean;
  /** the post-volume mic signal, ready to hand to a WebRTC peer connection */
  localStream: MediaStream | null;
}

/**
 * Single source of truth for the local mic: one getUserMedia stream feeding
 * a shared audio graph.
 *
 *   source -> [RNNoise, if enabled] -> inputGain (mic volume) -> analyser (speaking detection)
 *                                                              -> outputGain (speaker volume) -> destination (only while hearSelf is on)
 *
 * Volume sliders and the self-monitor toggle adjust live without reopening
 * the stream. Device, active state, and noise suppression do reopen it —
 * inserting/removing an AudioWorklet node mid-stream isn't practical, so
 * toggling noise suppression causes a brief mic re-init, same as switching
 * devices.
 *
 * NOTE: once real WebRTC capture exists, inputGain's output should also
 * feed the peer connection instead of this being a separate capture, and
 * outputGain is exactly where incoming remote audio would route through too.
 */
export function useMicPipeline(
  deviceId: string,
  active: boolean,
  micVolume: number, // 0-100
  hearSelf: boolean,
  outputDeviceId: string,
  speakerVolume: number, // 0-100
  noiseSuppression: boolean
): MicPipelineResult {
  const [speaking, setSpeaking] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputGainRef = useRef<GainNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const rnnoiseNodeRef = useRef<RnnoiseWorkletNode | null>(null);
  const monitorConnectedRef = useRef(false);
  const holdTimeoutRef = useRef<number | null>(null);

  const micVolumeRef = useRef(micVolume);
  const speakerVolumeRef = useRef(speakerVolume);
  const hearSelfRef = useRef(hearSelf);
  const outputDeviceIdRef = useRef(outputDeviceId);

  useEffect(() => {
    micVolumeRef.current = micVolume;
  }, [micVolume]);

  useEffect(() => {
    speakerVolumeRef.current = speakerVolume;
  }, [speakerVolume]);

  useEffect(() => {
    hearSelfRef.current = hearSelf;
  }, [hearSelf]);

  useEffect(() => {
    outputDeviceIdRef.current = outputDeviceId;
    if (audioContextRef.current) applySinkId(audioContextRef.current, outputDeviceId);
  }, [outputDeviceId]);

  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getUserMedia) {
      const resetId = window.setTimeout(() => {
        setSpeaking(false);
        setLocalStream(null);
      }, 0);
      return () => window.clearTimeout(resetId);
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId = 0;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // AudioContext sinkId routing (Audio Output Devices API) has limited
        // browser support — try it, fall back to the system default silently
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        applySinkId(audioContext, outputDeviceIdRef.current);

        const source = audioContext.createMediaStreamSource(stream);
        let processedSource: AudioNode = source;

        if (noiseSuppression) {
          try {
            const wasmBinary = await getRnnoiseWasmBinary();
            if (cancelled) return;
            await audioContext.audioWorklet.addModule(rnnoiseWorkletPath);
            if (cancelled) return;
            const rnnoise = new RnnoiseWorkletNode(audioContext, { wasmBinary, maxChannels: 1 });
            rnnoiseNodeRef.current = rnnoise;
            source.connect(rnnoise);
            processedSource = rnnoise;
          } catch {
            // RNNoise failed to load (unsupported browser, blocked worklet,
            // etc.) — fall back to the raw mic signal instead of breaking
          }
        }

        const inputGain = audioContext.createGain();
        inputGain.gain.value = micVolumeRef.current / 100;
        inputGainRef.current = inputGain;
        processedSource.connect(inputGain);

        const outputGain = audioContext.createGain();
        outputGain.gain.value = speakerVolumeRef.current / 100;
        outputGainRef.current = outputGain;
        inputGain.connect(outputGain);

        // this is what actually goes out over WebRTC — a plain MediaStream
        // sourced from the post-volume signal, independent of hearSelf/output
        const destination = audioContext.createMediaStreamDestination();
        inputGain.connect(destination);
        setLocalStream(destination.stream);

        if (hearSelfRef.current) {
          outputGain.connect(audioContext.destination);
          monitorConnectedRef.current = true;
        }

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        inputGain.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        function tick() {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = sum / data.length;

          if (avg > SPEAKING_THRESHOLD) {
            if (holdTimeoutRef.current !== null) {
              window.clearTimeout(holdTimeoutRef.current);
              holdTimeoutRef.current = null;
            }
            setSpeaking(true);
          } else if (holdTimeoutRef.current === null) {
            holdTimeoutRef.current = window.setTimeout(() => {
              setSpeaking(false);
              holdTimeoutRef.current = null;
            }, HOLD_MS);
          }
          rafId = requestAnimationFrame(tick);
        }
        tick();
      } catch {
        // mic unavailable or permission denied
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (holdTimeoutRef.current !== null) window.clearTimeout(holdTimeoutRef.current);
      stream?.getTracks().forEach((t) => t.stop());
      rnnoiseNodeRef.current?.destroy();
      rnnoiseNodeRef.current = null;
      audioContextRef.current?.close();
      audioContextRef.current = null;
      inputGainRef.current = null;
      outputGainRef.current = null;
      monitorConnectedRef.current = false;
      setLocalStream(null);
    };
  }, [deviceId, active, noiseSuppression]);

  // mic volume slider — adjusts input gain live, no need to reopen the stream
  useEffect(() => {
    if (inputGainRef.current) inputGainRef.current.gain.value = micVolume / 100;
  }, [micVolume]);

  // speaker volume slider — adjusts output gain live
  useEffect(() => {
    if (outputGainRef.current) outputGainRef.current.gain.value = speakerVolume / 100;
  }, [speakerVolume]);

  // "hear yourself" toggle — connects/disconnects from the speakers live
  useEffect(() => {
    const outputGain = outputGainRef.current;
    const ctx = audioContextRef.current;
    if (!outputGain || !ctx) return;
    if (hearSelf && !monitorConnectedRef.current) {
      outputGain.connect(ctx.destination);
      monitorConnectedRef.current = true;
    } else if (!hearSelf && monitorConnectedRef.current) {
      try {
        outputGain.disconnect(ctx.destination);
      } catch {
        // already disconnected
      }
      monitorConnectedRef.current = false;
    }
  }, [hearSelf]);

  return { speaking, localStream };
}

type AudioContextWithSinkId = AudioContext & { setSinkId?: (id: string) => Promise<void> };

function applySinkId(audioContext: AudioContext, outputDeviceId: string): void {
  if (!outputDeviceId) return;
  const ctx = audioContext as AudioContextWithSinkId;
  // setSinkId (Audio Output Devices API) isn't supported everywhere yet —
  // fails silently to the system default output where it's missing
  ctx.setSinkId?.(outputDeviceId).catch(() => {
    // ignore — not fatal, just stays on the default output
  });
}
