import { useEffect, useState } from "react";
import envirovoiceLogo from "../../assets/Envirovoice Logo.png";
import envirovoiceIcon from "../../assets/envirovoice_icon.png";

type Props = {
  onLogin: (name: string, serverUrl: string) => void;
};

const getAvatarUrl = (playerName: string): string => {
  const safeName = playerName.trim() || "WprousG";
  return `https://mc-api.io/render/face/${encodeURIComponent(safeName)}/bedrock?size=256`;
};

export const LoginPage = ({ onLogin }: Props) => {
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("https://render.com");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("envirovoice-theme");
    if (storedTheme === "dark" || storedTheme === "light") {
      setTheme(storedTheme);
    }
  }, []);

  const toggleTheme = (): void => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem("envirovoice-theme", nextTheme);
  };

  const playerName = name.trim() || "WprousG";
  const shellClassName = `simple-login-shell ${theme === "dark" ? "theme-dark" : "theme-light"}`;

  return (
    <section className={shellClassName}>
      <article className="simple-login-card enviro-login-card">
        <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Cambiar tema">
          {theme === "dark" ? "Claro" : "Oscuro"}
        </button>
        <div className="brand-header">
          <img className="brand-logo" src={envirovoiceLogo} alt="EnviroVoice Logo" />
          <div className="brand-mark-wrap">
            <img className="brand-mark" src={envirovoiceIcon} alt="EnviroVoice Icon" />
          </div>
        </div>
        <p className="enviro-subtitle">SPATIAL AUDIO SYSTEM V2.0 FOR MINECRAFT BEDROCK</p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onLogin(name, serverUrl);
          }}
        >
          <label htmlFor="username">MINECRAFT GAMERTAG / XBOX LIVE USERNAME</label>
          <div className="field-shell">
            <span className="field-icon" aria-hidden="true">
              👤
            </span>
            <input
              id="username"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Steve"
              autoComplete="off"
            />
            <span className="field-chevron" aria-hidden="true">
              ▾
            </span>
          </div>

          <label htmlFor="server-url">VOICE CHANNEL URL</label>
          <div className="field-shell">
            <span className="field-icon" aria-hidden="true">
              🗄️
            </span>
            <input
              id="server-url"
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              placeholder="https://..."
              autoComplete="off"
            />
            <span className="field-chevron" aria-hidden="true">
              ▾
            </span>
          </div>

          <div className="simple-user-preview">
            <img src={getAvatarUrl(playerName)} alt={`Avatar de ${playerName}`} />
            <div>
              <small>JUGADOR</small>
              <strong>{playerName}</strong>
            </div>
          </div>

          <button type="submit" className="button-primary button-large join-room-button">
            Join Room →
          </button>

          <small className="credits-line">DEVELOPED BY</small>
          <small className="credits-line credits-names">Halo333X, WprousG</small>
        </form>
      </article>
    </section>
  );
};
