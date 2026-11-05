import { useEffect, useState } from "react";
import { api } from "./api";

/** New orders and chat messages from the reseller website, polled while the admin panel is open. */
export interface StoreSummary {
  new_orders: number;
  open_orders: number;
  unread_chats: number;
  waiting_chats: number;
  online: boolean;
}

let current: StoreSummary | null = null;
const subs = new Set<(s: StoreSummary | null) => void>();
let timer: number | undefined;
let beat: number | undefined;
let notify: ((text: string, open: () => void) => void) | null = null;
const baseTitle = document.title;

function publish(s: StoreSummary) {
  const prev = current;
  current = s;
  subs.forEach((f) => f(s));
  const n = s.new_orders + s.unread_chats;
  document.title = n ? `(${n}) ${baseTitle}` : baseTitle;
  if (prev && notify) {
    if (s.new_orders > prev.new_orders) notify(s.new_orders - prev.new_orders === 1 ? "New order received" : `${s.new_orders - prev.new_orders} new orders received`, () => (location.hash = "#/orders"));
    if (s.unread_chats > prev.unread_chats || s.waiting_chats > prev.waiting_chats) notify("New chat message", () => (location.hash = "#/chats"));
  }
}

export async function refreshStoreSummary() {
  try {
    publish(await api<StoreSummary>("/api/store/summary"));
  } catch {
    /* app offline or signed out: the next poll tries again */
  }
}

export function startStorePolling(onNotify: (text: string, open: () => void) => void) {
  notify = onNotify;
  if (timer) return;
  refreshStoreSummary();
  timer = window.setInterval(refreshStoreSummary, 15000);
  if (isAvailable()) startHeartbeat();
}

export function useStoreSummary(): StoreSummary | null {
  const [s, setS] = useState(current);
  useEffect(() => {
    subs.add(setS);
    return () => {
      subs.delete(setS);
    };
  }, []);
  return s;
}

const KEY = "ravisn.availableForChat";
export function isAvailable(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function startHeartbeat() {
  const send = () => api("/api/store/presence", { method: "PUT", body: { online: true } }).catch(() => {});
  send();
  window.clearInterval(beat);
  beat = window.setInterval(send, 45000);
}

/** Resellers see "team online" only while this is switched on and the admin panel is open (it expires after 2 minutes). */
export async function setAvailable(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (on) startHeartbeat();
  else {
    window.clearInterval(beat);
    await api("/api/store/presence", { method: "PUT", body: { online: false } }).catch(() => {});
  }
  refreshStoreSummary();
}
