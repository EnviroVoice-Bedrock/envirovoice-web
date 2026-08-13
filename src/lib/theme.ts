export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_KEY = 'envirovoice:theme';

export function getSavedTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
    return 'system';
  } catch {
    return 'system';
  }
}

export function setSavedTheme(value: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, value);
  } catch {
    // localStorage unavailable — preference just won't persist
  }
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
