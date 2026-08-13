import { motion } from 'framer-motion';
import { Mic, MicOff, HeadphoneOff, WifiOff } from 'lucide-react';
import { avatarUrl } from '../lib/api';

type RingState = 'connecting' | 'fail' | 'ok';
type MicState = 'live' | 'muted' | 'deafened' | 'offline';

interface PlayerCardProps {
  gamertag: string;
  mode: 'hero' | 'grid';
  micState?: MicState;
  ringState?: RingState;
  /** shows a pulsing ring around the avatar while this player is actively talking */
  speaking?: boolean;
  /** shared layoutId — pass the same id on the connecting-screen hero card and
   * the room-screen grid card for the "self" player so Framer Motion animates
   * the transition between them automatically. */
  layoutId?: string;
  delay?: number;
  onClick?: () => void;
  /** round-trip time to this peer, in ms — grid mode only, omitted if unknown */
  pingMs?: number | null;
}

export function PlayerCard({
  gamertag,
  mode,
  micState,
  ringState,
  speaking,
  layoutId,
  delay = 0,
  onClick,
  pingMs,
}: PlayerCardProps) {
  const isHero = mode === 'hero';
  const ringClass = isHero && ringState ? (ringState === 'connecting' ? 'ring' : `ring-${ringState}`) : '';
  const speakingClass = mode === 'grid' && speaking ? 'speaking' : '';
  const offlineClass = mode === 'grid' && micState === 'offline' ? 'not-in-call' : '';

  return (
    <motion.div
      layoutId={layoutId}
      layout
      className={`${isHero ? 'pc-hero' : 'player-card'} ${offlineClass}`}
      initial={mode === 'grid' ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div className={`pc-avatar-wrap ${ringClass} ${speakingClass}`}>
        <div className="pc-avatar">
          <img
            src={avatarUrl(gamertag)}
            alt=""
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = '0';
            }}
          />
        </div>
        {mode === 'grid' && micState && (
          <span className={`mic-badge ${micState}`}>
            {micState === 'live' && <Mic />}
            {micState === 'muted' && <MicOff />}
            {micState === 'deafened' && <HeadphoneOff />}
            {micState === 'offline' && <WifiOff />}
          </span>
        )}
      </div>
      <div className="pc-name">{gamertag}</div>
      {mode === 'grid' && micState === 'offline' && <div className="pc-ping">Not in call</div>}
      {mode === 'grid' && micState !== 'offline' && typeof pingMs === 'number' && (
        <div className="pc-ping">{pingMs}ms</div>
      )}
    </motion.div>
  );
}
