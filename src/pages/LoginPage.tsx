import { useEffect, useState } from "react";
import envirovoiceLogo from "../../assets/Envirovoice Logo.png";

type Props = {
  onLogin: (name: string, serverUrl: string) => void;
};

type UrlPayload = {
  url?: unknown;
  serverUrl?: unknown;
  apiUrl?: unknown;
  roomUrl?: unknown;
  room?: unknown;
  code?: unknown;
  error?: unknown;
};

const getAvatarUrl = (playerName: string): string => {
  const safeName = playerName.trim() || "WprousG";
  return `https://mc-api.io/render/face/${encodeURIComponent(safeName)}/bedrock?size=256`;
};

const asValidString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const tryResolveFromJson = (payload: unknown): string | null => {
  const asString = asValidString(payload);
  if (asString) {
    return asString;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as UrlPayload;
  const candidates = [data.serverUrl, data.url, data.apiUrl, data.roomUrl, data.room, data.code];

  for (const candidate of candidates) {
    const resolved = asValidString(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
};

const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const buildFetchCandidates = (input: string): string[] => {
  const normalized = normalizeUrl(input);
  if (!normalized) {
    return [];
  }

  const candidates = [normalized];

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const isFirebaseDb = host.includes("firebasedatabase.app") || host.includes("firebaseio.com");
    const path = parsed.pathname || "/";

    if (isFirebaseDb && !path.endsWith(".json")) {
      const withJson = new URL(parsed.toString());
      const cleanPath = withJson.pathname.endsWith("/") ? withJson.pathname.slice(0, -1) : withJson.pathname;
      withJson.pathname = `${cleanPath || ""}.json`;
      if (!candidates.includes(withJson.toString())) {
        candidates.push(withJson.toString());
      }
    }
  } catch {
    return candidates;
  }

  return candidates;
};

const fetchResolvedUrl = async (input: string): Promise<string> => {
  const candidates = buildFetchCandidates(input);
  if (candidates.length === 0) {
    return input;
  }

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(candidate, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json, text/plain, */*"
        }
      });

      if (response.redirected && response.url.includes("accounts.google.com")) {
        throw new Error("La URL requiere inicio de sesion en Google");
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Firebase requiere permisos de lectura o inicio de sesion");
        }
        continue;
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

      if (contentType.includes("application/json")) {
        const json = await response.json();
        if (json && typeof json === "object") {
          const errorMessage = asValidString((json as UrlPayload).error);
          if (errorMessage) {
            throw new Error(errorMessage);
          }
        }
        const resolved = tryResolveFromJson(json);
        return resolved ?? input;
      }

      const text = await response.text();
      const trimmed = text.trim();
      return trimmed || input;
    } catch (err) {
      if (err instanceof Error && err.message.includes("Google")) {
        throw err;
      }
      continue;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return input;
};

export const LoginPage = ({ onLogin }: Props) => {
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("https://render.com");
  const [isResolvingUrl, setIsResolvingUrl] = useState(false);
  const [urlMessage, setUrlMessage] = useState<string | null>(null);
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
          onSubmit={async (event) => {
            event.preventDefault();

            setIsResolvingUrl(true);
            setUrlMessage(null);

            try {
              const resolvedServerUrl = await fetchResolvedUrl(serverUrl);
              onLogin(name, resolvedServerUrl);
            } catch (err) {
              const message = err instanceof Error ? err.message : "No se pudo resolver la URL";
              setUrlMessage(message);
            } finally {
              setIsResolvingUrl(false);
            }
          }}
        >
          <label htmlFor="server-url">URL / CODIGO DE SALA</label>
          <input
            id="server-url"
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            placeholder="https://mi-servidor.com/sala-global"
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

          <button type="submit" className="button-primary button-large" disabled={isResolvingUrl}>
            {isResolvingUrl ? "Validando URL..." : "Entrar"}
          </button>
          {urlMessage && <small className="panel-note">{urlMessage}</small>}
          <small className="panel-note">Esa URL/codigo define a que sala te conectas.</small>
          <small className="credits-line">DEVELOPED BY Halo333X, WprousG</small>
        </form>
      </article>
    </section>
  );
};
