import { useState } from 'react';
import { LayoutGroup, motion, AnimatePresence } from 'framer-motion';
import { Logo } from './components/Logo';
import { ThemeToggle } from './components/ThemeToggle';
import { useTheme } from './hooks/useTheme';
import { LoginScreen } from './screens/LoginScreen';
import { ConnectingScreen } from './screens/ConnectingScreen';
import { RoomScreen } from './screens/RoomScreen';
import type { MinecraftData, Screen } from './types';
import './App.css';

function isTauriApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [gamertag, setGamertag] = useState('');
  const [dbUrl, setDbUrl] = useState('');
  const [roomData, setRoomData] = useState<MinecraftData | null>(null);
  const { preference, setPreference } = useTheme();

  function handleConnect(tag: string, url: string) {
    setGamertag(tag);
    setDbUrl(url);
    setScreen('connecting');
  }

  function handleConnected(data: MinecraftData) {
    setRoomData(data);
    setScreen('room');
  }

  function handleDisconnect() {
    setRoomData(null);
    setScreen('login');
  }

  return (
    <LayoutGroup>
      {screen !== 'login' && <Logo />}
      <ThemeToggle value={preference} onChange={setPreference} />

      <motion.div
        layout
        id="mainPanel"
        className={screen === 'room' ? 'wide' : ''}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {screen === 'login' && (
            <motion.div key="login" exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <LoginScreen onConnect={handleConnect} initialGamertag={gamertag} initialDbUrl={dbUrl} />
            </motion.div>
          )}

          {screen === 'connecting' && (
            <motion.div key="connecting" exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <ConnectingScreen
                gamertag={gamertag}
                dbUrl={dbUrl}
                onConnected={handleConnected}
                onBackToLogin={handleDisconnect}
              />
            </motion.div>
          )}

          {screen === 'room' && roomData && (
            <motion.div key="room" className="room-screen-wrap" exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <RoomScreen
                gamertag={gamertag}
                dbUrl={dbUrl}
                initialData={roomData}
                isDesktopApp={isTauriApp()}
                onDisconnect={handleDisconnect}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </LayoutGroup>
  );
}

export default App;
