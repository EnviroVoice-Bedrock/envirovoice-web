import { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, ChevronDown } from 'lucide-react';

interface DeviceSelectProps {
  kind: 'audioinput' | 'audiooutput';
  value: string;
  onChange: (deviceId: string, label: string) => void;
}

export function DeviceSelect({ kind, value, onChange }: DeviceSelectProps) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [permissionState, setPermissionState] = useState<'idle' | 'granted' | 'denied'>('idle');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDevices() {
      if (!navigator.mediaDevices?.getUserMedia) return;
      try {
        // requesting the stream is what unlocks real device labels — without
        // it, enumerateDevices() returns generic placeholders for every kind
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        if (cancelled) return;
        setPermissionState('granted');
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(list.filter((d) => d.kind === kind));
      } catch {
        if (!cancelled) setPermissionState('denied');
      }
    }

    loadDevices();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const Icon = kind === 'audioinput' ? Mic : Volume2;
  const emptyLabel =
    permissionState === 'denied'
      ? kind === 'audioinput'
        ? 'Microphone access blocked'
        : 'Output access blocked'
      : kind === 'audioinput'
        ? 'Default microphone'
        : 'Default output';

  return (
    <div className={`device-select compact ${open ? 'open' : ''}`} ref={ref}>
      <button
        className="device-select-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label={kind === 'audioinput' ? 'Choose microphone' : 'Choose output device'}
      >
        <Icon />
        <ChevronDown className="chevron" />
      </button>
      <div className="device-menu">
        <div className="device-menu-title">{kind === 'audioinput' ? 'Input device' : 'Output device'}</div>
        {permissionState === 'denied' && (
          <div className="device-option selected">Enable access in your browser settings</div>
        )}
        {permissionState !== 'denied' && devices.length === 0 && (
          <div className="device-option selected">{emptyLabel}</div>
        )}
        {devices.map((d, i) => (
          <button
            key={d.deviceId || i}
            className={`device-option ${d.deviceId === value ? 'selected' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange(d.deviceId, d.label);
              setOpen(false);
            }}
          >
            {d.label || `${kind === 'audioinput' ? 'Microphone' : 'Output'} ${i + 1}`}
          </button>
        ))}
      </div>
    </div>
  );
}
