import type { KeybindConfig } from '../types';

const SETTINGS_KEY = 'envirovoice:audio-settings';

export interface SavedAudioSettings {
  micVolume: number;
  speakerVolume: number;
  hearSelf: boolean;
  noiseSuppression: boolean;
  ptt: KeybindConfig;
  muteToggle: KeybindConfig;
  deafenToggle: KeybindConfig;
}

const DEFAULTS: SavedAudioSettings = {
  micVolume: 100,
  speakerVolume: 100,
  hearSelf: false,
  noiseSuppression: false,
  ptt: { enabled: false, code: 'mouse:1', label: 'Middle mouse' },
  muteToggle: { enabled: false, code: 'key:KeyM', label: 'M' },
  deafenToggle: { enabled: false, code: 'key:KeyN', label: 'N' },
};

export function getSavedAudioSettings(): SavedAudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function saveAudioSettings(settings: SavedAudioSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable — settings just won't persist
  }
}
