import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, LogIn, Clock, X } from 'lucide-react';
import { avatarUrl, isValidDbUrl } from '../lib/api';
import {
  addDbUrlHistory,
  addGamertagHistory,
  getDbUrlHistory,
  getGamertagHistory,
  removeDbUrlHistory,
  removeGamertagHistory,
} from '../lib/history';
import { Logo } from '../components/Logo';
import './LoginScreen.css';

interface LoginScreenProps {
  onConnect: (gamertag: string, dbUrl: string) => void;
  initialGamertag?: string;
  initialDbUrl?: string;
}

export function LoginScreen({ onConnect, initialGamertag = '', initialDbUrl = '' }: LoginScreenProps) {
  const [gamertag, setGamertag] = useState(initialGamertag);
  const [dbUrl, setDbUrl] = useState(initialDbUrl);
  const [previewTag, setPreviewTag] = useState('');

  const [gamertagHistory, setGamertagHistory] = useState<string[]>(() => getGamertagHistory());
  const [dbUrlHistory, setDbUrlHistory] = useState<string[]>(() => getDbUrlHistory());
  const [gamertagMenuOpen, setGamertagMenuOpen] = useState(false);
  const [dbMenuOpen, setDbMenuOpen] = useState(false);

  const gamertagFieldRef = useRef<HTMLDivElement>(null);
  const dbFieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setPreviewTag(gamertag.trim()), 350);
    return () => clearTimeout(t);
  }, [gamertag]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (gamertagFieldRef.current && !gamertagFieldRef.current.contains(e.target as Node)) {
        setGamertagMenuOpen(false);
      }
      if (dbFieldRef.current && !dbFieldRef.current.contains(e.target as Node)) {
        setDbMenuOpen(false);
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const ready = gamertag.trim().length > 0 && dbUrl.trim().length > 0;
  const dbLooksValid = isValidDbUrl(dbUrl);

  const filteredGamertags = gamertagHistory.filter((g) =>
    g.toLowerCase().includes(gamertag.trim().toLowerCase())
  );
  const filteredDbUrls = dbUrlHistory.filter((u) => u.toLowerCase().includes(dbUrl.trim().toLowerCase()));

  function handleConnectClick() {
    if (!ready) return;
    addGamertagHistory(gamertag.trim());
    addDbUrlHistory(dbUrl.trim());
    onConnect(gamertag.trim(), dbUrl.trim());
  }

  function handleRemoveGamertag(g: string) {
    removeGamertagHistory(g);
    setGamertagHistory(getGamertagHistory());
  }

  function handleRemoveDbUrl(u: string) {
    removeDbUrlHistory(u);
    setDbUrlHistory(getDbUrlHistory());
  }

  return (
    <>
      <div className="login-logo-wrap">
        <Logo variant="inline" />
      </div>

      <div className="field" ref={gamertagFieldRef}>
        <label className="field-label">Gamertag</label>
        <div className="gamertag-row">
          <div className="avatar-frame">
            {previewTag ? (
              <img
                src={avatarUrl(previewTag)}
                alt=""
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <span className="placeholder">?</span>
            )}
          </div>
          <input
            value={gamertag}
            onChange={(e) => setGamertag(e.target.value)}
            onFocus={() => setGamertagMenuOpen(true)}
            type="text"
            placeholder="Enter your gamertag"
            autoComplete="off"
          />
        </div>
        {gamertagMenuOpen && filteredGamertags.length > 0 && (
          <div className="history-menu">
            {filteredGamertags.map((g) => (
              <div className="history-row" key={g}>
                <button
                  className="history-option"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setGamertag(g);
                    setGamertagMenuOpen(false);
                  }}
                >
                  <Clock size={13} />
                  {g}
                </button>
                <button
                  className="history-remove"
                  aria-label={`Remove ${g} from history`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRemoveGamertag(g);
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <label className="field-label">Database URL</label>
        <div className="url-field-wrap" ref={dbFieldRef}>
          <input
            className="url-field"
            value={dbUrl}
            onChange={(e) => setDbUrl(e.target.value)}
            onFocus={() => setDbMenuOpen(true)}
            type="text"
            placeholder="https://..."
            autoComplete="off"
          />
          {dbMenuOpen && filteredDbUrls.length > 0 && (
            <div className="history-menu">
              {filteredDbUrls.map((u) => (
                <div className="history-row" key={u}>
                  <button
                    className="history-option mono"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDbUrl(u);
                      setDbMenuOpen(false);
                    }}
                  >
                    <Clock size={13} />
                    {u}
                  </button>
                  <button
                    className="history-remove"
                    aria-label={`Remove ${u} from history`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRemoveDbUrl(u);
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="status-hint">
          <span className={`status-dot ${dbLooksValid ? 'ok' : ''}`} />
          <span>
            {dbLooksValid ? 'Valid URL' : dbUrl ? 'Format not recognized' : "Paste your database's URL"}
          </span>
        </div>
      </div>

      <button className="login-connect-btn" disabled={!ready} onClick={handleConnectClick}>
        {ready ? <LogIn size={16} /> : <LockKeyhole size={16} />}
        Connect
      </button>
    </>
  );
}
