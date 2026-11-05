import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, onConnection, qs } from "./api";
import type { Country, Meta, Status } from "./types";

export type Route =
  | { view: "catalogue"; country: string; id?: number }
  | { view: "suppliers"; id?: number }
  | { view: "review"; kind?: string }
  | { view: "exports" }
  | { view: "images" }
  | { view: "website" }
  | { view: "settings"; tab?: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case "c":
      return { view: "catalogue", country: parts[1] || "UK", id: parts[2] ? Number(parts[2]) : undefined };
    case "suppliers":
      return { view: "suppliers", id: parts[1] ? Number(parts[1]) : undefined };
    case "review":
      return { view: "review", kind: parts[1] };
    case "exports":
      return { view: "exports" };
    case "images":
      return { view: "images" };
    case "website":
      return { view: "website" };
    case "settings":
      return { view: "settings", tab: parts[1] };
    default:
      return { view: "catalogue", country: "UK" };
  }
}

export function href(r: Route): string {
  switch (r.view) {
    case "catalogue":
      return `#/c/${r.country}${r.id ? `/${r.id}` : ""}`;
    case "suppliers":
      return `#/suppliers${r.id ? `/${r.id}` : ""}`;
    case "review":
      return `#/review${r.kind ? `/${r.kind}` : ""}`;
    case "exports":
      return "#/exports";
    case "images":
      return "#/images";
    case "website":
      return "#/website";
    case "settings":
      return `#/settings${r.tab ? `/${r.tab}` : ""}`;
  }
}

interface AppState {
  meta: Meta | null;
  route: Route;
  go: (r: Route, replace?: boolean) => void;
  showPrivate: boolean;
  setShowPrivate: (v: boolean) => void;
  refreshMeta: () => Promise<void>;
  country: (key: string) => Country | undefined;
  status: (name: string) => Status | undefined;
  online: boolean;
}

const Ctx = createContext<AppState>(null as unknown as AppState);
export const useApp = () => useContext(Ctx);

function readPrivate(): boolean {
  try {
    return localStorage.getItem("ravisn.showPrivate") !== "0";
  } catch {
    return true;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  const [showPrivate, setShowPrivateState] = useState(readPrivate);
  const [online, setOnline] = useState(true);

  const refreshMeta = useCallback(async () => {
    setMeta(await api<Meta>("/api/meta" + qs({ private: showPrivate })));
  }, [showPrivate]);

  useEffect(() => {
    refreshMeta().catch(() => {});
  }, [refreshMeta]);

  useEffect(() => onConnection(setOnline), []);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((r: Route, replace = false) => {
    const h = href(r);
    if (replace) history.replaceState(null, "", h);
    else if (location.hash !== h) history.pushState(null, "", h);
    setRoute(r);
  }, []);

  const setShowPrivate = useCallback((v: boolean) => {
    setShowPrivateState(v);
    try {
      localStorage.setItem("ravisn.showPrivate", v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo<AppState>(
    () => ({
      meta,
      route,
      go,
      showPrivate,
      setShowPrivate,
      refreshMeta,
      online,
      country: (key) => meta?.countries.find((c) => c.key === key),
      status: (name) => meta?.statuses.find((s) => s.name === name),
    }),
    [meta, route, go, showPrivate, setShowPrivate, refreshMeta, online],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
