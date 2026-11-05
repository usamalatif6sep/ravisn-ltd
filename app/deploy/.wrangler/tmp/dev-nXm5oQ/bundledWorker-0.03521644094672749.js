var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/pages-1imCC1/bundledWorker-0.03521644094672749.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var RULES = { "GB": { "code": "GB", "name": "United Kingdom", "dial": "44", "postcode": "(GIR ?0AA|[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2})", "postcode_label": "Postcode", "postcode_example": "SW1A 1AA", "region_label": "County", "regions": [], "region_required": false }, "US": { "code": "US", "name": "United States", "dial": "1", "postcode": "\\d{5}(-\\d{4})?", "postcode_label": "ZIP code", "postcode_example": "10001", "region_label": "State", "regions": [{ "code": "AL", "name": "Alabama" }, { "code": "AK", "name": "Alaska" }, { "code": "AZ", "name": "Arizona" }, { "code": "AR", "name": "Arkansas" }, { "code": "CA", "name": "California" }, { "code": "CO", "name": "Colorado" }, { "code": "CT", "name": "Connecticut" }, { "code": "DE", "name": "Delaware" }, { "code": "DC", "name": "District of Columbia" }, { "code": "FL", "name": "Florida" }, { "code": "GA", "name": "Georgia" }, { "code": "HI", "name": "Hawaii" }, { "code": "ID", "name": "Idaho" }, { "code": "IL", "name": "Illinois" }, { "code": "IN", "name": "Indiana" }, { "code": "IA", "name": "Iowa" }, { "code": "KS", "name": "Kansas" }, { "code": "KY", "name": "Kentucky" }, { "code": "LA", "name": "Louisiana" }, { "code": "ME", "name": "Maine" }, { "code": "MD", "name": "Maryland" }, { "code": "MA", "name": "Massachusetts" }, { "code": "MI", "name": "Michigan" }, { "code": "MN", "name": "Minnesota" }, { "code": "MS", "name": "Mississippi" }, { "code": "MO", "name": "Missouri" }, { "code": "MT", "name": "Montana" }, { "code": "NE", "name": "Nebraska" }, { "code": "NV", "name": "Nevada" }, { "code": "NH", "name": "New Hampshire" }, { "code": "NJ", "name": "New Jersey" }, { "code": "NM", "name": "New Mexico" }, { "code": "NY", "name": "New York" }, { "code": "NC", "name": "North Carolina" }, { "code": "ND", "name": "North Dakota" }, { "code": "OH", "name": "Ohio" }, { "code": "OK", "name": "Oklahoma" }, { "code": "OR", "name": "Oregon" }, { "code": "PA", "name": "Pennsylvania" }, { "code": "PR", "name": "Puerto Rico" }, { "code": "RI", "name": "Rhode Island" }, { "code": "SC", "name": "South Carolina" }, { "code": "SD", "name": "South Dakota" }, { "code": "TN", "name": "Tennessee" }, { "code": "TX", "name": "Texas" }, { "code": "UT", "name": "Utah" }, { "code": "VT", "name": "Vermont" }, { "code": "VA", "name": "Virginia" }, { "code": "WA", "name": "Washington" }, { "code": "WV", "name": "West Virginia" }, { "code": "WI", "name": "Wisconsin" }, { "code": "WY", "name": "Wyoming" }], "region_required": true }, "CA": { "code": "CA", "name": "Canada", "dial": "1", "postcode": "[ABCEGHJ-NPRSTVXY]\\d[ABCEGHJ-NPRSTV-Z] ?\\d[ABCEGHJ-NPRSTV-Z]\\d", "postcode_label": "Postal code", "postcode_example": "K1A 0B1", "region_label": "Province or territory", "regions": [{ "code": "AB", "name": "Alberta" }, { "code": "BC", "name": "British Columbia" }, { "code": "MB", "name": "Manitoba" }, { "code": "NB", "name": "New Brunswick" }, { "code": "NL", "name": "Newfoundland and Labrador" }, { "code": "NS", "name": "Nova Scotia" }, { "code": "NT", "name": "Northwest Territories" }, { "code": "NU", "name": "Nunavut" }, { "code": "ON", "name": "Ontario" }, { "code": "PE", "name": "Prince Edward Island" }, { "code": "QC", "name": "Quebec" }, { "code": "SK", "name": "Saskatchewan" }, { "code": "YT", "name": "Yukon" }], "region_required": true }, "DE": { "code": "DE", "name": "Germany", "dial": "49", "postcode": "\\d{5}", "postcode_label": "Postleitzahl (postcode)", "postcode_example": "10115", "region_label": "State", "regions": [], "region_required": false }, "AU": { "code": "AU", "name": "Australia", "dial": "61", "postcode": "\\d{4}", "postcode_label": "Postcode", "postcode_example": "2000", "region_label": "State or territory", "regions": [{ "code": "ACT", "name": "Australian Capital Territory" }, { "code": "NSW", "name": "New South Wales" }, { "code": "NT", "name": "Northern Territory" }, { "code": "QLD", "name": "Queensland" }, { "code": "SA", "name": "South Australia" }, { "code": "TAS", "name": "Tasmania" }, { "code": "VIC", "name": "Victoria" }, { "code": "WA", "name": "Western Australia" }], "region_required": true }, "IE": { "code": "IE", "name": "Ireland", "dial": "353", "postcode": "([AC-FHKNPRTV-Y]\\d{2}|D6W) ?[0-9AC-FHKNPRTV-Y]{4}", "postcode_label": "Eircode", "postcode_example": "D02 X285", "region_label": "County", "regions": [], "region_required": false }, "FR": { "code": "FR", "name": "France", "dial": "33", "postcode": "\\d{5}", "postcode_label": "Code postal", "postcode_example": "75001", "region_label": "Region", "regions": [], "region_required": false }, "NL": { "code": "NL", "name": "Netherlands", "dial": "31", "postcode": "\\d{4} ?[A-Z]{2}", "postcode_label": "Postcode", "postcode_example": "1012 AB", "region_label": "Province", "regions": [], "region_required": false }, "BE": { "code": "BE", "name": "Belgium", "dial": "32", "postcode": "\\d{4}", "postcode_label": "Postcode", "postcode_example": "1000", "region_label": "Province", "regions": [], "region_required": false }, "ES": { "code": "ES", "name": "Spain", "dial": "34", "postcode": "\\d{5}", "postcode_label": "Codigo postal", "postcode_example": "28001", "region_label": "Province", "regions": [], "region_required": false }, "IT": { "code": "IT", "name": "Italy", "dial": "39", "postcode": "\\d{5}", "postcode_label": "CAP", "postcode_example": "00184", "region_label": "Province", "regions": [], "region_required": false }, "AT": { "code": "AT", "name": "Austria", "dial": "43", "postcode": "\\d{4}", "postcode_label": "Postcode", "postcode_example": "1010", "region_label": "State", "regions": [], "region_required": false }, "CH": { "code": "CH", "name": "Switzerland", "dial": "41", "postcode": "\\d{4}", "postcode_label": "Postcode", "postcode_example": "8001", "region_label": "Canton", "regions": [], "region_required": false }, "SE": { "code": "SE", "name": "Sweden", "dial": "46", "postcode": "\\d{3} ?\\d{2}", "postcode_label": "Postcode", "postcode_example": "111 22", "region_label": "County", "regions": [], "region_required": false }, "DK": { "code": "DK", "name": "Denmark", "dial": "45", "postcode": "\\d{4}", "postcode_label": "Postcode", "postcode_example": "1050", "region_label": "Region", "regions": [], "region_required": false }, "NO": { "code": "NO", "name": "Norway", "dial": "47", "postcode": "\\d{4}", "postcode_label": "Postcode", "postcode_example": "0150", "region_label": "County", "regions": [], "region_required": false }, "PL": { "code": "PL", "name": "Poland", "dial": "48", "postcode": "\\d{2}-\\d{3}", "postcode_label": "Postcode", "postcode_example": "00-001", "region_label": "Voivodeship", "regions": [], "region_required": false }, "PT": { "code": "PT", "name": "Portugal", "dial": "351", "postcode": "\\d{4}-\\d{3}", "postcode_label": "Postcode", "postcode_example": "1000-001", "region_label": "District", "regions": [], "region_required": false }, "NZ": { "code": "NZ", "name": "New Zealand", "dial": "64", "postcode": "\\d{4}", "postcode_label": "Postcode", "postcode_example": "6011", "region_label": "Region", "regions": [], "region_required": false }, "AE": { "code": "AE", "name": "United Arab Emirates", "dial": "971", "postcode": null, "postcode_label": "", "postcode_example": "", "region_label": "Emirate", "regions": [], "region_required": false }, "SA": { "code": "SA", "name": "Saudi Arabia", "dial": "966", "postcode": "\\d{5}(-\\d{4})?", "postcode_label": "Postal code", "postcode_example": "11564", "region_label": "Province", "regions": [], "region_required": false }, "PK": { "code": "PK", "name": "Pakistan", "dial": "92", "postcode": "\\d{5}", "postcode_label": "Postal code", "postcode_example": "54000", "region_label": "Province", "regions": [], "region_required": false }, "IN": { "code": "IN", "name": "India", "dial": "91", "postcode": "\\d{6}", "postcode_label": "PIN code", "postcode_example": "110001", "region_label": "State", "regions": [], "region_required": false }, "SG": { "code": "SG", "name": "Singapore", "dial": "65", "postcode": "\\d{6}", "postcode_label": "Postal code", "postcode_example": "018989", "region_label": "", "regions": [], "region_required": false }, "MY": { "code": "MY", "name": "Malaysia", "dial": "60", "postcode": "\\d{5}", "postcode_label": "Postcode", "postcode_example": "50088", "region_label": "State", "regions": [], "region_required": false }, "ZA": { "code": "ZA", "name": "South Africa", "dial": "27", "postcode": "\\d{4}", "postcode_label": "Postal code", "postcode_example": "8001", "region_label": "Province", "regions": [], "region_required": false } };
var ORDER_STATUSES = ["New", "Awaiting confirmation", "Supplier contacted", "Processing", "Dispatched", "Delivered", "Cancelled"];
var PAYMENT_STATUSES = ["Pending confirmation", "Awaiting payment", "Paid", "Refunded"];
var CLOSED = ["Delivered", "Cancelled"];
var WHATSAPP = "+92 342 6290958";
var TEAM_JOINED = "You're now chatting with the Ravisn Ltd team.";
var TEAM_AWAY = "Need a little more help? You can leave us a message here, and we'll get back to you. For urgent assistance, you can also contact us on WhatsApp.";
var TEAM_REQUESTED = "Thanks. A member of the Ravisn Ltd team will join this chat as soon as they can. You can keep typing here.";
var LEFT_MESSAGE = "Thanks, your message has been saved. The Ravisn Ltd team will reply here or contact you using the details you gave.";
var LIMITS = { order: [6, 3600], order_day: [20, 86400], chat_start: [10, 3600], chat_msg: [40, 600] };
var RETENTION = { chat_days: 90, order_personal_days: 730 };
var MAX_BODY = 64 * 1024;
var SHIPPING_NOTE = "Shipping is arranged and paid for by the reseller. You may provide your own prepaid label or request a shipping quote from Ravisn.";
var LABEL_MAX = 15e5;
var LABEL_EXT = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
var SCHEMA = [
  "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  `CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, idem_key TEXT UNIQUE, created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL, catalogue TEXT NOT NULL, currency TEXT NOT NULL, symbol TEXT NOT NULL, subtotal_minor INTEGER NOT NULL,
     prices_pending INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, payment_status TEXT NOT NULL, customer_name TEXT NOT NULL, email TEXT NOT NULL,
     phone TEXT NOT NULL, recipient_name TEXT NOT NULL, address_country TEXT NOT NULL, address1 TEXT NOT NULL, address2 TEXT, city TEXT NOT NULL,
     region TEXT, postcode TEXT, instructions TEXT, carrier TEXT, tracking TEXT, release INTEGER, client TEXT, seen_at TEXT, erased_at TEXT,
     legacy_number TEXT UNIQUE)`,
  `CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, option TEXT,
     qty INTEGER NOT NULL, unit_minor INTEGER, line_minor INTEGER, status TEXT NOT NULL, link TEXT, legacy_code TEXT, shipment_id INTEGER)`,
  "CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)",
  `CREATE TABLE IF NOT EXISTS shipments (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, arranged_by TEXT NOT NULL, carrier TEXT, service TEXT,
     tracking TEXT, instructions TEXT, label_status TEXT NOT NULL DEFAULT 'none', label_note TEXT, charge_minor INTEGER,
     payment_status TEXT NOT NULL DEFAULT 'not_applicable', address_requested INTEGER NOT NULL DEFAULT 0, dispatch_status TEXT NOT NULL DEFAULT 'pending',
     dispatched_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS labels (id INTEGER PRIMARY KEY, shipment_id INTEGER NOT NULL, filename TEXT NOT NULL, content_type TEXT NOT NULL,
     size INTEGER NOT NULL, sha256 TEXT NOT NULL, data BLOB NOT NULL, uploaded_at TEXT NOT NULL, current INTEGER NOT NULL DEFAULT 1)`,
  "CREATE TABLE IF NOT EXISTS order_events (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, at TEXT NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL)",
  `CREATE TABLE IF NOT EXISTS chats (id INTEGER PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
     last_message_at TEXT, status TEXT NOT NULL, mode TEXT NOT NULL, name TEXT, contact TEXT, page TEXT, unread INTEGER NOT NULL DEFAULT 0, client TEXT)`,
  "CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY, chat_id INTEGER NOT NULL, at TEXT NOT NULL, sender TEXT NOT NULL, body TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS chat_messages_chat ON chat_messages(chat_id, id)",
  "CREATE TABLE IF NOT EXISTS rate (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires REAL NOT NULL)"
];
var StoreError = class extends Error {
  static {
    __name(this, "StoreError");
  }
  static {
    __name2(this, "StoreError");
  }
  constructor(message2, status = 422, fields = {}) {
    super(message2);
    this.status = status;
    this.fields = fields;
  }
};
var now = /* @__PURE__ */ __name2(() => (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z"), "now");
var enc = new TextEncoder();
async function hmac(secret, text2) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text2)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hmac, "hmac");
__name2(hmac, "hmac");
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
__name(same, "same");
__name2(same, "same");
var sign = /* @__PURE__ */ __name2(async (env, kind, value) => (await hmac(env.STORE_SECRET, `${kind}:${value}`)).slice(0, 32), "sign");
async function checkToken(env, kind, value, token) {
  if (!token || !same(await sign(env, kind, value), token)) throw new StoreError("Not found", 404);
}
__name(checkToken, "checkToken");
__name2(checkToken, "checkToken");
function randomId() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(randomId, "randomId");
__name2(randomId, "randomId");
var ready = null;
function schema(env) {
  ready ??= env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}
__name(schema, "schema");
__name2(schema, "schema");
var one = /* @__PURE__ */ __name2((env, sql, ...args) => env.DB.prepare(sql).bind(...args).first(), "one");
var all = /* @__PURE__ */ __name2(async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results, "all");
var run = /* @__PURE__ */ __name2((env, sql, ...args) => env.DB.prepare(sql).bind(...args).run(), "run");
async function getMeta(env, key, fallback = null) {
  const r = await one(env, "SELECT value FROM meta WHERE key = ?", key);
  return r ? JSON.parse(r.value) : fallback;
}
__name(getMeta, "getMeta");
__name2(getMeta, "getMeta");
var setMeta = /* @__PURE__ */ __name2((env, key, value) => run(env, "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, JSON.stringify(value)), "setMeta");
async function allow(env, scope, who) {
  const [limit, windowS] = LIMITS[scope];
  const t = Date.now() / 1e3;
  const bucket = `${scope}:${who}`;
  await run(env, "DELETE FROM rate WHERE expires < ?", t);
  const row = await one(env, "SELECT count FROM rate WHERE bucket = ?", bucket);
  if (row && row.count >= limit) return false;
  if (row) await run(env, "UPDATE rate SET count = count + 1 WHERE bucket = ?", bucket);
  else await run(env, "INSERT INTO rate (bucket, count, expires) VALUES (?, 1, ?)", bucket, t + windowS);
  return true;
}
__name(allow, "allow");
__name2(allow, "allow");
async function clientHash(env, request) {
  return (await hmac(env.STORE_SECRET, `ip:${request.headers.get("CF-Connecting-IP") || "-"}`)).slice(0, 24);
}
__name(clientHash, "clientHash");
__name2(clientHash, "clientHash");
async function asset(env, request, path) {
  const res = await env.ASSETS.fetch(new Request(new URL(path, request.url), { method: "GET" }));
  if (!res.ok) throw new StoreError("Ordering is not available right now", 503);
  return res.json();
}
__name(asset, "asset");
__name2(asset, "asset");
async function catalogue(env, request, slug) {
  const site = await asset(env, request, "/data/site.json");
  const country = site.countries.find((c) => c.slug === slug);
  if (!country) throw new StoreError("Choose the catalogue country for this order");
  const products = await asset(env, request, `/data/${slug}.json`);
  const map = new Map(products.filter((p) => p.legacy).map((p) => [p.legacy.toUpperCase(), p]));
  for (const p of products) map.set(p.code.toUpperCase(), p);
  return { site, country, products: map };
}
__name(catalogue, "catalogue");
__name2(catalogue, "catalogue");
var CTRL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
var EMAIL = /^[^@\s]{1,64}@[^@\s]+\.[A-Za-z]{2,24}$/;
function text(body, field, label, errors, { required = true, max = 100, min = 2, multiline = false } = {}) {
  let v = body[field] == null ? "" : String(body[field]);
  v = (multiline ? v : v.replace(/\n/g, " ")).replace(CTRL, "").trim();
  if (!multiline) v = v.replace(/\s+/g, " ");
  if (!v) {
    if (required) errors[field] = `Enter the ${label}`;
    return null;
  }
  if (v.length < min) errors[field] = `Enter the full ${label}`;
  else if (v.length > max) errors[field] = `Keep the ${label} under ${max} characters`;
  return v;
}
__name(text, "text");
__name2(text, "text");
function normalisePostcode(country, value) {
  let v = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
  if ((country === "GB" || country === "CA") && !v.includes(" ") && v.length > 3) v = `${v.slice(0, -3)} ${v.slice(-3)}`;
  return v;
}
__name(normalisePostcode, "normalisePostcode");
__name2(normalisePostcode, "normalisePostcode");
function checkPostcode(rule, v) {
  if (!rule) return v.length <= 12 ? null : "Enter a shorter postcode";
  if (!rule.postcode) return null;
  if (!v) return `Enter the ${rule.postcode_label.toLowerCase()}`;
  if (!new RegExp(`^(?:${rule.postcode})$`).test(v)) return `Enter a valid ${rule.postcode_label.toLowerCase()}, for example ${rule.postcode_example}`;
  return null;
}
__name(checkPostcode, "checkPostcode");
__name2(checkPostcode, "checkPostcode");
function checkRegion(rule, v) {
  if (!rule) return null;
  if (rule.regions.length) {
    if (!v) return rule.region_required ? `Choose the ${rule.region_label.toLowerCase()}` : null;
    if (!rule.regions.some((r) => r.code === v.toUpperCase())) return `Choose the ${rule.region_label.toLowerCase()} from the list`;
  } else if (rule.region_required && !v) return `Enter the ${rule.region_label.toLowerCase()}`;
  return null;
}
__name(checkRegion, "checkRegion");
__name2(checkRegion, "checkRegion");
function normalisePhone(dial, number) {
  const d = String(dial || "").replace(/\D/g, "");
  const raw = String(number || "").trim();
  let national;
  if (raw.startsWith("+")) {
    const digits = raw.replace(/\D/g, "");
    if (!d || !digits.startsWith(d)) return [null, "Choose the country code that matches the number, or type the number without the + prefix"];
    national = digits.slice(d.length);
  } else {
    national = raw.replace(/\D/g, "");
    if (d !== "39") national = national.replace(/^0+/, "");
  }
  if (!d || d.length > 3) return [null, "Choose a country code"];
  const total = d.length + national.length;
  if (!national || total < 8 || total > 15) return [null, "Enter a complete phone number"];
  return [`+${d}${national}`, null];
}
__name(normalisePhone, "normalisePhone");
__name2(normalisePhone, "normalisePhone");
function unitPrice(p, option) {
  const tiers = p.tiers || [];
  if (tiers.length) {
    const t = tiers.find(([label]) => label === option);
    return t ? [t[1], option, null] : [null, null, "Choose an option"];
  }
  if (option) return [null, null, "This product has no options"];
  return [p.price, null, null];
}
__name(unitPrice, "unitPrice");
__name2(unitPrice, "unitPrice");
async function validateOrder(env, request, body) {
  const errors = {};
  const slug = String(body.catalogue || "").toLowerCase();
  const { site, country, products } = await catalogue(env, request, slug);
  const raw = body.items;
  if (!Array.isArray(raw) || !raw.length) throw new StoreError("Your order is empty. Add at least one product.");
  if (raw.length > 60) throw new StoreError("An order can hold up to 60 different products. Split it into two orders.");
  const merged = /* @__PURE__ */ new Map();
  for (const it of raw) {
    if (!it || typeof it !== "object") throw new StoreError("The order could not be read. Reload the page and try again.");
    const typed = String(it.code || "").trim().toUpperCase();
    const option = it.option == null ? null : String(it.option).trim() || null;
    const qty = Number.isInteger(Number(it.qty)) ? Number(it.qty) : 0;
    if (qty < 1 || qty > 999) throw new StoreError(`Enter a quantity between 1 and 999 for ${typed || "each product"}`);
    const code = (products.get(typed)?.code || typed).toUpperCase();
    const k = `${code}\0${option ?? ""}`;
    merged.set(k, { code, option, qty: (merged.get(k)?.qty || 0) + qty });
  }
  const lines = [];
  let subtotal = 0;
  let pending = false;
  for (const { code, option, qty } of merged.values()) {
    const p = products.get(code);
    if (!p) throw new StoreError(`${code} is no longer in the ${country.name} catalogue. Remove it from your order.`);
    if (p.availability === "unavailable") throw new StoreError(`${code} is out of stock. Remove it from your order.`);
    if (qty > 999) throw new StoreError(`Order at most 999 of ${code}`);
    const [price, opt, err] = unitPrice(p, option);
    if (err) throw new StoreError(`${code}: ${err}`);
    const line = price == null ? null : price * qty;
    pending ||= price == null;
    subtotal += line || 0;
    lines.push({ code: p.code, legacy_code: p.legacy ?? null, name: p.name + (p.variant ? `, ${p.variant}` : ""), option: opt, qty, unit_minor: price ?? null, line_minor: line, status: p.status, link: p.link ?? null });
  }
  const out = { catalogue: slug, country_key: country.key, currency: country.currency, symbol: country.symbol, lines, subtotal_minor: subtotal, prices_pending: pending, release: site.release ?? null };
  out.customer_name = text(body, "customer_name", "your name or business name", errors);
  const email = text(body, "email", "email address", errors, { max: 254, min: 6 });
  if (email && !EMAIL.test(email)) errors.email = "Enter an email address like name@example.com";
  out.email = email ? email.toLowerCase() : null;
  const [phone, perr] = normalisePhone(body.phone_dial, body.phone);
  if (perr) errors.phone = perr;
  out.phone = phone;
  out.recipient_name = text(body, "recipient_name", "recipient's full name", errors);
  const dest = String(body.address_country || "").toUpperCase();
  const rule = RULES?.[dest];
  if (!rule) errors.address_country = "Choose the delivery country";
  out.address_country = dest;
  out.address1 = text(body, "address1", "first line of the address", errors, { max: 120, min: 3 });
  out.address2 = text(body, "address2", "second address line", errors, { required: false, max: 120, min: 1 });
  out.city = text(body, "city", "city or town", errors, { max: 80 });
  let region = text(body, "region", "state, province or county", errors, { required: false, max: 80, min: 1 });
  if (rule) {
    const rerr = checkRegion(rule, region || "");
    if (rerr) errors.region = rerr;
    if (region && rule.regions.length) region = region.toUpperCase();
    const pc = normalisePostcode(dest, body.postcode);
    const pcErr = checkPostcode(rule, pc);
    if (pcErr) errors.postcode = pcErr;
    out.postcode = pc || null;
  }
  out.region = region;
  out.instructions = text(body, "instructions", "special instructions", errors, { required: false, max: 1500, min: 1, multiline: true });
  if (body.confirmed !== true) errors.confirmed = "Please confirm you have reviewed the item, variation and quantity";
  const ship = body.shipping && typeof body.shipping === "object" ? body.shipping : {};
  const method = ship.method || "reseller";
  if (!["reseller", "ravisn"].includes(method)) errors.shipping = "Choose who arranges shipping";
  out.shipping = { method };
  for (const [f, label, max] of [["carrier", "carrier", 60], ["service", "shipping service", 60], ["tracking", "tracking number", 80], ["instructions", "shipping instructions", 800]])
    out.shipping[f] = text(ship, f, label, errors, { required: false, max, min: 1, multiline: f === "instructions" });
  if (Object.keys(errors).length) throw new StoreError("Some details need your attention", 422, errors);
  return out;
}
__name(validateOrder, "validateOrder");
__name2(validateOrder, "validateOrder");
var findOrder = /* @__PURE__ */ __name2((env, number) => one(env, "SELECT * FROM orders WHERE number = ? OR legacy_number = ?", String(number).toUpperCase(), String(number).toUpperCase()), "findOrder");
async function shipments(env, orderId, admin = false) {
  const out = [];
  for (const s of await all(env, "SELECT * FROM shipments WHERE order_id = ? ORDER BY id", orderId)) {
    const label = await one(env, "SELECT id, filename, content_type, size, uploaded_at FROM labels WHERE shipment_id = ? AND current = 1", s.id);
    const lines = await all(env, "SELECT id, code FROM order_items WHERE shipment_id = ? ORDER BY id", s.id);
    const d = {
      id: s.id,
      arranged_by: s.arranged_by,
      carrier: s.carrier,
      service: s.service,
      tracking: s.tracking,
      instructions: s.instructions,
      label_status: s.label_status,
      label_note: s.label_note,
      charge_minor: s.charge_minor,
      payment_status: s.payment_status,
      address_requested: !!s.address_requested,
      dispatch_status: s.dispatch_status,
      dispatched_at: s.dispatched_at,
      label: label || null,
      lines: lines.map((l) => l.code)
    };
    if (admin) d.line_ids = lines.map((l) => l.id);
    out.push(d);
  }
  return out;
}
__name(shipments, "shipments");
__name2(shipments, "shipments");
async function publicOrder(env, number) {
  const o = await findOrder(env, number);
  if (!o) throw new StoreError("Not found", 404);
  const items = await all(env, "SELECT code, legacy_code, name, option, qty, unit_minor, line_minor FROM order_items WHERE order_id = ? ORDER BY id", o.id);
  const updates = await all(env, "SELECT at, detail FROM order_events WHERE order_id = ? AND kind IN ('created','status','payment','tracking','message','shipping','reference') ORDER BY id", o.id);
  return {
    number: o.number,
    legacy_number: o.legacy_number,
    shipments: await shipments(env, o.id),
    shipping_note: SHIPPING_NOTE,
    created_at: o.created_at,
    status: o.status,
    payment_status: o.payment_status,
    catalogue: o.catalogue,
    currency: o.currency,
    symbol: o.symbol,
    subtotal_minor: o.subtotal_minor,
    prices_pending: !!o.prices_pending,
    items,
    carrier: o.carrier,
    tracking: o.tracking,
    delivery: o.erased_at ? null : { recipient_name: o.recipient_name, address1: o.address1, address2: o.address2, city: o.city, region: o.region, postcode: o.postcode, country: o.address_country },
    updates
  };
}
__name(publicOrder, "publicOrder");
__name2(publicOrder, "publicOrder");
async function createOrder(env, clean, idemKey, who) {
  idemKey = (idemKey || "").slice(0, 80) || null;
  if (idemKey) {
    const r = await one(env, "SELECT number FROM orders WHERE idem_key = ?", idemKey);
    if (r) return { ...await publicOrder(env, r.number), token: await sign(env, "order", r.number), duplicate: true };
  }
  const fp = (await hmac(env.STORE_SECRET, JSON.stringify([clean.email, clean.catalogue, clean.lines.map((l) => [l.code, l.option || "", l.qty]).sort(), clean.address1, clean.postcode]))).slice(0, 24);
  const since = new Date(Date.now() - 10 * 60 * 1e3).toISOString().replace(/\.\d{3}Z$/, "Z");
  const dup = await one(env, "SELECT number FROM orders WHERE client = ? AND created_at >= ?", `${who}:${fp}`, since);
  if (dup) return { ...await publicOrder(env, dup.number), token: await sign(env, "order", dup.number), duplicate: true };
  const ts = now();
  const year = ts.slice(0, 4);
  for (let attempt = 0; attempt < 3; attempt++) {
    const seq = await one(env, "INSERT INTO counters (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value", `order:${year}`);
    const number = `RVS-${year}-${String(seq.value).padStart(6, "0")}`;
    const s = clean.shipping || { method: "reseller" };
    try {
      const ins = env.DB.prepare(
        `INSERT INTO orders (number, idem_key, created_at, updated_at, catalogue, currency, symbol, subtotal_minor, prices_pending, status, payment_status,
           customer_name, email, phone, recipient_name, address_country, address1, address2, city, region, postcode, instructions, release, client)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', 'Pending confirmation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        number,
        idemKey,
        ts,
        ts,
        clean.country_key,
        clean.currency,
        clean.symbol,
        clean.subtotal_minor,
        clean.prices_pending ? 1 : 0,
        clean.customer_name,
        clean.email,
        clean.phone,
        clean.recipient_name,
        clean.address_country,
        clean.address1,
        clean.address2,
        clean.city,
        clean.region,
        clean.postcode,
        clean.instructions,
        clean.release,
        `${who}:${fp}`
      );
      const sh = env.DB.prepare(`INSERT INTO shipments (order_id, arranged_by, carrier, service, tracking, instructions, payment_status, created_at, updated_at)
          VALUES ((SELECT id FROM orders WHERE number = ?), ?, ?, ?, ?, ?, ?, ?, ?)`).bind(number, s.method, s.carrier ?? null, s.service ?? null, s.tracking ?? null, s.instructions ?? null, s.method === "ravisn" ? "quote_pending" : "not_applicable", ts, ts);
      const lines = clean.lines.map((l) => env.DB.prepare(`INSERT INTO order_items (order_id, code, legacy_code, name, option, qty, unit_minor, line_minor, status, link, shipment_id)
            VALUES ((SELECT id FROM orders WHERE number = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT MAX(id) FROM shipments WHERE order_id = (SELECT id FROM orders WHERE number = ?)))`).bind(number, l.code, l.legacy_code, l.name, l.option, l.qty, l.unit_minor, l.line_minor, l.status, l.link, number));
      const ev = env.DB.prepare("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES ((SELECT id FROM orders WHERE number = ?), ?, 'reseller', 'created', ?)").bind(number, ts, `Order request sent with ${clean.lines.length} product(s); shipping ${s.method === "ravisn" ? "to be quoted by Ravisn" : "arranged by the reseller"}`);
      await env.DB.batch([ins, sh, ...lines, ev]);
      return { ...await publicOrder(env, number), token: await sign(env, "order", number), duplicate: false };
    } catch (e) {
      if (!/UNIQUE/i.test(String(e))) throw e;
      if (idemKey) {
        const r = await one(env, "SELECT number FROM orders WHERE idem_key = ?", idemKey);
        if (r) return { ...await publicOrder(env, r.number), token: await sign(env, "order", r.number), duplicate: true };
      }
    }
  }
  throw new StoreError("Please try again in a moment", 503);
}
__name(createOrder, "createOrder");
__name2(createOrder, "createOrder");
async function teamOnline(env) {
  const p = await getMeta(env, "presence");
  return !!(p && p.online && Date.now() / 1e3 - Number(p.at || 0) < 120);
}
__name(teamOnline, "teamOnline");
__name2(teamOnline, "teamOnline");
async function chatRow(env, id, token) {
  await checkToken(env, "chat", id, token);
  const c = await one(env, "SELECT * FROM chats WHERE public_id = ?", id);
  if (!c || c.status === "archived") throw new StoreError("This chat has ended. Start a new one.", 410);
  return c;
}
__name(chatRow, "chatRow");
__name2(chatRow, "chatRow");
function message(t, max = 1e3) {
  const v = String(t ?? "").replace(CTRL, "").trim();
  if (!v) throw new StoreError("Type a message first");
  if (v.length > max) throw new StoreError(`Keep messages under ${max} characters`);
  return v;
}
__name(message, "message");
__name2(message, "message");
async function addMessage(env, chatId, sender, body, unread = false) {
  const ts = now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO chat_messages (chat_id, at, sender, body) VALUES (?, ?, ?, ?)").bind(chatId, ts, sender, body),
    env.DB.prepare("UPDATE chats SET updated_at = ?, last_message_at = ?, unread = unread + ? WHERE id = ?").bind(ts, ts, unread ? 1 : 0, chatId)
  ]);
}
__name(addMessage, "addMessage");
__name2(addMessage, "addMessage");
async function chatState(env, id, token, after = 0) {
  const c = await chatRow(env, id, token);
  const messages = await all(env, "SELECT id, at, sender, body FROM chat_messages WHERE chat_id = ? AND id > ? ORDER BY id LIMIT 200", c.id, after);
  return { mode: c.mode, status: c.status, team_online: await teamOnline(env), messages };
}
__name(chatState, "chatState");
__name2(chatState, "chatState");
async function adminOrder(env, number, markSeen = true) {
  const o = await findOrder(env, number);
  if (!o) throw new StoreError("Not found", 404);
  if (markSeen && !o.seen_at) await run(env, "UPDATE orders SET seen_at = ? WHERE id = ?", now(), o.id);
  const { idem_key, client, ...d } = o;
  d.items = await all(env, "SELECT * FROM order_items WHERE order_id = ? ORDER BY id", o.id);
  d.shipments = await shipments(env, o.id, true);
  d.events = await all(env, "SELECT at, actor, kind, detail FROM order_events WHERE order_id = ? ORDER BY id", o.id);
  d.address_country_name = RULES?.[o.address_country]?.name ?? o.address_country;
  return d;
}
__name(adminOrder, "adminOrder");
__name2(adminOrder, "adminOrder");
async function summary(env) {
  await purgeIfDue(env);
  const q = /* @__PURE__ */ __name2(async (sql, ...a) => (await one(env, sql, ...a)).n, "q");
  return {
    new_orders: await q("SELECT COUNT(*) AS n FROM orders WHERE seen_at IS NULL"),
    open_orders: await q("SELECT COUNT(*) AS n FROM orders WHERE status NOT IN (?, ?)", ...CLOSED),
    unread_chats: await q("SELECT COUNT(*) AS n FROM chats WHERE unread > 0 AND status != 'archived'"),
    waiting_chats: await q("SELECT COUNT(*) AS n FROM chats WHERE mode = 'waiting' AND status = 'open'"),
    online: await teamOnline(env)
  };
}
__name(summary, "summary");
__name2(summary, "summary");
async function updateOrder(env, number, ch) {
  const o = await findOrder(env, number);
  if (!o) throw new StoreError("Not found", 404);
  const ts = now();
  const st = [];
  const ev = /* @__PURE__ */ __name2((kind, detail) => st.push(env.DB.prepare("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', ?, ?)").bind(o.id, ts, kind, detail)), "ev");
  if ("status" in ch && ch.status !== o.status) {
    if (!ORDER_STATUSES.includes(ch.status)) throw new StoreError("Unknown order status");
    if (["Dispatched", "Delivered"].includes(ch.status) && await one(env, "SELECT 1 AS x FROM shipments WHERE order_id = ? AND dispatch_status != 'dispatched'", o.id))
      throw new StoreError("Confirm the dispatch of every shipment first (Shipping, Confirm dispatch). An order is never marked as sent without it.");
    st.push(env.DB.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(ch.status, o.id));
    ev("status", `Order status: ${ch.status}`);
  }
  if ("payment_status" in ch && ch.payment_status !== o.payment_status) {
    if (!PAYMENT_STATUSES.includes(ch.payment_status)) throw new StoreError("Unknown payment status");
    st.push(env.DB.prepare("UPDATE orders SET payment_status = ? WHERE id = ?").bind(ch.payment_status, o.id));
    ev("payment", `Payment: ${ch.payment_status}`);
  }
  if ("tracking" in ch || "carrier" in ch) {
    if (o.erased_at) throw new StoreError("This order's personal details were erased");
    const tracking = String(ch.tracking ?? o.tracking ?? "").trim().slice(0, 80) || null;
    const carrier = String(ch.carrier ?? o.carrier ?? "").trim().slice(0, 60) || null;
    if (tracking !== o.tracking || carrier !== o.carrier) {
      st.push(env.DB.prepare("UPDATE orders SET tracking = ?, carrier = ? WHERE id = ?").bind(tracking, carrier, o.id));
      ev("tracking", `Tracking: ${[carrier, tracking].filter(Boolean).join(" ") || "removed"}`);
    }
  }
  if (ch.message) ev("message", message(ch.message, 800));
  st.push(env.DB.prepare("UPDATE orders SET updated_at = ? WHERE id = ?").bind(ts, o.id));
  await env.DB.batch(st);
  return adminOrder(env, number, false);
}
__name(updateOrder, "updateOrder");
__name2(updateOrder, "updateOrder");
async function eraseOrder(env, number) {
  const o = await findOrder(env, number);
  if (!o) throw new StoreError("Not found", 404);
  await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET customer_name = '[erased]', email = '[erased]', phone = '[erased]', recipient_name = '[erased]', address1 = '[erased]',
      address2 = NULL, city = '[erased]', region = NULL, postcode = NULL, instructions = NULL, tracking = NULL, client = NULL, erased_at = ? WHERE id = ?`).bind(now(), o.id),
    env.DB.prepare("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', 'erased', 'Personal details erased')").bind(o.id, now())
  ]);
  return adminOrder(env, number, false);
}
__name(eraseOrder, "eraseOrder");
__name2(eraseOrder, "eraseOrder");
async function listOrders(env, url) {
  const status = url.searchParams.get("status") || "";
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
  const offset = Number(url.searchParams.get("offset")) || 0;
  let sql = "SELECT * FROM orders WHERE 1 = 1";
  const args = [];
  if (status === "open") {
    sql += " AND status NOT IN (?, ?)";
    args.push(...CLOSED);
  } else if (ORDER_STATUSES.includes(status)) {
    sql += " AND status = ?";
    args.push(status);
  } else if (PAYMENT_STATUSES.includes(status)) {
    sql += " AND payment_status = ?";
    args.push(status);
  }
  if (q) {
    const like = `%${q}%`;
    sql += " AND (number LIKE ? OR legacy_number LIKE ? OR customer_name LIKE ? OR recipient_name LIKE ? OR email LIKE ? OR phone LIKE ? OR tracking LIKE ? OR id IN (SELECT order_id FROM order_items WHERE code LIKE ? OR name LIKE ?))";
    args.push(like, like, like, like, like, like, like, like, like);
  }
  const total = (await one(env, `SELECT COUNT(*) AS n FROM (${sql})`, ...args)).n;
  const rows = await all(env, `${sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, ...args, limit, offset);
  const orders = [];
  for (const o of rows) {
    const items = await all(env, "SELECT code, qty FROM order_items WHERE order_id = ? ORDER BY id", o.id);
    const keep = ["number", "created_at", "catalogue", "currency", "symbol", "subtotal_minor", "prices_pending", "status", "payment_status", "customer_name", "recipient_name", "address_country", "seen_at", "erased_at"];
    orders.push({ ...Object.fromEntries(keep.map((k) => [k, o[k]])), items: items.length, units: items.reduce((a, i) => a + i.qty, 0), codes: items.slice(0, 4).map((i) => i.code) });
  }
  return { total, orders, order_statuses: ORDER_STATUSES, payment_statuses: PAYMENT_STATUSES };
}
__name(listOrders, "listOrders");
__name2(listOrders, "listOrders");
async function listChats(env, view) {
  const where = { open: "status = 'open'", closed: "status = 'closed'", archived: "status = 'archived'" }[view] || "status = 'open'";
  const out = [];
  for (const c of await all(env, `SELECT * FROM chats WHERE ${where} AND last_message_at IS NOT NULL ORDER BY (mode = 'waiting') DESC, last_message_at DESC LIMIT 300`)) {
    const last = await one(env, "SELECT sender, body, at FROM chat_messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1", c.id);
    const { id, client, updated_at, ...row } = c;
    out.push({ ...row, last });
  }
  return out;
}
__name(listChats, "listChats");
__name2(listChats, "listChats");
async function adminChat(env, publicId, markRead = true) {
  const c = await one(env, "SELECT * FROM chats WHERE public_id = ?", publicId);
  if (!c) throw new StoreError("Not found", 404);
  if (markRead && c.unread) await run(env, "UPDATE chats SET unread = 0 WHERE id = ?", c.id);
  const messages = await all(env, "SELECT id, at, sender, body FROM chat_messages WHERE chat_id = ? ORDER BY id", c.id);
  const { id, client, updated_at, unread, ...row } = c;
  return { ...row, messages };
}
__name(adminChat, "adminChat");
__name2(adminChat, "adminChat");
async function chatAction(env, publicId, action, body) {
  const c = await one(env, "SELECT * FROM chats WHERE public_id = ?", publicId);
  if (!c) throw new StoreError("Not found", 404);
  if (action === "reply") {
    const text2 = message(body.text, 2e3);
    if (c.mode !== "human") {
      await run(env, "UPDATE chats SET mode = 'human' WHERE id = ?", c.id);
      await addMessage(env, c.id, "system", TEAM_JOINED);
    }
    await run(env, "UPDATE chats SET status = 'open' WHERE id = ?", c.id);
    await addMessage(env, c.id, "team", text2);
    await run(env, "UPDATE chats SET unread = 0 WHERE id = ?", c.id);
  } else if (action === "takeover") {
    if (c.mode !== "human") {
      await run(env, "UPDATE chats SET mode = 'human', status = 'open' WHERE id = ?", c.id);
      await addMessage(env, c.id, "system", TEAM_JOINED);
    }
  } else if (action === "assistant") {
    await run(env, "UPDATE chats SET mode = 'assistant' WHERE id = ?", c.id);
    await addMessage(env, c.id, "system", "The automated assistant is answering again. You can ask for the team at any time.");
  } else if (action === "close") {
    await run(env, "UPDATE chats SET status = 'closed', unread = 0 WHERE id = ?", c.id);
    await addMessage(env, c.id, "system", "This conversation has been closed. Write again at any time if you need anything else.");
  } else if (action === "archive") await run(env, "UPDATE chats SET status = 'archived', unread = 0 WHERE id = ?", c.id);
  else if (action === "reopen") await run(env, "UPDATE chats SET status = 'open' WHERE id = ?", c.id);
  else if (action === "delete") {
    await env.DB.batch([env.DB.prepare("DELETE FROM chat_messages WHERE chat_id = ?").bind(c.id), env.DB.prepare("DELETE FROM chats WHERE id = ?").bind(c.id)]);
    return { deleted: true };
  } else throw new StoreError("Unknown action");
  return adminChat(env, publicId, false);
}
__name(chatAction, "chatAction");
__name2(chatAction, "chatAction");
var retention = /* @__PURE__ */ __name2(async (env) => ({ ...RETENTION, ...await getMeta(env, "retention") || {} }), "retention");
async function purge(env) {
  const r = await retention(env);
  const cut = /* @__PURE__ */ __name2((days) => new Date(Date.now() - days * 864e5).toISOString().replace(/\.\d{3}Z$/, "Z"), "cut");
  const old = await all(env, "SELECT id FROM chats WHERE COALESCE(last_message_at, created_at) < ?", cut(r.chat_days));
  for (const c of old) await env.DB.batch([env.DB.prepare("DELETE FROM chat_messages WHERE chat_id = ?").bind(c.id), env.DB.prepare("DELETE FROM chats WHERE id = ?").bind(c.id)]);
  const orders = await all(env, "SELECT number FROM orders WHERE erased_at IS NULL AND updated_at < ? AND status IN (?, ?)", cut(r.order_personal_days), ...CLOSED);
  for (const o of orders) await eraseOrder(env, o.number);
  await setMeta(env, "purged_at", Date.now() / 1e3);
  return { chats_deleted: old.length, orders_erased: orders.length };
}
__name(purge, "purge");
__name2(purge, "purge");
async function purgeIfDue(env) {
  if (Date.now() / 1e3 - Number(await getMeta(env, "purged_at", 0) || 0) > 3600) await purge(env);
}
__name(purgeIfDue, "purgeIfDue");
__name2(purgeIfDue, "purgeIfDue");
async function ownShipment(env, number, token, sid) {
  await checkToken(env, "order", String(number).toUpperCase(), token);
  const o = await findOrder(env, number);
  const s = o && await one(env, "SELECT * FROM shipments WHERE id = ? AND order_id = ?", sid, o.id);
  if (!o || !s) throw new StoreError("Not found", 404);
  if (s.dispatch_status === "dispatched") throw new StoreError("This shipment has already been dispatched, so it can no longer be changed.", 409);
  if (o.status === "Cancelled") throw new StoreError("This order was cancelled.", 409);
  return [o, s];
}
__name(ownShipment, "ownShipment");
__name2(ownShipment, "ownShipment");
var shipEvent = /* @__PURE__ */ __name2((env, orderId, actor, detail) => env.DB.prepare("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, ?, 'shipping', ?)").bind(orderId, now(), actor, detail), "shipEvent");
async function resellerShipment(env, number, token, sid, body) {
  const [o, s] = await ownShipment(env, number, token, sid);
  const errors = {};
  const vals = {};
  for (const [f, label, max] of [["carrier", "carrier", 60], ["service", "shipping service", 60], ["tracking", "tracking number", 80], ["instructions", "shipping instructions", 800]])
    if (f in body) vals[f] = text(body, f, label, errors, { required: false, max, min: 1, multiline: f === "instructions" });
  const method = body.arranged_by ?? s.arranged_by;
  if (!["reseller", "ravisn"].includes(method)) errors.arranged_by = "Choose who arranges shipping";
  if (Object.keys(errors).length) throw new StoreError("Some details need your attention", 422, errors);
  const st = [];
  const changes = [];
  if (method !== s.arranged_by) {
    if (["awaiting_payment", "paid"].includes(s.payment_status)) throw new StoreError("Ravisn has already quoted this shipment. Ask the team in the chat to change it.", 409);
    st.push(env.DB.prepare("UPDATE shipments SET arranged_by = ?, payment_status = ? WHERE id = ?").bind(method, method === "ravisn" ? "quote_pending" : "not_applicable", sid));
    changes.push(method === "ravisn" ? "shipping quote requested from Ravisn" : "reseller will arrange shipping");
  }
  for (const [f, v] of Object.entries(vals))
    if (v !== s[f]) {
      st.push(env.DB.prepare(`UPDATE shipments SET ${f} = ? WHERE id = ?`).bind(v, sid));
      changes.push(`${f} updated`);
    }
  if (body.request_address && !s.address_requested) {
    st.push(env.DB.prepare("UPDATE shipments SET address_requested = 1 WHERE id = ?").bind(sid));
    changes.push("asked Ravisn to confirm the dispatch address and label requirements");
  }
  if (changes.length) {
    st.push(env.DB.prepare("UPDATE shipments SET updated_at = ? WHERE id = ?").bind(now(), sid));
    st.push(env.DB.prepare("UPDATE orders SET updated_at = ?, seen_at = NULL WHERE id = ?").bind(now(), o.id));
    st.push(shipEvent(env, o.id, "reseller", `Shipping: ${changes.join("; ")}`));
    await env.DB.batch(st);
  }
  return publicOrder(env, number);
}
__name(resellerShipment, "resellerShipment");
__name2(resellerShipment, "resellerShipment");
function labelKind(bytes) {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 4e5)));
  if (head.startsWith("%PDF-")) {
    if (/\/(JavaScript|JS|Launch|EmbeddedFile)\b/.test(head)) throw new StoreError("That PDF contains active content. Save the label again as a plain PDF and upload it.");
    return "application/pdf";
  }
  if (bytes[0] === 137 && head.slice(1, 4) === "PNG") return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (head.slice(0, 4) === "RIFF" && head.slice(8, 12) === "WEBP") return "image/webp";
  throw new StoreError("Upload the label as a PDF, PNG, JPEG or WebP file");
}
__name(labelKind, "labelKind");
__name2(labelKind, "labelKind");
async function uploadLabel(env, number, token, sid, file) {
  const [o, s] = await ownShipment(env, number, token, sid);
  if (s.arranged_by !== "reseller") throw new StoreError("Ravisn is arranging this shipment, so no label is needed from you.", 409);
  if (!file || typeof file.arrayBuffer !== "function") throw new StoreError("Choose the label file");
  if (file.size > LABEL_MAX) throw new StoreError("Labels must be a PDF or image of at most 1.5 MB", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new StoreError("Labels must be a PDF or image of at most 1.5 MB");
  const kind = labelKind(bytes);
  const base = String(file.name || "label").split(/[\\/]/).pop().replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80).replace(/\.[^.]*$/, "").replace(/^[._]+|[._]+$/g, "") || "label";
  const name = base + LABEL_EXT[kind];
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
  const ts = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE labels SET current = 0 WHERE shipment_id = ?").bind(sid),
    env.DB.prepare("INSERT INTO labels (shipment_id, filename, content_type, size, sha256, data, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(sid, name, kind, bytes.length, digest, bytes, ts),
    env.DB.prepare("UPDATE shipments SET label_status = 'submitted', label_note = NULL, updated_at = ? WHERE id = ?").bind(ts, sid),
    env.DB.prepare("UPDATE orders SET updated_at = ?, seen_at = NULL WHERE id = ?").bind(ts, o.id),
    shipEvent(env, o.id, "reseller", `Shipping label uploaded (${name}); Ravisn will check it before dispatch`)
  ]);
  return publicOrder(env, number);
}
__name(uploadLabel, "uploadLabel");
__name2(uploadLabel, "uploadLabel");
async function labelResponse(env, sid) {
  const row = await one(env, "SELECT filename, content_type, data FROM labels WHERE shipment_id = ? AND current = 1", sid);
  if (!row) throw new StoreError("Not found", 404);
  return new Response(new Uint8Array(row.data), { headers: { "Content-Type": row.content_type, "Content-Disposition": `attachment; filename="${row.filename}"`, "Cache-Control": "no-store", ...SECURITY, "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" } });
}
__name(labelResponse, "labelResponse");
__name2(labelResponse, "labelResponse");
async function adminShipment(env, number, sid) {
  const o = await findOrder(env, number);
  const s = o && await one(env, "SELECT * FROM shipments WHERE id = ? AND order_id = ?", sid, o.id);
  if (!o || !s) throw new StoreError("Not found", 404);
  return [o, s];
}
__name(adminShipment, "adminShipment");
__name2(adminShipment, "adminShipment");
async function adminUpdateShipment(env, number, sid, ch) {
  const [o, s] = await adminShipment(env, number, sid);
  if (s.dispatch_status === "dispatched" && Object.keys(ch).some((k) => !["tracking", "carrier"].includes(k))) throw new StoreError("This shipment is already dispatched");
  const sets = {};
  const notes = [];
  for (const [f, n] of [["carrier", 60], ["service", 60], ["tracking", 80], ["instructions", 800]])
    if (f in ch) {
      const v = String(ch[f] ?? "").trim().slice(0, n) || null;
      if (v !== s[f]) {
        sets[f] = v;
        notes.push(["carrier", "tracking"].includes(f) ? `${f}: ${v || "removed"}` : `${f} updated`);
      }
    }
  if ("arranged_by" in ch && ch.arranged_by !== s.arranged_by) {
    if (!["reseller", "ravisn"].includes(ch.arranged_by)) throw new StoreError("Choose who arranges shipping");
    sets.arranged_by = ch.arranged_by;
    sets.payment_status ??= ch.arranged_by === "ravisn" ? "quote_pending" : "not_applicable";
    notes.push(`shipping arranged by ${ch.arranged_by === "ravisn" ? "Ravisn" : "the reseller"}`);
  }
  if ("charge_minor" in ch && ch.charge_minor !== s.charge_minor) {
    const v = ch.charge_minor;
    if (v !== null && !(Number.isInteger(v) && v >= 0 && v <= 1e7)) throw new StoreError("Enter the shipping charge as an amount");
    sets.charge_minor = v;
    notes.push(v === null ? "shipping charge removed" : `shipping charge ${o.symbol}${(v / 100).toFixed(2)}`);
    if (v !== null && s.payment_status === "quote_pending" && !("payment_status" in ch)) sets.payment_status = "awaiting_payment";
  }
  if ("payment_status" in ch && ch.payment_status !== s.payment_status) {
    const labels = { paid: "shipping payment received", awaiting_payment: "shipping payment requested", quote_pending: "shipping quote being prepared", not_applicable: "no shipping payment needed" };
    if (!(ch.payment_status in labels)) throw new StoreError("Unknown shipping payment status");
    sets.payment_status = ch.payment_status;
    notes.push(labels[ch.payment_status]);
  }
  if ("label_status" in ch && ch.label_status !== s.label_status) {
    if (ch.label_status === "approved") {
      const c = ch.checks || {};
      if (!["destination", "origin", "parcel", "carrier"].every((k) => c[k] === true))
        throw new StoreError("Confirm the label matches the destination, the authorised dispatch origin, the parcel and the carrier");
      if (!await one(env, "SELECT 1 AS x FROM labels WHERE shipment_id = ? AND current = 1", sid)) throw new StoreError("There is no label to approve");
      notes.push("label checked and approved");
    } else if (ch.label_status === "rejected") {
      if (String(ch.label_note || "").trim().length < 4) throw new StoreError("Say what needs to change on the label");
      notes.push(`label needs a change: ${String(ch.label_note).trim().slice(0, 300)}`);
    } else throw new StoreError("Approve the label or ask for a change");
    sets.label_status = ch.label_status;
    sets.label_note = String(ch.label_note || "").trim().slice(0, 300) || null;
  }
  if ("address_requested" in ch) sets.address_requested = ch.address_requested ? 1 : 0;
  const keys = Object.keys(sets);
  if (keys.length) {
    const st = [env.DB.prepare(`UPDATE shipments SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).bind(...keys.map((k) => sets[k]), now(), sid)];
    if (notes.length) st.push(env.DB.prepare("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', 'shipping', ?)").bind(o.id, now(), `Shipping: ${notes.join("; ")}`));
    st.push(env.DB.prepare("UPDATE orders SET updated_at = ? WHERE id = ?").bind(now(), o.id));
    await env.DB.batch(st);
  }
  return adminOrder(env, number, false);
}
__name(adminUpdateShipment, "adminUpdateShipment");
__name2(adminUpdateShipment, "adminUpdateShipment");
async function adminSplitShipment(env, number, body) {
  const o = await findOrder(env, number);
  if (!o) throw new StoreError("Not found", 404);
  const ids = (body.line_ids || []).map(Number);
  const arranged = body.arranged_by || "reseller";
  if (!["reseller", "ravisn"].includes(arranged)) throw new StoreError("Choose who arranges shipping");
  const rows = [];
  for (const id of ids) {
    const r = await one(env, "SELECT i.id, s.dispatch_status FROM order_items i LEFT JOIN shipments s ON s.id = i.shipment_id WHERE i.order_id = ? AND i.id = ?", o.id, id);
    if (!r) throw new StoreError("Choose product lines of this order");
    if (r.dispatch_status === "dispatched") throw new StoreError("A chosen line is already dispatched");
    rows.push(r);
  }
  const total = (await one(env, "SELECT COUNT(*) AS n FROM order_items WHERE order_id = ?", o.id)).n;
  if (!rows.length) throw new StoreError("Choose product lines of this order");
  if (rows.length === total) throw new StoreError("Choose some of the lines, not all of them");
  const ts = now();
  const sh = await one(
    env,
    "INSERT INTO shipments (order_id, arranged_by, payment_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id",
    o.id,
    arranged,
    arranged === "ravisn" ? "quote_pending" : "not_applicable",
    ts,
    ts
  );
  await env.DB.batch([
    ...ids.map((id) => env.DB.prepare("UPDATE order_items SET shipment_id = ? WHERE order_id = ? AND id = ?").bind(sh.id, o.id, id)),
    env.DB.prepare("DELETE FROM shipments WHERE order_id = ? AND id NOT IN (SELECT DISTINCT shipment_id FROM order_items WHERE order_id = ? AND shipment_id IS NOT NULL)").bind(o.id, o.id),
    env.DB.prepare("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', 'shipping', ?)").bind(o.id, ts, `Shipping: ${ids.length} product line(s) will be shipped separately`)
  ]);
  return adminOrder(env, number, false);
}
__name(adminSplitShipment, "adminSplitShipment");
__name2(adminSplitShipment, "adminSplitShipment");
async function adminDispatch(env, number, sid, body) {
  const [o, s] = await adminShipment(env, number, sid);
  if (s.dispatch_status === "dispatched") throw new StoreError("Already dispatched");
  if (body.confirm !== true) throw new StoreError("Confirm that this shipment has been handed to the carrier");
  if (!(s.carrier && s.tracking)) throw new StoreError("Add the carrier and the carrier's tracking number first");
  if (s.arranged_by === "ravisn" && s.payment_status !== "paid") throw new StoreError("The shipping charge has not been marked as paid");
  if (s.arranged_by === "reseller" && s.label_status !== "approved" && body.label_elsewhere !== true)
    throw new StoreError("Approve the reseller's label first, or confirm the label was supplied another way");
  if (o.payment_status !== "Paid" && body.unpaid_ok !== true) throw new StoreError("The order has not been marked as paid");
  const ts = now();
  const st = [
    env.DB.prepare("UPDATE shipments SET dispatch_status = 'dispatched', dispatched_at = ?, updated_at = ? WHERE id = ?").bind(ts, ts, sid),
    env.DB.prepare("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', 'tracking', ?)").bind(o.id, ts, `Dispatched with ${s.carrier}, tracking ${s.tracking}`)
  ];
  if (!o.tracking) st.push(env.DB.prepare("UPDATE orders SET carrier = ?, tracking = ? WHERE id = ?").bind(s.carrier, s.tracking, o.id));
  await env.DB.batch(st);
  if (!await one(env, "SELECT 1 AS x FROM shipments WHERE order_id = ? AND dispatch_status != 'dispatched'", o.id) && !["Dispatched", "Delivered"].includes(o.status))
    await env.DB.batch([
      env.DB.prepare("UPDATE orders SET status = 'Dispatched', updated_at = ? WHERE id = ?").bind(ts, o.id),
      env.DB.prepare("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', 'status', 'Order status: Dispatched')").bind(o.id, ts)
    ]);
  return adminOrder(env, number, false);
}
__name(adminDispatch, "adminDispatch");
__name2(adminDispatch, "adminDispatch");
var SECURITY = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' https://i.ebayimg.com data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SECURITY } });
}
__name(json, "json");
__name2(json, "json");
async function readBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new StoreError("That request is too large", 413);
  let data;
  try {
    data = JSON.parse(raw || "{}");
  } catch {
    throw new StoreError("The request could not be read");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new StoreError("The request could not be read");
  return data;
}
__name(readBody, "readBody");
__name2(readBody, "readBody");
async function storeApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;
  if (method === "POST") {
    const origin = request.headers.get("Origin");
    if (origin !== null && origin !== url.origin) return json({ error: "Requests must come from the Ravisn website" }, 403);
    const kind = path.endsWith("/label") ? "multipart/form-data" : "application/json";
    if (request.headers.get("X-Ravisn-Store") !== "1" || !(request.headers.get("Content-Type") || "").includes(kind)) return json({ error: "Unsupported request" }, 415);
  }
  if (path === "/api/store/config" && method === "GET")
    return json({
      orders: true,
      chat: true,
      ai: false,
      shipping_note: SHIPPING_NOTE,
      label_max: LABEL_MAX,
      team_online: await teamOnline(env),
      countries: Object.values(RULES || {}).map(({ postcode, ...r }) => ({ ...r, has_postcode: postcode !== null })),
      catalogue_delivery: { UK: "GB", USA: "US", Canada: "CA", Germany: "DE", Australia: "AU" },
      whatsapp: WHATSAPP,
      team_away: TEAM_AWAY,
      retention: await retention(env)
    });
  if (path === "/api/store/orders" && method === "POST") {
    const body = await readBody(request);
    if (body.website) throw new StoreError("Your order could not be sent", 400);
    const clean = await validateOrder(env, request, body);
    const who = await clientHash(env, request);
    if (!await allow(env, "order", who) || !await allow(env, "order_day", who))
      throw new StoreError("Too many orders from this connection. Please wait a little, or contact us on WhatsApp.", 429);
    return json(await createOrder(env, clean, request.headers.get("Idempotency-Key") || body.idempotency_key, who));
  }
  let m = /^\/api\/store\/orders\/([A-Za-z0-9-]{6,30})\/shipments\/(\d{1,12})(\/label)?$/.exec(path);
  if (m) {
    const token = request.headers.get("X-Order-Token");
    const sid = Number(m[2]);
    if (method === "GET" && m[3]) {
      await checkToken(env, "order", m[1].toUpperCase(), token);
      const o = await findOrder(env, m[1]);
      if (!o || !await one(env, "SELECT 1 AS x FROM shipments WHERE id = ? AND order_id = ?", sid, o.id)) throw new StoreError("Not found", 404);
      return labelResponse(env, sid);
    }
    if (method === "POST") {
      if (!await allow(env, "chat_msg", await clientHash(env, request))) throw new StoreError("Too many changes from this connection. Please wait a moment.", 429);
      if (m[3]) {
        if (Number(request.headers.get("Content-Length") || 0) > LABEL_MAX + 65536) throw new StoreError("Labels must be a PDF or image of at most 1.5 MB", 413);
        const form = await request.formData();
        return json(await uploadLabel(env, m[1], token, sid, form.get("file")));
      }
      return json(await resellerShipment(env, m[1], token, sid, await readBody(request)));
    }
  }
  m = /^\/api\/store\/orders\/([A-Za-z0-9-]{6,30})$/.exec(path);
  if (m && method === "GET") {
    const number = m[1].toUpperCase();
    await checkToken(env, "order", number, request.headers.get("X-Order-Token"));
    return json(await publicOrder(env, number));
  }
  if (path === "/api/store/chat" && method === "POST") {
    const body = await readBody(request);
    if (body.website) throw new StoreError("Chat is not available", 400);
    const who = await clientHash(env, request);
    if (!await allow(env, "chat_start", who)) throw new StoreError("Too many chats from this connection. Please try again later.", 429);
    const id = randomId();
    const ts = now();
    await run(
      env,
      "INSERT INTO chats (public_id, created_at, updated_at, status, mode, page, client) VALUES (?, ?, ?, 'open', 'assistant', ?, ?)",
      id,
      ts,
      ts,
      String(body.page || "").slice(0, 200) || null,
      who
    );
    return json({ id, token: await sign(env, "chat", id) });
  }
  m = /^\/api\/store\/chat\/([\w-]{8,40})(\/messages|\/team)?$/.exec(path);
  if (m) {
    const token = request.headers.get("X-Chat-Token");
    if (method === "GET" && !m[2]) return json(await chatState(env, m[1], token, Number(url.searchParams.get("after")) || 0));
    if (method === "POST" && m[2]) {
      const body = await readBody(request);
      if (!await allow(env, "chat_msg", await clientHash(env, request))) throw new StoreError("You're sending messages very quickly. Please wait a moment.", 429);
      const c = await chatRow(env, m[1], token);
      if (m[2] === "/messages") {
        const text2 = message(body.text);
        if (c.status === "closed") await run(env, "UPDATE chats SET status = 'open' WHERE id = ?", c.id);
        await addMessage(env, c.id, "visitor", text2, c.mode !== "assistant");
        if (c.mode === "assistant" && body.assistant_reply) await addMessage(env, c.id, "assistant", message(body.assistant_reply, 3e3));
      } else {
        const name = String(body.name || "").replace(CTRL, "").trim() || null;
        const contact = String(body.contact || "").replace(CTRL, "").trim() || null;
        if (name && name.length > 80 || contact && contact.length > 120) throw new StoreError("Keep your name and contact details short");
        await run(env, "UPDATE chats SET name = COALESCE(?, name), contact = COALESCE(?, contact), status = 'open', mode = CASE WHEN mode = 'human' THEN 'human' ELSE 'waiting' END WHERE id = ?", name, contact, c.id);
        const online = await teamOnline(env);
        if (body.message) {
          await addMessage(env, c.id, "visitor", message(body.message), true);
          if (!online) await addMessage(env, c.id, "system", LEFT_MESSAGE);
        } else if (c.mode !== "human") {
          await run(env, "UPDATE chats SET unread = unread + 1 WHERE id = ?", c.id);
          await addMessage(env, c.id, "system", online ? TEAM_REQUESTED : TEAM_AWAY);
        }
      }
      return json(await chatState(env, m[1], token, 0));
    }
  }
  return json({ error: "Not found" }, 404);
}
__name(storeApi, "storeApi");
__name2(storeApi, "storeApi");
async function adminApi(request, env, url) {
  const auth = request.headers.get("Authorization") || "";
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32 || !same(auth, `Bearer ${env.ADMIN_TOKEN}`)) return json({ error: "Unauthorised" }, 401);
  const path = url.pathname.replace(/^\/api\/owner/, "");
  const method = request.method;
  const body = method === "GET" ? {} : await readBody(request);
  if (path === "/summary") return json(await summary(env));
  if (path === "/presence" && method === "PUT") {
    await setMeta(env, "presence", { online: !!body.online, at: Date.now() / 1e3 });
    return json({ online: await teamOnline(env) });
  }
  if (path === "/retention" && method === "GET") return json(await retention(env));
  if (path === "/retention" && method === "PUT") {
    const r = await retention(env);
    for (const k of Object.keys(RETENTION))
      if (k in body) {
        const v = Number(body[k]);
        if (!(v >= 7 && v <= 3650)) throw new StoreError("Choose between 7 and 3,650 days");
        r[k] = Math.floor(v);
      }
    await setMeta(env, "retention", r);
    return json(r);
  }
  if (path === "/purge" && method === "POST") return json(await purge(env));
  if (path === "/orders" && method === "GET") return json(await listOrders(env, url));
  let m = /^\/orders\/([A-Z0-9-]{6,30})\/shipments(?:\/(\d{1,12})(\/dispatch|\/label)?)?$/.exec(path);
  if (m) {
    if (!m[2] && method === "POST") return json(await adminSplitShipment(env, m[1], body));
    if (m[2] && !m[3] && method === "PATCH") return json(await adminUpdateShipment(env, m[1], Number(m[2]), body));
    if (m[3] === "/dispatch" && method === "POST") return json(await adminDispatch(env, m[1], Number(m[2]), body));
    if (m[3] === "/label" && method === "GET") {
      await adminShipment(env, m[1], Number(m[2]));
      return labelResponse(env, Number(m[2]));
    }
  }
  m = /^\/orders\/([A-Z0-9-]{6,30})(\/erase)?$/.exec(path);
  if (m && method === "GET" && !m[2]) return json(await adminOrder(env, m[1], url.searchParams.get("seen") !== "0"));
  if (m && method === "PATCH" && !m[2]) return json(await updateOrder(env, m[1], body));
  if (m && method === "POST" && m[2]) return json(await eraseOrder(env, m[1]));
  if (path === "/chats" && method === "GET") return json({ chats: await listChats(env, url.searchParams.get("view") || "open"), summary: await summary(env) });
  m = /^\/chats\/([\w-]{8,40})(?:\/(reply|takeover|assistant|close|archive|reopen|delete))?$/.exec(path);
  if (m && method === "GET" && !m[2]) return json(await adminChat(env, m[1]));
  if (m && method === "POST" && m[2]) return json(await chatAction(env, m[1], m[2], body));
  return json({ error: "Not found" }, 404);
}
__name(adminApi, "adminApi");
__name2(adminApi, "adminApi");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const api = url.pathname.startsWith("/api/");
    if (api && url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) return json({ error: "Use https" }, 403);
    if (url.pathname.startsWith("/api/store/") || url.pathname.startsWith("/api/owner/")) {
      if (!env.DB || !env.STORE_SECRET) return json({ error: "Ordering is not available right now" }, 503);
      try {
        await schema(env);
        return url.pathname.startsWith("/api/store/") ? await storeApi(request, env, url) : await adminApi(request, env, url);
      } catch (e) {
        if (e instanceof StoreError) return json({ error: e.message, fields: e.fields }, e.status);
        console.error(e);
        return json({ error: "Something went wrong. Please try again." }, 500);
      }
    }
    if (api) return json({ error: "Not found" }, 404);
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
    if (res.status === 404 && !/\.[a-z0-9]{2,5}$/i.test(url.pathname) && !url.pathname.startsWith("/data/")) {
      const index = await env.ASSETS.fetch(new Request(new URL("/", request.url), request));
      const page = new Response(index.body, index);
      for (const [k, v] of Object.entries(SECURITY)) page.headers.set(k, v);
      return page;
    }
    return out;
  }
};
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-acAszO/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-acAszO/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=bundledWorker-0.03521644094672749.js.map
