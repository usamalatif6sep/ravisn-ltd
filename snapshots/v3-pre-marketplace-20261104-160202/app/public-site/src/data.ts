export type Availability = "available" | "pending" | "unavailable";

export interface Product {
  code: string;
  name: string;
  variant: string | null;
  category: string;
  price: number | null;
  tiers: [string, number][] | null;
  status: string;
  availability: Availability;
  qty: number | null;
  qty_basis: "reported" | "minimum" | "confirmed";
  link: string | null;
  link_site: string | null;
  images: string[];
  /** true when the photo is an illustrative reference rather than this exact item */
  illustrative?: boolean;
  group: string | null;
}

export interface Country {
  key: string;
  slug: string;
  name: string;
  currency: string;
  symbol: string;
  count: number;
  available: number;
  categories: string[];
  stock_text: string;
  currency_text: string;
  ordering: string[];
  policies: { heading: string; items: { title: string; body: string }[] }[];
}

export interface Site {
  company: string;
  whatsapp: { display: string; number: string };
  email: string;
  generated: string;
  release: number;
  countries: Country[];
  statuses: { name: string; availability: Availability; definition: string }[];
  indexing: boolean;
}

let sitePromise: Promise<Site> | null = null;
const countryCache = new Map<string, Promise<Product[]>>();

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return res.json();
}

export function loadSite(): Promise<Site> {
  sitePromise ??= getJson<Site>("/data/site.json");
  return sitePromise;
}

export function loadCountry(slug: string): Promise<Product[]> {
  if (!countryCache.has(slug)) {
    const p = getJson<Product[]>(`/data/${slug}.json`);
    p.catch(() => countryCache.delete(slug));
    countryCache.set(slug, p);
  }
  return countryCache.get(slug)!;
}

/** The catalogue a product code belongs to, from its prefix (UK-0012, US-0034, ...). */
const PREFIX: Record<string, string> = { UK: "uk", US: "usa", CA: "canada", DE: "germany", AU: "australia" };
export function slugForCode(code: string): string | null {
  const m = /^([A-Z]{2})-?\d+$/i.exec(code.trim());
  return m ? PREFIX[m[1].toUpperCase()] ?? null : null;
}

export function normaliseCode(code: string): string {
  const m = /^([A-Z]{2})-?(\d+)$/i.exec(code.trim());
  return m ? `${m[1].toUpperCase()}-${m[2].padStart(4, "0")}` : code.trim().toUpperCase();
}
