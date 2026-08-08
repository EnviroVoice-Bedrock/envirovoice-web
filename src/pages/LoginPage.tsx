import { useEffect, useState } from "react";

type Props = {
  onLogin: (name: string) => void;
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
            onLogin(name);
          }}
        >
          <label htmlFor="server-url">URL DEL SERVIDOR</label>
          <input
            id="server-url"
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            placeholder="https://render.com"
            autoComplete="off"
          />

          <label htmlFor="username">GAMERTAG</label>
          <input
            id="username"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="WprousG"
            autoComplete="off"
          />

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
          <small className="panel-note">Solo se guarda tu nombre en esta sesion.</small>
        </form>
      </article>
    </section>
  );
};
