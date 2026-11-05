/** Calls to the storefront API (orders and chat). The catalogue itself is static JSON. */

export class ApiError extends Error {
  fields: Record<string, string>;
  status: number;
  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export async function api<T>(path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.body === undefined ? "GET" : "POST",
      headers: { Accept: "application/json", ...(opts.body === undefined ? {} : { "Content-Type": "application/json", "X-Ravisn-Store": "1" }), ...opts.headers },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("We could not reach Ravisn. Check your connection and try again.", 0);
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok) throw new ApiError(data?.error || "Something went wrong. Please try again.", res.status, data?.fields || {});
  return data as T;
}

export interface CountryRule {
  code: string;
  name: string;
  dial: string;
  has_postcode: boolean;
  postcode_label: string;
  postcode_example: string;
  region_label: string;
  regions: { code: string; name: string }[];
  region_required: boolean;
}
export interface StoreConfig {
  orders: boolean;
  chat: boolean;
  team_online: boolean;
  countries: CountryRule[];
  catalogue_delivery: Record<string, string>;
  whatsapp: string;
  team_away: string;
}

let configPromise: Promise<StoreConfig> | null = null;
export function storeConfig(fresh = false): Promise<StoreConfig> {
  if (fresh || !configPromise) {
    configPromise = api<StoreConfig>("/api/store/config");
    configPromise.catch(() => (configPromise = null));
  }
  return configPromise;
}

export interface OrderLine {
  code: string;
  name: string;
  option: string | null;
  qty: number;
  unit_minor: number | null;
  line_minor: number | null;
}
export interface Shipment {
  id: number;
  arranged_by: "reseller" | "ravisn";
  carrier: string | null;
  service: string | null;
  tracking: string | null;
  instructions: string | null;
  label_status: "none" | "submitted" | "approved" | "rejected";
  label_note: string | null;
  charge_minor: number | null;
  payment_status: "not_applicable" | "quote_pending" | "awaiting_payment" | "paid";
  address_requested: boolean;
  dispatch_status: "pending" | "dispatched";
  dispatched_at: string | null;
  label: { id: number; filename: string; content_type: string; size: number; uploaded_at: string } | null;
  lines: string[];
}
export interface PublicOrder {
  number: string;
  legacy_number?: string | null;
  shipping_note?: string;
  shipments: Shipment[];
  token?: string;
  duplicate?: boolean;
  created_at: string;
  status: string;
  payment_status: string;
  catalogue: string;
  currency: string;
  symbol: string;
  subtotal_minor: number;
  prices_pending: boolean;
  items: OrderLine[];
  carrier: string | null;
  tracking: string | null;
  delivery: { recipient_name: string; address1: string; address2: string | null; city: string; region: string | null; postcode: string | null; country: string } | null;
  updates: { at: string; detail: string }[];
}

export function newKey(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
