const token = document.querySelector('meta[name="ravisn-token"]')?.getAttribute("content") ?? "";

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

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Ravisn-Token": token };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
  } catch {
    listeners.forEach((l) => l(false));
    throw new ApiError(0, "Ravisn is not running. Open it again from the desktop shortcut.");
  }
  listeners.forEach((l) => l(true));
  if (!res.ok) {
    let payload: any;
    try {
      payload = await res.json();
    } catch {
      /* not JSON */
    }
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
