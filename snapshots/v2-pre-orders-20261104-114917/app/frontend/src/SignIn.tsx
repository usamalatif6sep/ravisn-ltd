import { useEffect, useRef, useState } from "react";
import { api, setCsrf } from "./api";
import * as I from "./icons";
import { Button, Field } from "./ui";

export interface AuthState {
  configured: boolean;
  authenticated: boolean;
  csrf: string | null;
  locked_seconds: number;
}

export default function SignIn({ status, onSignedIn }: { status: AuthState; onSignedIn: () => void }) {
  const setup = !status.configured;
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(status.locked_seconds ? `Too many attempts. Try again in ${Math.ceil(status.locked_seconds / 60)} minutes.` : null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (setup && password !== repeat) {
      setError("The two passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ csrf: string }>(setup ? "/api/auth/setup" : "/api/auth/login", { body: { password } });
      setCsrf(res.csrf);
      onSignedIn();
    } catch (err: any) {
      setError(err.message);
      setPassword("");
      setRepeat("");
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <form className="signin-card" onSubmit={submit}>
        <div className="signin-mark">
          <I.Lock size={20} />
        </div>
        <h1>{setup ? "Create your admin password" : "Ravisn admin"}</h1>
        <p className="subtitle">
          {setup
            ? "This password protects suppliers, costs and every change to the catalogue. Use at least 12 characters."
            : "Sign in to manage products, suppliers and the reseller website."}
        </p>
        <Field label="Password" error={error}>
          <input ref={input} className="input" type="password" autoComplete={setup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {setup && (
          <Field label="Repeat password">
            <input className="input" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </Field>
        )}
        <Button variant="primary" type="submit" disabled={busy || !password} className="signin-btn">
          {busy ? "Please wait" : setup ? "Create password and sign in" : "Sign in"}
        </Button>
        {!setup && <p className="signin-note">Forgotten it? Run <span className="mono">Ravisn.cmd --reset-password</span> on this computer.</p>}
      </form>
    </div>
  );
}
