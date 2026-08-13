import { useEffect, useState } from 'react';
import { Check, X, RefreshCw, ArrowLeftFromLine, Loader2 } from 'lucide-react';
import { fetchMinecraftData, findPlayer, isDataStale } from '../lib/api';
import type { MinecraftData } from '../types';
import { PlayerCard } from '../components/PlayerCard';
import './ConnectingScreen.css';

type Step = 'room' | 'player' | 'voice' | 'done';
type FailKind = 'room' | 'stale' | 'player' | null;

interface ConnectingScreenProps {
  gamertag: string;
  dbUrl: string;
  onConnected: (data: MinecraftData) => void;
  onBackToLogin: () => void;
}

const STEP_LABEL: Record<Step, string> = {
  room: 'Checking if the room exists...',
  player: "Verifying you're online...",
  voice: 'Connecting to voice channel...',
  done: 'Connected',
};

const FAIL_LABEL: Record<Exclude<FailKind, null>, string> = {
  room: 'Room not found',
  stale: "This world isn't reporting — is the addon running?",
  player: "You're not online on this server",
};

const STEP_ORDER: Step[] = ['room', 'player', 'voice'];

export function ConnectingScreen({ gamertag, dbUrl, onConnected, onBackToLogin }: ConnectingScreenProps) {
  const [step, setStep] = useState<Step>('room');
  const [fail, setFail] = useState<FailKind>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const resetId = window.setTimeout(() => {
      setStep('room');
      setFail(null);
    }, 0);

    async function run() {
      let data: MinecraftData;
      try {
        data = await fetchMinecraftData(dbUrl);
      } catch {
        if (!cancelled) setFail('room');
        return;
      }
      if (cancelled) return;

      if (isDataStale(data)) {
        setFail('stale');
        return;
      }

      setStep('player');
      const player = findPlayer(data, gamertag);
      if (!player) {
        if (!cancelled) setFail('player');
        return;
      }

      setStep('voice');
      // TODO: replace with the real WebRTC signaling/connect step once that's built
      await new Promise((r) => setTimeout(r, 900));
      if (cancelled) return;

      setStep('done');
      await new Promise((r) => setTimeout(r, 500));
      if (cancelled) return;

      onConnected(data);
    }

    run();
    return () => {
      cancelled = true;
      window.clearTimeout(resetId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbUrl, gamertag, retryKey]);

  function dotState(dotStep: Step): string {
    if (fail === 'room' && dotStep === 'room') return 'fail';
    if (fail === 'stale' && dotStep === 'room') return 'fail';
    if (fail === 'player' && dotStep === 'player') return 'fail';
    const currentIndex = STEP_ORDER.indexOf(step);
    const dotIndex = STEP_ORDER.indexOf(dotStep);
    if (step === 'done' || dotIndex < currentIndex) return 'done';
    if (dotIndex === currentIndex) return 'active';
    return '';
  }

  const ringState = fail ? 'fail' : step === 'done' ? 'ok' : 'connecting';

  return (
    <>
      <PlayerCard gamertag={gamertag} mode="hero" layoutId="self-player" ringState={ringState} />

      <div className={`status-row ${fail ? 'fail' : step === 'done' ? 'ok' : ''}`}>
        {fail ? (
          <>
            <X size={15} />
            <span>{FAIL_LABEL[fail]}</span>
          </>
        ) : step === 'done' ? (
          <>
            <Check size={15} />
            <span>Connected</span>
          </>
        ) : (
          <>
            <Loader2 className="spinner" size={15} />
            <span>{STEP_LABEL[step]}</span>
          </>
        )}
      </div>

      {!fail && (
        <div className="steps">
          <span className={`step-dot ${dotState('room')}`} />
          <span className={`step-dot ${dotState('player')}`} />
          <span className={`step-dot ${dotState('voice')}`} />
        </div>
      )}

      {fail && (
        <div className="retry-actions">
          <button className="retry-primary-btn" onClick={() => setRetryKey((k) => k + 1)}>
            <RefreshCw size={15} />
            Retry
          </button>
          <button className="retry-btn" onClick={onBackToLogin}>
            <ArrowLeftFromLine size={15} />
            Back to login
          </button>
        </div>
      )}
    </>
  );
}
