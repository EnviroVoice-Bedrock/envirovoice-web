import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, PhoneMissed, Settings } from 'lucide-react';
import { DeviceSelect } from './DeviceSelect';
import { SettingsPanel } from './SettingsPanel';
import type { KeybindConfig } from '../types';
import './ControlBar.css';

interface ControlBarProps {
  inputDeviceId: string;
  onInputDeviceChange: (deviceId: string, label: string) => void;
  outputDeviceId: string;
  onOutputDeviceChange: (deviceId: string, label: string) => void;
  micVolume: number;
  onMicVolumeChange: (value: number) => void;
  speakerVolume: number;
  onSpeakerVolumeChange: (value: number) => void;
  muted: boolean;
  onToggleMute: () => void;
  deafened: boolean;
  onToggleDeafen: () => void;
  onDisconnect: () => void;
  ptt: KeybindConfig;
  onPttChange: (cfg: KeybindConfig) => void;
  muteToggle: KeybindConfig;
  onMuteToggleChange: (cfg: KeybindConfig) => void;
  deafenToggle: KeybindConfig;
  onDeafenToggleChange: (cfg: KeybindConfig) => void;
  hearSelf: boolean;
  onHearSelfChange: (value: boolean) => void;
  noiseSuppression: boolean;
  onNoiseSuppressionChange: (value: boolean) => void;
  isDesktopApp: boolean;
}

export function ControlBar({
  inputDeviceId,
  onInputDeviceChange,
  outputDeviceId,
  onOutputDeviceChange,
  micVolume,
  onMicVolumeChange,
  speakerVolume,
  onSpeakerVolumeChange,
  muted,
  onToggleMute,
  deafened,
  onToggleDeafen,
  onDisconnect,
  ptt,
  onPttChange,
  muteToggle,
  onMuteToggleChange,
  deafenToggle,
  onDeafenToggleChange,
  hearSelf,
  onHearSelfChange,
  noiseSuppression,
  onNoiseSuppressionChange,
  isDesktopApp,
}: ControlBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  return (
    <div className="control-bar">
      <div className="control-left">
        <div className="settings-anchor" ref={settingsRef}>
          <button
            className={`icon-toggle ${settingsOpen ? 'active-neutral' : ''}`}
            onClick={() => setSettingsOpen((o) => !o)}
            aria-label="Settings"
          >
            <Settings />
          </button>
          {settingsOpen && (
            <SettingsPanel
              onClose={() => setSettingsOpen(false)}
              ptt={ptt}
              onPttChange={onPttChange}
              muteToggle={muteToggle}
              onMuteToggleChange={onMuteToggleChange}
              deafenToggle={deafenToggle}
              onDeafenToggleChange={onDeafenToggleChange}
              hearSelf={hearSelf}
              onHearSelfChange={onHearSelfChange}
              noiseSuppression={noiseSuppression}
              onNoiseSuppressionChange={onNoiseSuppressionChange}
              isDesktopApp={isDesktopApp}
              micVolume={micVolume}
              onMicVolumeChange={onMicVolumeChange}
              speakerVolume={speakerVolume}
              onSpeakerVolumeChange={onSpeakerVolumeChange}
            />
          )}
        </div>

        <DeviceSelect kind="audioinput" value={inputDeviceId} onChange={onInputDeviceChange} />
        <DeviceSelect kind="audiooutput" value={outputDeviceId} onChange={onOutputDeviceChange} />
      </div>

      <div className="control-actions">
        <button
          className={`icon-toggle ${muted ? 'active' : ''}`}
          onClick={onToggleMute}
          disabled={deafened}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <MicOff /> : <Mic />}
        </button>
        <button
          className={`icon-toggle ${deafened ? 'active' : ''}`}
          onClick={onToggleDeafen}
          aria-label={deafened ? 'Undeafen' : 'Deafen'}
        >
          {deafened ? <HeadphoneOff /> : <Headphones />}
        </button>

        <button className="icon-toggle hangup" onClick={onDisconnect} aria-label="Disconnect">
          <PhoneMissed />
        </button>
      </div>
    </div>
  );
}
