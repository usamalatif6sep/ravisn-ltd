import "@fontsource-variable/inter";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, onSignedOut, setCsrf } from "./api";
import App from "./App";
import SignIn, { type AuthState } from "./SignIn";
import { AppProvider } from "./store";
import "./styles.css";
import { Empty, Spinner, ToastProvider } from "./ui";

function AuthGate() {
  const [status, setStatus] = useState<AuthState | null>(null);
  const [offline, setOffline] = useState(false);

  const check = useCallback(async () => {
    try {
      const s = await api<AuthState>("/api/auth/status");
      setCsrf(s.csrf);
      setStatus(s);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);
  useEffect(() => onSignedOut(() => setStatus((s) => (s ? { ...s, authenticated: false, csrf: null } : s))), []);

  if (offline) return <div className="boot"><Empty title="Ravisn is not running">Start it again from the desktop shortcut.</Empty></div>;
  if (!status) return <div className="boot"><Spinner /></div>;
  if (!status.authenticated) return <SignIn status={status} onSignedIn={check} />;
  return (
    <AppProvider>
      <App />
    </AppProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <AuthGate />
    </ToastProvider>
  </StrictMode>,
);
