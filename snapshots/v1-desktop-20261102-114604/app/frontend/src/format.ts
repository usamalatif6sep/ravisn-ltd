import type { QtyBasis, Tier } from "./types";

const nf2 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("en-GB");

export function money(minor: number | null | undefined, symbol: string): string {
  if (minor === null || minor === undefined) return "";
  const sign = minor < 0 ? "-" : "";
  return `${sign}${symbol}${nf2.format(Math.abs(minor) / 100)}`;
}

export function num(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : nf0.format(n);
}

export function qtyText(qty: number | null, basis: QtyBasis): string {
  if (qty === null) return "";
  return basis === "minimum" ? `${nf0.format(qty)}+` : nf0.format(qty);
}

export function tiersText(tiers: Tier[], symbol: string, key: "price_minor" | "cost_minor" = "price_minor"): string {
  return tiers.map((t) => `${t.label} ${money(t[key] ?? null, symbol)}`).join(" · ");
}

/** Same arithmetic as the server: higher of cost x (1 + markup) rounded half up, and cost + minimum margin. */
export function rulePrice(costMinor: number, markupBp: number, minMarginMinor: number): number {
  const marked = Math.floor((costMinor * (10000 + markupBp) + 5000) / 10000);
  return Math.max(marked, costMinor + minMarginMinor);
}

/** Parse "12.5", "£12.50", "1,234.56" into minor units. Returns undefined for invalid input, null for empty. */
export function parseMoney(text: string): number | null | undefined {
  const t = text.replace(/[£$€,\sA-Za-z]/g, "").trim();
  if (!t) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return undefined;
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export function minorToInput(minor: number | null | undefined): string {
  return minor === null || minor === undefined ? "" : (minor / 100).toFixed(2);
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function day(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${nf0.format(n)} ${n === 1 ? one : many}`;
}
