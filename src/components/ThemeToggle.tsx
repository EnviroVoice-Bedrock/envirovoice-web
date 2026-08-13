import { Sun, Moon, MonitorCog } from 'lucide-react';
import type { ThemePreference } from '../lib/theme';
import './ThemeToggle.css';

interface ThemeToggleProps {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}

const OPTIONS: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light theme' },
  { value: 'system', icon: MonitorCog, label: 'Match system theme' },
  { value: 'dark', icon: Moon, label: 'Dark theme' },
];

export function ThemeToggle({ value, onChange }: ThemeToggleProps) {
  return (
    <div className="theme-toggle">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`theme-toggle-btn ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
          aria-label={opt.label}
          aria-pressed={value === opt.value}
        >
          <opt.icon size={14} />
        </button>
      ))}
    </div>
  );
}
