import { useEffect, useState } from "react";
import envirovoiceLogo from "../../assets/Envirovoice Logo.png";

type Props = {
  onLogin: (name: string, serverUrl: string) => void;
};

const FIREBASE_URI_EXAMPLE = "https://tu-proyecto-default-rtdb.region.firebasedatabase.app/";
const REMEMBER_LOGIN_KEY = "envirovoice-remember-login";
const REMEMBERED_NAME_KEY = "envirovoice-remembered-name";
const REMEMBERED_SERVER_URL_KEY = "envirovoice-remembered-server-url";

const getAvatarUrl = (playerName: string): string => {
  const safeName = playerName.trim() || "WprousG";
  return `https://mc-api.io/render/face/${encodeURIComponent(safeName)}/bedrock?size=256`;
};

export const LoginPage = ({ onLogin }: Props) => {
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [rememberLogin, setRememberLogin] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("envirovoice-theme");
    if (storedTheme === "dark" || storedTheme === "light") {
      setTheme(storedTheme);
    }

    const shouldRemember = window.localStorage.getItem(REMEMBER_LOGIN_KEY) === "true";
    setRememberLogin(shouldRemember);

    if (!shouldRemember) {
      return;
    }

    setName(window.localStorage.getItem(REMEMBERED_NAME_KEY) ?? "");
    setServerUrl(window.localStorage.getItem(REMEMBERED_SERVER_URL_KEY) ?? "");
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
      <div className="login-logo-frame">
        <img className="brand-logo" src={envirovoiceLogo} alt="EnviroVoice Logo" />
      </div>

      <article className="simple-login-card">
        <button type="button" className="theme-toggle" onClick={toggleTheme}>
          {theme === "dark" ? "Modo claro" : "Modo oscuro"}
        </button>
        <small className="section-kicker">INICIO DE SESION</small>
        <h1>Accede al panel</h1>
        <p>Escribe tu gamertag para continuar.</p>

        <form
          onSubmit={(event) => {
            event.preventDefault();

            if (rememberLogin) {
              window.localStorage.setItem(REMEMBER_LOGIN_KEY, "true");
              window.localStorage.setItem(REMEMBERED_NAME_KEY, name.trim());
              window.localStorage.setItem(REMEMBERED_SERVER_URL_KEY, serverUrl.trim());
            } else {
              window.localStorage.setItem(REMEMBER_LOGIN_KEY, "false");
              window.localStorage.removeItem(REMEMBERED_NAME_KEY);
              window.localStorage.removeItem(REMEMBERED_SERVER_URL_KEY);
            }

            onLogin(name, serverUrl);
          }}
        >
          <label htmlFor="server-url">URI FIREBASE BASE</label>
          <input
            id="server-url"
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            placeholder={FIREBASE_URI_EXAMPLE}
            autoComplete="off"
            required
          />

          <label htmlFor="username">GAMERTAG</label>
          <input
            id="username"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="WprousG"
            autoComplete="off"
          />

          <label className="remember-login-toggle" htmlFor="remember-login">
            <input
              id="remember-login"
              type="checkbox"
              checked={rememberLogin}
              onChange={(event) => setRememberLogin(event.target.checked)}
            />
            <span>Recordar datos</span>
          </label>

          <div className="simple-user-preview">
            <img src={getAvatarUrl(playerName)} alt={`Avatar de ${playerName}`} />
            <div>
              <small>JUGADOR</small>
              <strong>{playerName}</strong>
            </div>
          </div>

          <button type="submit" className="button-primary button-large">
            Entrar
          </button>
          <small className="panel-note">Se usa como base para + minecraft.json y + envirovoice.json.</small>
          <small className="credits-line">DEVELOPED BY Halo333X, WprousG</small>
        </form>
      </article>
    </section>
  );
};
