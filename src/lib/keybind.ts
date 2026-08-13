export interface CapturedInput {
  code: string;
  label: string;
}

/**
 * Listens for the next keyboard or mouse input and resolves with a matcher
 * code plus a human-readable label. Only works while the page has focus —
 * this is a web-side config UI. Actually reacting to these binds while the
 * app is minimized/in the background requires the Tauri global-shortcut API
 * on the desktop build; that wiring happens there, not here.
 *
 * Pressing Escape cancels and resolves with empty strings (caller should
 * ignore that and keep the previous binding).
 */
export function captureNextInput(): Promise<CapturedInput> {
  return new Promise((resolve) => {
    function cleanup() {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
    }

    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      cleanup();
      if (e.key === 'Escape') {
        resolve({ code: '', label: '' });
        return;
      }
      resolve({ code: `key:${e.code}`, label: labelForKeyCode(e.code) });
    }

    function onMouse(e: MouseEvent) {
      e.preventDefault();
      cleanup();
      resolve({ code: `mouse:${e.button}`, label: labelForMouseButton(e.button) });
    }

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
  });
}

function labelForKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'Space') return 'Space';
  return code;
}

function labelForMouseButton(button: number): string {
  switch (button) {
    case 0:
      return 'Left mouse';
    case 1:
      return 'Middle mouse';
    case 2:
      return 'Right mouse';
    case 3:
      return 'Mouse 4';
    case 4:
      return 'Mouse 5';
    default:
      return `Mouse ${button}`;
  }
}
