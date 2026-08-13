import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
  type Database,
} from 'firebase/database';
import { getDb } from '../lib/firebaseApp';

export interface RemotePeer {
  gamertag: string;
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  pingMs: number | null;
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
}

const SPEAKING_THRESHOLD = 12; // matches useMicPipeline's local threshold
const SPEAKING_HOLD_MS = 250;

// Public STUN only — no TURN server. Works for most home networks, but
// peers behind restrictive/symmetric NATs may fail to connect directly.
// A real TURN relay is the fix for that, left for later (costs money to run).
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const PING_INTERVAL_MS = 3000;

/**
 * Peer-to-peer mesh voice chat: every participant opens a direct
 * RTCPeerConnection to every other participant. Fine for the 2-4 player
 * groups this is aimed at — doesn't scale past that (see the LiveKit/SFU
 * conversation for larger servers, saved for a future session).
 *
 * Signaling (offers/answers/ICE candidates) rides on the same Firebase
 * Realtime Database as everything else, under `signaling/{to}/{from}/...`.
 * "Presence" (`presence/{gamertag}`) is who's actually got the web app open
 * and connected — separate from who's online in Minecraft.
 */
export function useVoiceMesh(
  dbUrl: string,
  gamertag: string,
  localStream: MediaStream | null,
  muted: boolean,
  deafened: boolean,
  speaking: boolean,
  priority: boolean
) {
  const [peers, setPeers] = useState<Record<string, RemotePeer>>({});

  const dbRef = useRef<Database | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedCandidateKeys = useRef<Set<string>>(new Set());

  // keep every open connection's outgoing track in sync with the live mic stream
  useEffect(() => {
    localStreamRef.current = localStream;
    const track = localStream?.getAudioTracks()[0];
    pcsRef.current.forEach((pc) => {
      if (!track || !localStream) return;
      const sender = pc.getSenders().find((s) => s.track === null || s.track?.kind === 'audio');
      if (sender) sender.replaceTrack(track).catch(() => {});
      else pc.addTrack(track, localStream);
    });
  }, [localStream]);

  // keep the broadcast mute/deafen state in presence current for everyone else
  useEffect(() => {
    if (!dbUrl || !gamertag) return;
    const db = getDb(dbUrl);
    set(ref(db, `presence/${gamertag}`), { online: true, muted, deafened, ts: serverTimestamp() });
  }, [dbUrl, gamertag, muted, deafened]);

  // envirovoice.json — this is what the Minecraft addon reads to know each
  // player's real voice-chat state (separate from our own internal presence
  // node, which the addon has no reason to know about)
  useEffect(() => {
    if (!dbUrl || !gamertag) return;
    const db = getDb(dbUrl);
    set(ref(db, `envirovoice/players/${gamertag}`), {
      connected: true,
      muted,
      deafened,
      speaking,
      priority,
    }).catch((err) => console.error('[EnviroVoice] failed to write envirovoice/players:', err));
    set(ref(db, 'envirovoice/updatedAt'), new Date().toISOString()).catch((err) =>
      console.error('[EnviroVoice] failed to write envirovoice/updatedAt:', err)
    );
  }, [dbUrl, gamertag, muted, deafened, speaking, priority]);

  useEffect(() => {
    if (!dbUrl || !gamertag) return;

    const db = getDb(dbUrl);
    dbRef.current = db;
    const pcs = pcsRef.current;

    const myPresenceRef = ref(db, `presence/${gamertag}`);
    const mySignalingRef = ref(db, `signaling/${gamertag}`);
    const myEnvirovoiceRef = ref(db, `envirovoice/players/${gamertag}`);

    set(myPresenceRef, { online: true, muted, deafened, ts: serverTimestamp() }).catch((err) =>
      console.error('[EnviroVoice] failed to write presence:', err)
    );
    onDisconnect(myPresenceRef).remove();
    onDisconnect(mySignalingRef).remove();
    onDisconnect(myEnvirovoiceRef).update({ connected: false });

    function ensurePeer(peerTag: string): RTCPeerConnection {
      const existing = pcsRef.current.get(peerTag);
      if (existing) {
        // a peer can leave and rejoin without a page reload (game exit/re-entry,
        // manual disconnect+reconnect) — if the old connection is dead, don't
        // silently keep pretending it's usable, replace it
        const dead = ['closed', 'failed', 'disconnected'].includes(existing.connectionState);
        if (!dead) return existing;
        existing.close();
        pcsRef.current.delete(peerTag);
        // drop the stale entry entirely rather than merging into it below —
        // an old audio track/stream from the dead session shouldn't linger
        setPeers((prev) => {
          const next = { ...prev };
          delete next[peerTag];
          return next;
        });
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcsRef.current.set(peerTag, pc);

      const track = localStreamRef.current?.getAudioTracks()[0];
      if (track && localStreamRef.current) pc.addTrack(track, localStreamRef.current);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          push(ref(db, `signaling/${peerTag}/${gamertag}/candidates`), e.candidate.toJSON());
        }
      };

      pc.ontrack = (e) => {
        setPeers((prev) => ({
          ...prev,
          [peerTag]: {
            gamertag: peerTag,
            stream: e.streams[0] ?? null,
            connectionState: pc.connectionState,
            pingMs: prev[peerTag]?.pingMs ?? null,
            speaking: false,
            muted: prev[peerTag]?.muted ?? false,
            deafened: prev[peerTag]?.deafened ?? false,
          },
        }));
      };

      pc.onconnectionstatechange = () => {
        setPeers((prev) => ({
          ...prev,
          [peerTag]: {
            ...(prev[peerTag] ?? {
              gamertag: peerTag,
              stream: null,
              pingMs: null,
              speaking: false,
              muted: false,
              deafened: false,
            }),
            connectionState: pc.connectionState,
          },
        }));
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          pcsRef.current.delete(peerTag);
        }
      };

      // either side can renegotiate once the connection has already
      // negotiated successfully at least once (e.g. its mic finished
      // initializing late) — but the very first offer stays the deterministic
      // initiator's job only, otherwise both sides race on connect and the
      // whole thing falls apart
      pc.onnegotiationneeded = () => {
        if (pc.signalingState !== 'stable') return;
        const negotiatedBefore = !!pc.currentLocalDescription && !!pc.currentRemoteDescription;
        const isInitiator = gamertag < peerTag;
        if (!negotiatedBefore && !isInitiator) return;
        initiateOffer(peerTag).catch(() => {});
      };

      setPeers((prev) => ({
        ...prev,
        [peerTag]: prev[peerTag] ?? {
          gamertag: peerTag,
          stream: null,
          connectionState: 'new',
          pingMs: null,
          speaking: false,
          muted: false,
          deafened: false,
        },
      }));

      return pc;
    }

    async function initiateOffer(peerTag: string) {
      const pc = ensurePeer(peerTag);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await set(ref(db, `signaling/${peerTag}/${gamertag}/offer`), { type: offer.type, sdp: offer.sdp });
    }

    // who's actually in the call — decide who to dial based on presence, and
    // pick up everyone's broadcast mute/deafen state while we're at it
    const unsubPresence = onValue(ref(db, 'presence'), (snap) => {
      const val = (snap.val() ?? {}) as Record<string, { muted?: boolean; deafened?: boolean }>;
      const others = Object.keys(val).filter((k) => k !== gamertag);

      others.forEach((peerTag) => {
        const existing = pcsRef.current.get(peerTag);
        if (existing && !['closed', 'failed', 'disconnected'].includes(existing.connectionState)) return;
        if (gamertag < peerTag) initiateOffer(peerTag).catch(() => {});
        else ensurePeer(peerTag); // wait for their offer
      });

      setPeers((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((tag) => {
          if (!others.includes(tag)) {
            pcsRef.current.get(tag)?.close();
            pcsRef.current.delete(tag);
            delete next[tag];
            // clean up both directions of leftover signaling for this pair so a
            // future reconnect isn't confused by a stale offer/answer/candidates
            remove(ref(db, `signaling/${tag}/${gamertag}`));
            remove(ref(db, `signaling/${gamertag}/${tag}`));
          }
        });
        others.forEach((tag) => {
          if (next[tag]) {
            next[tag] = { ...next[tag], muted: !!val[tag]?.muted, deafened: !!val[tag]?.deafened };
          }
        });
        return next;
      });
    });

    // incoming offers/answers addressed to me
    const lastProcessedOffer = new Map<string, string>();
    const lastProcessedAnswer = new Map<string, string>();

    const unsubSignaling = onValue(mySignalingRef, (snap) => {
      const val = snap.val() as Record<
        string,
        { offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit }
      > | null;
      if (!val) return;

      Object.entries(val).forEach(([fromTag, msg]) => {
        const pc = ensurePeer(fromTag);

        // re-checked on every value change (not just the first time) so a
        // genuine renegotiation offer/answer — not just a stale re-fire caused
        // by an unrelated ICE candidate landing in the same subtree — gets
        // processed too
        if (msg.offer && msg.offer.sdp !== lastProcessedOffer.get(fromTag)) {
          lastProcessedOffer.set(fromTag, msg.offer.sdp ?? '');
          pc.setRemoteDescription(msg.offer)
            .then(() => pc.createAnswer())
            .then((answer) => pc.setLocalDescription(answer).then(() => answer))
            .then((answer) =>
              set(ref(db, `signaling/${fromTag}/${gamertag}/answer`), { type: answer.type, sdp: answer.sdp })
            )
            .catch(() => {});
        }

        if (msg.answer && msg.answer.sdp !== lastProcessedAnswer.get(fromTag)) {
          lastProcessedAnswer.set(fromTag, msg.answer.sdp ?? '');
          pc.setRemoteDescription(msg.answer).catch(() => {});
        }
      });
    });

    return () => {
      unsubPresence();
      unsubSignaling();
      pcs.forEach((pc) => pc.close());
      pcs.clear();
      remove(myPresenceRef);
      remove(mySignalingRef);
      set(myEnvirovoiceRef, {
        connected: false,
        muted: false,
        deafened: false,
        speaking: false,
        priority: false,
      }).catch(() => {});
      setPeers({});
    };
    // muted/deafened are intentionally excluded — they're broadcast by the
    // separate effect above; re-running this one would tear down every
    // connection just to toggle mute, which is not what we want
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbUrl, gamertag]);

  // ICE candidate mailboxes, one per known peer
  useEffect(() => {
    const db = dbRef.current;
    if (!db || !gamertag) return;
    const unsubs: Array<() => void> = [];

    Object.keys(peers).forEach((peerTag) => {
      const candidatesRef = ref(db, `signaling/${gamertag}/${peerTag}/candidates`);
      const off = onChildAdded(candidatesRef, (snap) => {
        const key = `${peerTag}:${snap.key}`;
        if (processedCandidateKeys.current.has(key)) return;
        processedCandidateKeys.current.add(key);
        const pc = pcsRef.current.get(peerTag);
        const candidate = snap.val();
        if (pc && candidate) pc.addIceCandidate(candidate).catch(() => {});
      });
      unsubs.push(off);
    });

    return () => unsubs.forEach((u) => u());
  }, [peers, gamertag]);

  // periodic ping (RTT) per connection
  useEffect(() => {
    const interval = setInterval(() => {
      pcsRef.current.forEach((pc, peerTag) => {
        pc.getStats()
          .then((stats) => {
            stats.forEach((report) => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
                const rtt =
                  typeof report.currentRoundTripTime === 'number'
                    ? Math.round(report.currentRoundTripTime * 1000)
                    : null;
                setPeers((prev) =>
                  prev[peerTag] ? { ...prev, [peerTag]: { ...prev[peerTag], pingMs: rtt } } : prev
                );
              }
            });
          })
          .catch(() => {});
      });
    }, PING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useRemoteSpeakingDetection(peers, setPeers);

  return { peers: Object.values(peers) };
}

type SpeakingWatcher = { audioContext: AudioContext; rafId: number; holdId: number | null };

/** speaking detection for each remote peer's incoming audio — mirrors the
 * local mic analyser in useMicPipeline, just run per remote stream instead */
function useRemoteSpeakingDetection(
  peers: Record<string, RemotePeer>,
  setPeers: Dispatch<SetStateAction<Record<string, RemotePeer>>>
) {
  const peersRef = useRef(peers);

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  // only re-run when the actual set of streams changes, not on every
  // ping/connectionState update (which would tear down analysers constantly)
  const streamSignature = Object.entries(peers)
    .map(([tag, p]) => `${tag}:${p.stream?.id ?? ''}`)
    .sort()
    .join(',');

  useEffect(() => {
    const watchers = new Map<string, SpeakingWatcher>();

    Object.values(peersRef.current).forEach((peer) => {
      if (!peer.stream) return;

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(peer.stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const watcher: SpeakingWatcher = { audioContext, rafId: 0, holdId: null };
      watchers.set(peer.gamertag, watcher);

      function setSpeaking(value: boolean) {
        setPeers((prev) =>
          prev[peer.gamertag]
            ? { ...prev, [peer.gamertag]: { ...prev[peer.gamertag], speaking: value } }
            : prev
        );
      }

      function tick() {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;

        if (avg > SPEAKING_THRESHOLD) {
          if (watcher.holdId !== null) {
            window.clearTimeout(watcher.holdId);
            watcher.holdId = null;
          }
          setSpeaking(true);
        } else if (watcher.holdId === null) {
          watcher.holdId = window.setTimeout(() => {
            setSpeaking(false);
            watcher.holdId = null;
          }, SPEAKING_HOLD_MS);
        }
        watcher.rafId = requestAnimationFrame(tick);
      }
      tick();
    });

    return () => {
      watchers.forEach((w) => {
        cancelAnimationFrame(w.rafId);
        if (w.holdId !== null) window.clearTimeout(w.holdId);
        w.audioContext.close();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamSignature]);
}
