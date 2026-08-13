import { useEffect, useRef, useState } from 'react';
import { fetchMinecraftData, findPlayer, isDataStale } from '../lib/api';
import {
  getLastDeviceId,
  getLastOutputDeviceId,
  setLastDeviceId,
  setLastOutputDeviceId,
} from '../lib/history';
import { getSavedAudioSettings, saveAudioSettings } from '../lib/settings';
import type { KeybindConfig, MinecraftData } from '../types';
import { PlayerCard } from '../components/PlayerCard';
import { ControlBar } from '../components/ControlBar';
import { useMicPipeline } from '../hooks/useMicPipeline';
import { useVoiceMesh, type RemotePeer } from '../hooks/useVoiceMesh';
import { useRemoteAudioMixer } from '../hooks/useRemoteAudioMixer';
import './RoomScreen.css';

interface RoomScreenProps {
  gamertag: string;
  dbUrl: string;
  initialData: MinecraftData;
  isDesktopApp: boolean;
  onDisconnect: () => void;
}

export function RoomScreen({ gamertag, dbUrl, initialData, isDesktopApp, onDisconnect }: RoomScreenProps) {
  const [data, setData] = useState<MinecraftData>(initialData);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [priority, setPriority] = useState(false);

  const [inputDeviceId, setInputDeviceId] = useState<string>(() => getLastDeviceId());
  const [outputDeviceId, setOutputDeviceId] = useState<string>(() => getLastOutputDeviceId());
  const [micVolume, setMicVolume] = useState(() => getSavedAudioSettings().micVolume);
  const [speakerVolume, setSpeakerVolume] = useState(() => getSavedAudioSettings().speakerVolume);

  const [ptt, setPtt] = useState<KeybindConfig>(() => getSavedAudioSettings().ptt);
  const [muteToggle, setMuteToggle] = useState<KeybindConfig>(() => getSavedAudioSettings().muteToggle);
  const [deafenToggle, setDeafenToggle] = useState<KeybindConfig>(
    () => getSavedAudioSettings().deafenToggle
  );
  const [hearSelf, setHearSelf] = useState(() => getSavedAudioSettings().hearSelf);
  const [noiseSuppression, setNoiseSuppression] = useState(
    () => getSavedAudioSettings().noiseSuppression
  );

  useEffect(() => {
    saveAudioSettings({
      micVolume,
      speakerVolume,
      hearSelf,
      noiseSuppression,
      ptt,
      muteToggle,
      deafenToggle,
    });
  }, [micVolume, speakerVolume, hearSelf, noiseSuppression, ptt, muteToggle, deafenToggle]);

  const { speaking, localStream } = useMicPipeline(
    inputDeviceId,
    !muted,
    micVolume,
    hearSelf,
    outputDeviceId,
    speakerVolume,
    noiseSuppression
  );

  const { peers } = useVoiceMesh(dbUrl, gamertag, localStream, muted, deafened, speaking, priority);

  const wasMutedBeforeDeafenRef = useRef(false);
  const mutedRef = useRef(muted);
  const deafenedRef = useRef(deafened);
  const priorityRef = useRef(priority);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    deafenedRef.current = deafened;
  }, [deafened]);

  useEffect(() => {
    priorityRef.current = priority;
  }, [priority]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchMinecraftData(dbUrl)
        .then((fresh) => {
          setData(fresh);
          const self = findPlayer(fresh, gamertag);
          // if we're no longer in the world (or the addon stopped reporting),
          // this app's whole premise is gone — kick back to login
          if (isDataStale(fresh) || !self) {
            onDisconnect();
            return;
          }

          // conflict resolution between "I just toggled mute/deafen on the
          // web" and "someone just changed it from the in-game menu":
          // whoever's priority flag is true right now wins. Once both sides
          // agree, priority clears itself and it's back to passive sync.
          const gameHasPriority = !!self.priority;

          if (gameHasPriority) {
            // the game just made an intentional change — always adopt it,
            // and drop our own priority since we're yielding to it
            if (self.isMuted !== mutedRef.current) setMuted(self.isMuted);
            if (self.isDeafen !== deafenedRef.current) setDeafened(self.isDeafen);
            if (priorityRef.current) setPriority(false);
          } else if (!priorityRef.current) {
            // no one has an outstanding intentional change right now — plain
            // passive sync, matches what the mockups always did
            if (self.isMuted !== mutedRef.current) setMuted(self.isMuted);
            if (self.isDeafen !== deafenedRef.current) setDeafened(self.isDeafen);
          } else {
            // we have our own pending intentional change and the game hasn't
            // overridden it — once the game catches up to match what we set,
            // clear our priority; until then, don't let a not-yet-caught-up
            // minecraft.json revert what we just did
            if (self.isMuted === mutedRef.current && self.isDeafen === deafenedRef.current) {
              setPriority(false);
            }
          }
        })
        .catch(() => {
          // network hiccup — keep showing the last known snapshot
        });
    }, 1200);
    return () => clearInterval(interval);
  }, [dbUrl, gamertag, onDisconnect]);

  const otherPlayers = data.players.filter((p) => p.name.toLowerCase() !== gamertag.toLowerCase());

  const selfMicState = deafened ? 'deafened' : muted ? 'muted' : 'live';

  const selfPlayerData = findPlayer(data, gamertag);
  const playersByName = new Map(data.players.map((p) => [p.name.toLowerCase(), p]));

  useRemoteAudioMixer(
    peers,
    selfPlayerData,
    playersByName,
    data.server,
    speakerVolume,
    deafened,
    outputDeviceId
  );

  function peerFor(playerGamertag: string): RemotePeer | undefined {
    return peers.find((p) => p.gamertag.toLowerCase() === playerGamertag.toLowerCase());
  }

  function handleToggleMute() {
    setMuted((m) => !m);
    setPriority(true);
  }

  function handleToggleDeafen() {
    setDeafened((d) => {
      const next = !d;
      if (next) {
        wasMutedBeforeDeafenRef.current = muted;
        setMuted(true);
      } else if (!wasMutedBeforeDeafenRef.current) {
        setMuted(false);
      }
      return next;
    });
    setPriority(true);
  }

  function handleInputDeviceChange(id: string) {
    setInputDeviceId(id);
    setLastDeviceId(id);
  }

  function handleOutputDeviceChange(id: string) {
    setOutputDeviceId(id);
    setLastOutputDeviceId(id);
  }

  // Reacts to the configured toggle-mute / toggle-deafen keybinds while the
  // page has focus. Push-to-talk itself doesn't need a listener here yet —
  // it only matters once real mic audio is wired up. Global capture while
  // the window is unfocused/minimized is a Tauri-side concern, not this.
  useEffect(() => {
    if (!isDesktopApp) return;

    function matches(cfg: KeybindConfig, code: string) {
      return cfg.enabled && cfg.code === code;
    }

    function onKeyDown(e: KeyboardEvent) {
      const code = `key:${e.code}`;
      if (matches(muteToggle, code)) handleToggleMute();
      if (matches(deafenToggle, code)) handleToggleDeafen();
    }

    function onMouseDown(e: MouseEvent) {
      const code = `mouse:${e.button}`;
      if (matches(muteToggle, code)) handleToggleMute();
      if (matches(deafenToggle, code)) handleToggleDeafen();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktopApp, muteToggle, deafenToggle]);

  return (
    <div className="room-content">
      <div className="room-grid">
        <PlayerCard
          gamertag={gamertag}
          mode="grid"
          micState={selfMicState}
          speaking={speaking}
          layoutId="self-player"
        />
        {otherPlayers.map((p, i) => {
          const peer = peerFor(p.name);
          return (
            <PlayerCard
              key={p.id}
              gamertag={p.name}
              mode="grid"
              micState={!peer ? 'offline' : peer.deafened ? 'deafened' : peer.muted ? 'muted' : 'live'}
              speaking={peer?.speaking}
              delay={0.05 + i * 0.06}
              pingMs={peer?.pingMs}
            />
          );
        })}
      </div>

      <ControlBar
        inputDeviceId={inputDeviceId}
        onInputDeviceChange={handleInputDeviceChange}
        outputDeviceId={outputDeviceId}
        onOutputDeviceChange={handleOutputDeviceChange}
        micVolume={micVolume}
        onMicVolumeChange={setMicVolume}
        speakerVolume={speakerVolume}
        onSpeakerVolumeChange={setSpeakerVolume}
        muted={muted}
        onToggleMute={handleToggleMute}
        deafened={deafened}
        onToggleDeafen={handleToggleDeafen}
        onDisconnect={onDisconnect}
        ptt={ptt}
        onPttChange={setPtt}
        muteToggle={muteToggle}
        onMuteToggleChange={setMuteToggle}
        deafenToggle={deafenToggle}
        onDeafenToggleChange={setDeafenToggle}
        hearSelf={hearSelf}
        onHearSelfChange={setHearSelf}
        noiseSuppression={noiseSuppression}
        onNoiseSuppressionChange={setNoiseSuppression}
        isDesktopApp={isDesktopApp}
      />
    </div>
  );
}
