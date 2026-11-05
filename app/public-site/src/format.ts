import type { Product, Site } from "./data";

const nf2 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("en-GB");

export const num = (n: number) => nf0.format(n);
export const money = (minor: number, symbol: string) => `${symbol}${nf2.format(minor / 100)}`;

export function lowestPrice(p: Product): number | null {
  if (p.tiers?.length) return Math.min(...p.tiers.map((t) => t[1]));
  return p.price;
}

export function priceLabel(p: Product, symbol: string): string {
  if (p.tiers?.length) return `From ${money(lowestPrice(p)!, symbol)}`;
  return p.price === null ? "Price on request" : money(p.price, symbol);
}

export function stockLabel(p: Product): string {
  if (p.availability === "unavailable") return "Out of stock";
  if (p.qty === null) return "";
  if (p.qty_basis === "minimum") return `${num(p.qty)}+ in stock`;
  if (p.qty_basis === "confirmed") return `${num(p.qty)} in stock, confirmed`;
  return `${num(p.qty)} reported in stock`;
}

export const title = (p: Product) => (p.variant ? `${p.name}, ${p.variant}` : p.name);

export function whatsappLink(site: Site, code?: string): string {
  const text = code
    ? `Hi ${site.company}, I'm interested in product ${code}. Could you please confirm availability and ordering details?`
    : `Hi ${site.company}, I have a question about your catalogue.`;
  return `https://wa.me/${site.whatsapp.number}?text=${encodeURIComponent(text)}`;
}

export function mailLink(site: Site, code?: string): string {
  return `mailto:${site.email}?subject=${encodeURIComponent(code ? `Enquiry about ${code}` : "Catalogue enquiry")}`;
}
