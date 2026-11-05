let csrf = "";
export function setCsrf(token: string | null) {
  csrf = token ?? "";
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public payload?: any) {
    super(message);
  }
}

type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();
export function onConnection(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const signedOut = new Set<() => void>();
export function onSignedOut(fn: () => void) {
  signedOut.add(fn);
  return () => {
    signedOut.delete(fn);
  };
}

/** Admin calls go to /api/admin/...; sign-in calls to /api/auth/... */
function resolve(path: string): string {
  if (path.startsWith("/api/auth/") || path.startsWith("/api/admin/")) return path;
  return path.replace(/^\/api\//, "/api/admin/");
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const method = opts.method ?? (body ? "POST" : "GET");
  if (method !== "GET" && csrf) headers["X-Ravisn-CSRF"] = csrf;
  let res: Response;
  try {
    res = await fetch(resolve(path), { method, headers, body, credentials: "same-origin" });
  } catch {
    listeners.forEach((l) => l(false));
    throw new ApiError(0, "Ravisn is not running. Start it again from the desktop shortcut.");
  }
  listeners.forEach((l) => l(true));
  if (!res.ok) {
    let payload: any;
    try {
      payload = await res.json();
    } catch {
      /* not JSON */
    }
    if (res.status === 401 && !path.startsWith("/api/auth/")) signedOut.forEach((f) => f());
    const detail = typeof payload?.detail === "string" ? payload.detail : res.statusText || "Something went wrong";
    throw new ApiError(res.status, detail, payload);
  }
  return res.json() as Promise<T>;
}

export const qs = (params: Record<string, string | number | boolean | undefined | null>) =>
  "?" +
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v === true ? 1 : v === false ? 0 : v))}`)
    .join("&");
