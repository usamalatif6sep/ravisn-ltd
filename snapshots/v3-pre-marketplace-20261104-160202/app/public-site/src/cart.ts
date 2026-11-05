import { useEffect, useState } from "react";

/** The order being put together, kept in this browser only until it is sent. One catalogue country per order. */
export interface CartLine {
  code: string;
  option: string | null;
  qty: number;
}
export interface Cart {
  catalogue: string | null;
  lines: CartLine[];
}

const KEY = "ravisn.cart.v1";
const EVENT = "ravisn-cart";
const empty: Cart = { catalogue: null, lines: [] };

function read(): Cart {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null");
    if (c && Array.isArray(c.lines)) return c;
  } catch {
    /* storage unavailable or damaged: start empty */
  }
  return { ...empty, lines: [] };
}

function write(c: Cart) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* private mode: the order still works for this page view */
  }
  memory = c;
  window.dispatchEvent(new Event(EVENT));
}

let memory: Cart = read();

export function getCart(): Cart {
  return memory;
}

export function useCart(): Cart {
  const [c, setC] = useState<Cart>(memory);
  useEffect(() => {
    const on = () => setC(memory);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        memory = read();
        setC(memory);
      }
    };
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return c;
}

export const MAX_QTY = 999;
const clamp = (n: number) => Math.max(1, Math.min(MAX_QTY, Math.floor(n) || 1));

/** Returns false when the order already holds products from another country. */
export function addLine(catalogue: string, code: string, option: string | null, qty: number, replaceOther = false): boolean {
  const c = memory;
  if (c.catalogue && c.catalogue !== catalogue && c.lines.length && !replaceOther) return false;
  const lines = c.catalogue === catalogue ? [...c.lines] : [];
  const i = lines.findIndex((l) => l.code === code && l.option === option);
  if (i >= 0) lines[i] = { ...lines[i], qty: clamp(lines[i].qty + qty) };
  else lines.push({ code, option, qty: clamp(qty) });
  write({ catalogue, lines });
  return true;
}

export function setQty(code: string, option: string | null, qty: number) {
  write({ ...memory, lines: memory.lines.map((l) => (l.code === code && l.option === option ? { ...l, qty: clamp(qty) } : l)) });
}

export function removeLine(code: string, option: string | null) {
  const lines = memory.lines.filter((l) => !(l.code === code && l.option === option));
  write({ catalogue: lines.length ? memory.catalogue : null, lines });
}

export function clearCart() {
  write({ catalogue: null, lines: [] });
}

export const units = (c: Cart) => c.lines.reduce((a, l) => a + l.qty, 0);

/** Orders sent from this browser, so the reseller can find their references again. */
export interface SavedOrder {
  number: string;
  token: string;
  at: string;
  catalogue: string;
}
const ORDERS = "ravisn.orders.v1";

export function savedOrders(): SavedOrder[] {
  try {
    return JSON.parse(localStorage.getItem(ORDERS) || "[]");
  } catch {
    return [];
  }
}

export function saveOrder(o: SavedOrder) {
  try {
    const list = [o, ...savedOrders().filter((x) => x.number !== o.number)].slice(0, 50);
    localStorage.setItem(ORDERS, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
