import { useState } from 'react';
import { X, Mic, MicOff, Volume2, Headphones, HeadphoneOff, Radio, Sparkles } from 'lucide-react';
import { captureNextInput } from '../lib/keybind';
import type { KeybindConfig } from '../types';
import './SettingsPanel.css';

interface SettingsPanelProps {
  onClose: () => void;
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
  micVolume: number;
  onMicVolumeChange: (value: number) => void;
  speakerVolume: number;
  onSpeakerVolumeChange: (value: number) => void;
  isDesktopApp: boolean;
}

type IconType = typeof Mic;

interface KeybindRowProps {
  icon: IconType;
  label: string;
  description: string;
  cfg: KeybindConfig;
  onChange: (cfg: KeybindConfig) => void;
}

function KeybindRow({ icon: Icon, label, description, cfg, onChange }: KeybindRowProps) {
  const [listening, setListening] = useState(false);

  async function handleRebind() {
    setListening(true);
    const result = await captureNextInput();
    setListening(false);
    if (!result.code) return; // Escape — keep the previous binding
    onChange({ ...cfg, code: result.code, label: result.label });
  }

  return (
    <div className="settings-row">
      <div className="settings-row-top">
        <div className="settings-row-icon">
          <Icon size={15} />
        </div>
        <div className="settings-row-text">
          <div className="settings-row-label">{label}</div>
          <div className="settings-row-desc">{description}</div>
        </div>
        <button
          className={`switch ${cfg.enabled ? 'on' : ''}`}
          role="switch"
          aria-checked={cfg.enabled}
          onClick={() => onChange({ ...cfg, enabled: !cfg.enabled })}
        >
          <span className="switch-knob" />
        </button>
      </div>
      {cfg.enabled && (
        <button className="settings-keybind-btn" onClick={handleRebind}>
          {listening ? 'Press a key...' : cfg.label}
        </button>
      )}
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  description,
  value,
  onChange,
}: {
  icon: IconType;
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-top">
        <div className="settings-row-icon">
          <Icon size={15} />
        </div>
        <div className="settings-row-text">
          <div className="settings-row-label">{label}</div>
          <div className="settings-row-desc">{description}</div>
        </div>
        <button
          className={`switch ${value ? 'on' : ''}`}
          role="switch"
          aria-checked={value}
          onClick={() => onChange(!value)}
        >
          <span className="switch-knob" />
        </button>
      </div>
    </div>
  );
}

function SliderRow({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: IconType;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-top">
        <div className="settings-row-icon">
          <Icon size={15} />
        </div>
        <div className="settings-row-text">
          <div className="settings-row-label">{label}</div>
        </div>
      </div>
      <div className="settings-slider-row">
        <input
          className="settings-slider"
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
        <span className="settings-slider-value">{value}%</span>
      </div>
    </div>
  );
}

export function SettingsPanel({
  onClose,
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
  micVolume,
  onMicVolumeChange,
  speakerVolume,
  onSpeakerVolumeChange,
  isDesktopApp,
}: SettingsPanelProps) {
  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <span>Settings</span>
        <button className="settings-close" onClick={onClose} aria-label="Close settings">
          <X size={14} />
        </button>
      </div>

      <div className="settings-section-title">Audio</div>
      <SliderRow icon={Mic} label="Microphone volume" value={micVolume} onChange={onMicVolumeChange} />
      <SliderRow icon={Volume2} label="Speaker volume" value={speakerVolume} onChange={onSpeakerVolumeChange} />
      <ToggleRow
        icon={Headphones}
        label="Hear yourself"
        description="Play your own mic back through your speakers"
        value={hearSelf}
        onChange={onHearSelfChange}
      />
      <ToggleRow
        icon={Sparkles}
        label="Noise suppression"
        description="AI-based background noise removal (RNNoise) — may briefly restart your mic"
        value={noiseSuppression}
        onChange={onNoiseSuppressionChange}
      />

      {isDesktopApp && (
        <>
          <div className="settings-section-title">Keybinds</div>
          <KeybindRow
            icon={Radio}
            label="Push to talk"
            description="Hold to speak, release to mute"
            cfg={ptt}
            onChange={onPttChange}
          />
          <KeybindRow
            icon={MicOff}
            label="Toggle mute"
            description="Press once to mute, again to unmute"
            cfg={muteToggle}
            onChange={onMuteToggleChange}
          />
          <KeybindRow
            icon={HeadphoneOff}
            label="Toggle deafen"
            description="Press once to deafen, again to undeafen"
            cfg={deafenToggle}
            onChange={onDeafenToggleChange}
          />
        </>
      )}
    </div>
  );
}
