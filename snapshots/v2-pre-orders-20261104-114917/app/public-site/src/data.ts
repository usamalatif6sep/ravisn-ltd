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
  if (!countryCache.has(slug)) countryCache.set(slug, getJson<Product[]>(`/data/${slug}.json`));
  return countryCache.get(slug)!;
}
