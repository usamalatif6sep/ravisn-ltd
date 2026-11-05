export type Availability = "available" | "pending" | "unavailable";
export type Severity = "blocker" | "warning" | "info";
export type QtyBasis = "reported" | "minimum" | "confirmed";
export type PriceMode = "rule" | "imported" | "override";

export interface Country {
  key: string;
  name: string;
  prefix: string;
  currency: string;
  symbol: string;
  markup_bp: number;
  min_margin_minor: number;
  count: number;
  categories: string[];
  stock_text: string;
  currency_text: string;
}

export interface Status {
  name: string;
  availability: Availability;
  definition: string;
  sort: number;
}

export interface Meta {
  imported: boolean;
  countries: Country[];
  statuses: Status[];
  settings: { company: string; whatsapp_display: string; whatsapp_link: string; email: string };
  review: Partial<Record<Severity, number>>;
  version: string;
  data_dir: string;
  suppliers?: { id: number; name: string }[];
}

export interface Tier {
  label: string;
  price_minor?: number;
  cost_minor?: number;
}

export interface IssueCounts {
  blocker: number;
  warning: number;
  info: number;
}

export interface ItemRow {
  id: number;
  code: string;
  seq: number;
  name: string;
  variant: string | null;
  category: string;
  status: string;
  qty: number | null;
  qty_basis: QtyBasis;
  price_minor: number | null;
  price_tiers: Tier[];
  price_mode: PriceMode;
  link: string | null;
  archived: boolean;
  issues: IssueCounts;
  supplier_id?: number | null;
  supplier?: string | null;
  cost_minor?: number | null;
  cost_tiers?: Tier[];
  item_ref?: string | null;
  supplier_sku?: string | null;
}

export interface ItemIssue {
  id: number;
  kind: string;
  severity: Severity;
  detail: string;
  state: "open" | "dismissed" | "resolved";
  note: string | null;
  title: string;
  private: boolean;
}

export interface HistoryEntry {
  id: number;
  at: string;
  action: string;
  changes: Record<string, [unknown, unknown]>;
  note: string | null;
}

export interface PrivateDetail {
  supplier_id: number | null;
  supplier: string | null;
  supplier_phone: string | null;
  supplier_whatsapp: string | null;
  cost_minor: number | null;
  cost_tiers: Tier[];
  item_ref: string | null;
  supplier_sku: string | null;
  source_tab: string | null;
  source_row: number | null;
  source_link: string | null;
  note: string | null;
  source_data: Record<string, unknown> | null;
  rule_price_minor: number | null;
}

export interface ItemDetail {
  id: number;
  code: string;
  country: string;
  seq: number;
  name: string;
  variant: string | null;
  category: string;
  status: string;
  availability: Availability;
  qty: number | null;
  qty_basis: QtyBasis;
  qty_confirmed_at: string | null;
  price_minor: number | null;
  price_mode: PriceMode;
  price_note: string | null;
  price_tiers: Tier[];
  link: string | null;
  link_label: string | null;
  more_link: string | null;
  more_link_label: string | null;
  export_link: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  issues: ItemIssue[];
  private?: PrivateDetail;
  original: { public: Record<string, unknown>; private?: Record<string, unknown> } | null;
  history: HistoryEntry[];
}

export interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  whatsapp_link: string | null;
  other_numbers: string | null;
  emails: string | null;
  whatsapp_groups: string | null;
  shown_in_sheet: string | null;
  note: string | null;
  verified_at: string | null;
  counts: Record<string, number>;
  total: number;
}

export interface ReviewKind {
  kind: string;
  title: string;
  severity: Severity;
  description: string;
  private: boolean;
  open: number;
  dismissed: number;
  resolved: number;
  by_country: Record<string, number>;
}

export interface ReviewIssue {
  id: number;
  kind: string;
  severity: Severity;
  country: string | null;
  item_id: number | null;
  supplier_id: number | null;
  group_key: string | null;
  detail: string;
  state: string;
  note: string | null;
  code: string | null;
  name: string | null;
  status: string | null;
  qty: number | null;
  supplier_name: string | null;
}

export interface Precheck {
  country: string;
  total: number;
  exportable: number;
  blocked: { id: number; code: string; name: string; reasons: string[] }[];
  global_leaks: { where: string; found: string }[];
  warnings: { kind: string; title: string; count: number }[];
}
