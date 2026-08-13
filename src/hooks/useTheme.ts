import { useEffect, useState } from 'react';
import { getSavedTheme, resolveTheme, setSavedTheme, type ThemePreference } from '../lib/theme';

interface UseThemeResult {
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
}

export function useTheme(): UseThemeResult {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => getSavedTheme());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolveTheme(preference));

    if (preference !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: light)');
    function onChange() {
      document.documentElement.setAttribute('data-theme', resolveTheme('system'));
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  function setPreference(value: ThemePreference) {
    setSavedTheme(value);
    setPreferenceState(value);
  }

  return { preference, setPreference };
}
