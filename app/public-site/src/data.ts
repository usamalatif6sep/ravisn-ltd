export type Availability = "available" | "pending" | "unavailable";

export interface Fulfilment {
  dispatch_cutoff?: string;
  dispatch_estimate?: string;
  carriers?: string;
  shipping_methods?: string;
  labels?: string;
  tracking?: string;
  verified_at?: string;
}

export interface Product {
  /** the permanent Ravisn reference, e.g. RVN-UK-10482 */
  code: string;
  /** the original catalogue code, e.g. UK-0001: old links and searches keep working */
  legacy: string | null;
  name: string;
  variant: string | null;
  category: string;
  department: string;
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
  added: string | null;
  /** verified, customer-safe dispatch facts (never a supplier's identity) */
  fulfilment: Fulfilment | null;
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

export interface Department {
  name: string;
  slug: string;
  count: number;
  image: string | null;
  countries: string[];
}
export interface Pick {
  slug: string;
  product: Product;
}
export interface HomeData {
  departments: Department[];
  featured: Pick[];
  recent: Pick[];
  countries: Record<string, string[]>;
  hero: { kind: "country" | "department"; slug: string; name?: string; image: string; product: string; product_name: string; country?: string }[];
  video: { src: string; poster: string } | null;
}

let sitePromise: Promise<Site> | null = null;
let homePromise: Promise<HomeData> | null = null;
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

export function loadHome(): Promise<HomeData> {
  homePromise ??= getJson<HomeData>("/data/home.json");
  homePromise.catch(() => (homePromise = null));
  return homePromise;
}

export function loadCountry(slug: string): Promise<Product[]> {
  if (!countryCache.has(slug)) {
    const p = getJson<Product[]>(`/data/${slug}.json`);
    p.catch(() => countryCache.delete(slug));
    countryCache.set(slug, p);
  }
  return countryCache.get(slug)!;
}

/** Every catalogue, each product tagged with its country slug. */
export async function loadAll(site: Site): Promise<{ slug: string; product: Product }[]> {
  const lists = await Promise.all(site.countries.map((c) => loadCountry(c.slug).then((ps) => ps.map((product) => ({ slug: c.slug, product })))));
  return lists.flat();
}

/** The catalogue a reference or legacy code belongs to: RVN-UK-10482, UK-0012, US-0034, ... */
const PREFIX: Record<string, string> = { UK: "uk", US: "usa", CA: "canada", DE: "germany", AU: "australia" };
export function slugForCode(code: string): string | null {
  const m = /^(?:RVN-)?([A-Z]{2})-?\d+$/i.exec(code.trim());
  return m ? PREFIX[m[1].toUpperCase()] ?? null : null;
}

export function normaliseCode(code: string): string {
  const c = code.trim().toUpperCase();
  const r = /^RVN-?([A-Z]{2})-?(\d{5})$/.exec(c);
  if (r) return `RVN-${r[1]}-${r[2]}`;
  const m = /^([A-Z]{2})-?(\d+)$/.exec(c);
  return m ? `${m[1]}-${m[2].padStart(4, "0")}` : c;
}

/** Find a product by its Ravisn reference or its legacy code. */
export function findProduct(products: Product[], code: string): Product | undefined {
  const c = normaliseCode(code);
  return products.find((p) => p.code === c) ?? products.find((p) => p.legacy === c);
}

export const deptSlug = (name: string) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
