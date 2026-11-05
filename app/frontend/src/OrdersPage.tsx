import { useCallback, useEffect, useState } from "react";
import { api, qs } from "./api";
import { money, num, plural, when } from "./format";
import * as I from "./icons";
import { useApp } from "./store";
import { refreshStoreSummary } from "./storeSummary";
import { Button, cx, Dialog, Empty, Spinner, useToast } from "./ui";

interface OrderRow {
  number: string;
  created_at: string;
  catalogue: string;
  symbol: string;
  currency: string;
  subtotal_minor: number;
  prices_pending: number;
  status: string;
  payment_status: string;
  customer_name: string;
  recipient_name: string;
  address_country: string;
  seen_at: string | null;
  erased_at: string | null;
  items: number;
  units: number;
  codes: string[];
}
interface Line {
  id: number;
  code: string;
  legacy_code: string | null;
  name: string;
  option: string | null;
  qty: number;
  unit_minor: number | null;
  line_minor: number | null;
  status: string;
  link: string | null;
  private: {
    item_id: number | null;
    supplier: { id: number; name: string; phone: string | null; whatsapp_link: string | null; emails: string | null } | null;
    cost_minor: number | null;
    cost_line_minor: number | null;
    margin_minor: number | null;
    supplier_sku: string | null;
    item_ref: string | null;
    captured_at: string;
  };
}
interface Shipment {
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
  line_ids: number[];
}
interface Order extends OrderRow {
  legacy_number: string | null;
  shipments: Shipment[];
  email: string;
  phone: string;
  address1: string;
  address2: string | null;
  city: string;
  region: string | null;
  postcode: string | null;
  address_country_name: string;
  instructions: string | null;
  carrier: string | null;
  tracking: string | null;
  updated_at: string;
  release: number | null;
  items_list?: never;
  items: any;
  events: { at: string; actor: string; kind: string; detail: string }[];
  private_history: { at: string; action: string; changes: Record<string, [unknown, unknown]>; note: string }[];
  notes: string | null;
  cost_total_minor: number | null;
  margin_minor: number | null;
  margin_complete: boolean;
  suppliers: { id: number; name: string }[];
  order_statuses: string[];
  payment_statuses: string[];
}

const FILTERS = ["open", "New", "Awaiting confirmation", "Supplier contacted", "Processing", "Dispatched", "Delivered", "Cancelled", "Awaiting payment", "Paid", "Refunded", ""];
const FILTER_LABEL: Record<string, string> = { open: "Open orders", "": "All orders" };

export function StatusPill({ value, kind }: { value: string; kind: "order" | "payment" }) {
  const tone =
    kind === "payment"
      ? value === "Paid"
        ? "good"
        : value === "Refunded"
          ? "dim"
          : value === "Awaiting payment"
            ? "warn"
            : "plain"
      : value === "New"
        ? "accent"
        : value === "Delivered"
          ? "good"
          : value === "Cancelled"
            ? "dim"
            : value === "Dispatched"
              ? "good"
              : "warn";
  return <span className={cx("om-pill", `om-${tone}`)}>{value}</span>;
}

export default function OrdersPage({ number }: { number?: string }) {
  const { go } = useApp();
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ total: number; orders: OrderRow[] } | null>(null);
  const load = useCallback(() => api<{ total: number; orders: OrderRow[] }>("/api/orders" + qs({ status: filter, q, limit: 200 })).then(setData), [filter, q]);
  useEffect(() => {
    const t = setTimeout(() => load().catch(() => {}), 150);
    const poll = setInterval(() => load().catch(() => {}), 15000);
    return () => {
      clearTimeout(t);
      clearInterval(poll);
    };
  }, [load]);

  return (
    <div className="page om-page">
      <section className="om-list">
        <div className="om-list-head">
          <h1>Orders</h1>
          <select className="input input-sm" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show">
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {FILTER_LABEL[f] ?? f}
              </option>
            ))}
          </select>
        </div>
        <div className="om-search">
          <I.Search size={13} />
          <input className="input input-sm" placeholder="Order number, name, email, code, tracking" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
        </div>
        <div className="om-rows">
          {!data ? (
            <Spinner />
          ) : data.orders.length === 0 ? (
            <Empty title={filter === "open" && !q ? "No open orders" : "No orders found"}>Orders sent from the reseller website appear here.</Empty>
          ) : (
            data.orders.map((o) => (
              <a key={o.number} href={`#/orders/${o.number}`} className={cx("om-row", o.number === number && "on")}>
                <div className="om-row-top">
                  <span className="mono om-num">
                    {!o.seen_at && <span className="om-new" aria-label="New" />}
                    {o.number}
                  </span>
                  <span className="muted">{when(o.created_at)}</span>
                </div>
                <div className="om-row-name">{o.customer_name}</div>
                <div className="om-row-sub muted">
                  {o.catalogue} · {plural(o.units, "unit")} · {money(o.subtotal_minor, o.symbol)}
                  {o.prices_pending ? " + to confirm" : ""}
                </div>
                <div className="om-row-pills">
                  <StatusPill value={o.status} kind="order" />
                  <StatusPill value={o.payment_status} kind="payment" />
                </div>
              </a>
            ))
          )}
        </div>
        {data && <div className="om-list-foot muted">{plural(data.total, "order")}</div>}
      </section>
      <section className="om-detail">
        {number ? (
          <OrderDetail key={number} number={number} onChanged={load} onGone={() => go({ view: "orders" })} />
        ) : (
          <Empty title="Choose an order" icon={<I.Inbox size={22} />}>
            New orders are marked with a blue dot. Submitted orders are requests: nothing is treated as paid until you mark it paid.
          </Empty>
        )}
      </section>
    </div>
  );
}

function OrderDetail({ number, onChanged, onGone }: { number: string; onChanged: () => void; onGone: () => void }) {
  const toast = useToast();
  const { showPrivate } = useApp();
  const [o, setO] = useState<Order | null>(null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [erase, setErase] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const apply = (d: Order) => {
    setO(d);
    setNotes(d.notes ?? "");
  };
  useEffect(() => {
    api<Order>(`/api/orders/${number}`)
      .then((d) => {
        apply(d);
        onChanged();
        refreshStoreSummary();
      })
      .catch((e) => (e.status === 404 ? onGone() : toast({ text: e.message, tone: "error" })));
  }, [number]);

  const patch = async (body: Record<string, unknown>, ok: string) => {
    try {
      apply(await api<Order>(`/api/orders/${number}`, { method: "PATCH", body }));
      toast({ text: ok });
      onChanged();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };

  if (!o) return <div className="center-fill"><Spinner /></div>;
  const lines: Line[] = o.items;
  const sym = o.symbol;
  const erased = !!o.erased_at;
  const address = [o.recipient_name, o.address1, o.address2, [o.city, o.region, o.postcode].filter(Boolean).join(", "), o.address_country_name].filter(Boolean).join("\n");
  const history = [
    ...o.events.map((e) => ({ at: e.at, who: e.actor === "reseller" ? "Reseller" : e.actor === "admin" ? "You" : "System", text: e.detail })),
    ...(showPrivate
      ? o.private_history.map((h) => ({
          at: h.at,
          who: "You (private)",
          text: h.action === "notes" ? "Private notes updated" : h.action === "supplier" ? `Supplier changed on line ${String(h.changes.line?.[1] ?? "")}` : h.action,
        }))
      : []),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="om-doc">
      <header className="om-doc-head">
        <div>
          <div className="mono om-doc-num">{o.number}</div>
          <div className="muted">
            Received {when(o.created_at)} · {o.catalogue} catalogue · release {o.release ?? "?"}
            {o.legacy_number && ` · previously ${o.legacy_number}`}
          </div>
        </div>
        <div className="om-status-edit">
          <label>
            <span>Order status</span>
            <select className="input input-sm" value={o.status} onChange={(e) => patch({ status: e.target.value }, `Order status: ${e.target.value}`)}>
              {o.order_statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Payment</span>
            <select className="input input-sm" value={o.payment_status} onChange={(e) => patch({ payment_status: e.target.value }, `Payment: ${e.target.value}`)}>
              {o.payment_statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section className="om-card">
        <h2>Products</h2>
        <table className="om-table">
          <thead>
            <tr>
              <th>Product</th>
              <th className="right">Qty</th>
              <th className="right">Price</th>
              <th className="right">Total</th>
              {showPrivate && <th className="om-priv-col">Supplier (private)</th>}
              {showPrivate && <th className="right om-priv-col">Cost</th>}
              {showPrivate && <th className="right om-priv-col">Margin</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>
                  <div>{l.name}</div>
                  <div className="muted">
                    {l.private.item_id ? (
                      <a className="mono" href={`#/c/${o.catalogue}/${l.private.item_id}`}>
                        {l.code}
                      </a>
                    ) : (
                      <span className="mono">{l.code}</span>
                    )}
                    {l.legacy_code && l.legacy_code !== l.code && <span className="mono"> (was {l.legacy_code})</span>}
                    {l.option && ` · ${l.option}`} · {l.status}
                    {l.link && (
                      <>
                        {" · "}
                        <a href={l.link} target="_blank" rel="noreferrer">
                          reference <I.External size={10} />
                        </a>
                      </>
                    )}
                  </div>
                </td>
                <td className="right num">{l.qty}</td>
                <td className="right num">{l.unit_minor !== null ? money(l.unit_minor, sym) : "To confirm"}</td>
                <td className="right num">{l.line_minor !== null ? money(l.line_minor, sym) : "To confirm"}</td>
                {showPrivate && (
                  <td className="om-priv-col">
                    <select
                      className="input input-sm"
                      value={l.private.supplier?.id ?? ""}
                      onChange={(e) => patch({ lines: [{ line_id: l.id, supplier_id: e.target.value ? Number(e.target.value) : null }] }, "Supplier assigned")}
                    >
                      <option value="">Not assigned</option>
                      {o.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {l.private.supplier && (
                      <div className="muted om-sup">
                        {l.private.supplier.phone}
                        {l.private.supplier_sku && ` · SKU ${l.private.supplier_sku}`}
                        {l.private.supplier.whatsapp_link && (
                          <>
                            {" · "}
                            <a href={l.private.supplier.whatsapp_link} target="_blank" rel="noreferrer">
                              WhatsApp
                            </a>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                )}
                {showPrivate && <td className="right num om-priv-col">{l.private.cost_line_minor !== null ? money(l.private.cost_line_minor, sym) : "Unknown"}</td>}
                {showPrivate && <td className={cx("right num om-priv-col", (l.private.margin_minor ?? 0) < 0 && "om-neg")}>{l.private.margin_minor !== null ? money(l.private.margin_minor, sym) : ""}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Subtotal {o.prices_pending ? "(some prices to confirm)" : ""}</td>
              <td className="right num strong">{money(o.subtotal_minor, sym)}</td>
              {showPrivate && <td className="om-priv-col muted">{o.margin_complete ? "Expected margin" : "Margin, lines with known cost"}</td>}
              {showPrivate && <td className="right num om-priv-col">{o.cost_total_minor !== null ? money(o.cost_total_minor, sym) : ""}</td>}
              {showPrivate && <td className={cx("right num strong om-priv-col", (o.margin_minor ?? 0) < 0 && "om-neg")}>{o.margin_minor !== null ? money(o.margin_minor, sym) : ""}</td>}
            </tr>
          </tfoot>
        </table>
        {!showPrivate && (
          <p className="muted om-hint">
            <I.Lock size={11} /> Supplier, cost and margin are hidden. Switch on Private data in the sidebar to see them.
          </p>
        )}
        <p className="muted om-hint">Delivery charges are not in the subtotal. Nothing is sent to a supplier automatically; contact them yourself when you are ready.</p>
      </section>

      <div className="om-grid">
        <section className="om-card">
          <h2>Reseller</h2>
          {erased ? (
            <p className="muted">Personal details erased {when(o.erased_at)}.</p>
          ) : (
            <dl className="om-kv">
              <div>
                <dt>Name</dt>
                <dd>{o.customer_name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${o.email}?subject=${encodeURIComponent(`Your Ravisn order ${o.number}`)}`}>{o.email}</a>
                </dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>
                  <a href={`tel:${o.phone}`}>{o.phone}</a> ·{" "}
                  <a href={`https://wa.me/${o.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                </dd>
              </div>
            </dl>
          )}
        </section>
        <section className="om-card">
          <div className="om-card-head">
            <h2>Recipient and delivery</h2>
            {!erased && (
              <button className="link-btn" onClick={() => navigator.clipboard.writeText(address).then(() => toast({ text: "Address copied" }))}>
                Copy address
              </button>
            )}
          </div>
          {erased ? <p className="muted">Erased.</p> : <p className="om-address">{address}</p>}
          <div className="om-instructions">
            <div className="om-label">Special instructions</div>
            <p>{o.instructions || <span className="muted">None</span>}</p>
          </div>
        </section>
      </div>

      <div className="om-grid">
        <section className="om-card">
          <h2>Update for the reseller</h2>
          <textarea className="input om-text" rows={2} placeholder="Shown on the reseller's order page, for example: Confirmed. Payment details sent by email." value={message} onChange={(e) => setMessage(e.target.value)} maxLength={800} />
          <Button size="sm" disabled={!message.trim()} onClick={() => patch({ message }, "Update added").then(() => setMessage(""))}>
            Add update
          </Button>
        </section>
        <section className="om-card om-private">
          <h2>
            <I.Lock size={12} /> Private notes
          </h2>
          <textarea className="input om-text" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only you see these." maxLength={4000} />
          <Button size="sm" disabled={notes === (o.notes ?? "")} onClick={() => patch({ notes }, "Notes saved")}>
            Save notes
          </Button>
        </section>
      </div>

      <ShippingCard o={o} lines={lines} erased={erased} onApply={(d) => (apply(d), onChanged())} />

      <section className="om-card">
        <h2>History</h2>
        <ul className="om-history">
          {history.map((h, i) => (
            <li key={i}>
              <span className="muted">{when(h.at)}</span>
              <span className="om-who">{h.who}</span>
              <span>{h.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {!erased && (
        <section className="om-card om-danger">
          <div>
            <h2>Erase personal details</h2>
            <p className="muted">Removes the reseller's and recipient's names, contact details and address. The order number, products and amounts stay for your accounts.</p>
          </div>
          <Button size="sm" variant="danger" onClick={() => setErase(true)}>
            Erase
          </Button>
        </section>
      )}
      {erase && (
        <Dialog
          title={`Erase personal details of ${o.number}?`}
          onClose={() => setErase(false)}
          footer={
            <>
              <div className="spacer" />
              <Button variant="plain" onClick={() => setErase(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={confirmText !== o.number}
                onClick={async () => {
                  try {
                    apply(await api<Order>(`/api/orders/${o.number}/erase`, { body: { confirm: confirmText } }));
                    toast({ text: "Personal details erased" });
                    setErase(false);
                    onChanged();
                  } catch (e: any) {
                    toast({ text: e.message, tone: "error" });
                  }
                }}
              >
                Erase permanently
              </Button>
            </>
          }
        >
          <p>This cannot be undone. Type the order number to confirm.</p>
          <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value.toUpperCase())} placeholder={o.number} />
        </Dialog>
      )}
      <p className="muted om-foot">Last updated {when(o.updated_at)} · {num(lines.length)} product lines</p>
    </div>
  );
}

const SHIP_PAY: Record<Shipment["payment_status"], string> = {
  not_applicable: "No shipping payment needed",
  quote_pending: "Quote to prepare",
  awaiting_payment: "Awaiting shipping payment",
  paid: "Shipping paid",
};
const LABEL_STATUS: Record<Shipment["label_status"], string> = { none: "No label yet", submitted: "Label to review", approved: "Label approved", rejected: "Change requested" };
const CHECKS: [string, string][] = [
  ["destination", "The label's recipient and address match this order's delivery address"],
  ["origin", "The sender address is the authorised dispatch origin for these products"],
  ["parcel", "The service, size and weight suit the parcel"],
  ["carrier", "The carrier and service match the shipping arrangement"],
];

function ShippingCard({ o, lines, erased, onApply }: { o: Order; lines: Line[]; erased: boolean; onApply: (d: Order) => void }) {
  const toast = useToast();
  const [split, setSplit] = useState(false);
  const [pick, setPick] = useState<number[]>([]);
  const [splitBy, setSplitBy] = useState<"reseller" | "ravisn">("reseller");
  const call = async (path: string, method: string, body: unknown, ok: string) => {
    try {
      onApply(await api<Order>(`/api/orders/${o.number}${path}`, { method, body }));
      toast({ text: ok });
      return true;
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
      return false;
    }
  };
  const open = o.shipments.filter((s) => s.dispatch_status !== "dispatched");
  return (
    <section className="om-card">
      <div className="om-card-head">
        <h2>Shipping</h2>
        {lines.length > 1 && open.length > 0 && !erased && (
          <button className="link-btn" onClick={() => (setPick([]), setSplit(true))}>
            Ship some lines separately
          </button>
        )}
      </div>
      <p className="muted om-hint">
        Shipping is the reseller's responsibility and is not in the product prices. Never mark a shipment as dispatched until it has actually been handed to the carrier. Dispatch addresses are confirmed privately; they are never shown on the website.
      </p>
      {o.shipments.map((s, i) => (
        <ShipmentEditor key={s.id} s={s} n={i + 1} total={o.shipments.length} o={o} lines={lines} erased={erased} call={call} />
      ))}
      {split && (
        <Dialog
          title="Ship some lines separately"
          onClose={() => setSplit(false)}
          footer={
            <>
              <div className="spacer" />
              <Button variant="plain" onClick={() => setSplit(false)}>
                Cancel
              </Button>
              <Button
                disabled={!pick.length || pick.length === lines.length}
                onClick={async () => (await call("/shipments", "POST", { line_ids: pick, arranged_by: splitBy }, "Separate shipment created")) && setSplit(false)}
              >
                Create shipment
              </Button>
            </>
          }
        >
          <p className="muted">Use this when products are fulfilled from different places or shipped with different labels. Choose the lines for the new shipment.</p>
          <div className="om-checks">
            {lines.map((l) => {
              const sh = o.shipments.find((x) => x.line_ids.includes(l.id));
              const done = sh?.dispatch_status === "dispatched";
              return (
                <label key={l.id} className={cx("om-check", done && "muted")}>
                  <input type="checkbox" disabled={done} checked={pick.includes(l.id)} onChange={(e) => setPick((p) => (e.target.checked ? [...p, l.id] : p.filter((x) => x !== l.id)))} />
                  <span>
                    <span className="mono">{l.code}</span> {l.name} × {l.qty}
                  </span>
                </label>
              );
            })}
          </div>
          <label className="om-field">
            <span>Shipping for the new shipment</span>
            <select className="input input-sm" value={splitBy} onChange={(e) => setSplitBy(e.target.value as "reseller" | "ravisn")}>
              <option value="reseller">Reseller's own label</option>
              <option value="ravisn">Ravisn quote</option>
            </select>
          </label>
        </Dialog>
      )}
    </section>
  );
}

function ShipmentEditor({ s, n, total, o, lines, erased, call }: { s: Shipment; n: number; total: number; o: Order; lines: Line[]; erased: boolean; call: (path: string, method: string, body: unknown, ok: string) => Promise<boolean> }) {
  const base = `/shipments/${s.id}`;
  const [f, setF] = useState({ carrier: s.carrier ?? "", service: s.service ?? "", tracking: s.tracking ?? "", instructions: s.instructions ?? "" });
  const [charge, setCharge] = useState(s.charge_minor !== null ? (s.charge_minor / 100).toFixed(2) : "");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [dispatch, setDispatch] = useState(false);
  const [conf, setConf] = useState({ confirm: false, label_elsewhere: false, unpaid_ok: false });
  useEffect(() => {
    setF({ carrier: s.carrier ?? "", service: s.service ?? "", tracking: s.tracking ?? "", instructions: s.instructions ?? "" });
    setCharge(s.charge_minor !== null ? (s.charge_minor / 100).toFixed(2) : "");
  }, [s]);
  const done = s.dispatch_status === "dispatched";
  const mine = lines.filter((l) => s.line_ids.includes(l.id));
  const dirty = f.carrier !== (s.carrier ?? "") || f.service !== (s.service ?? "") || f.tracking !== (s.tracking ?? "") || f.instructions !== (s.instructions ?? "");
  const chargeMinor = charge.trim() === "" ? null : Math.round(Number(charge.replace(/[^\d.]/g, "")) * 100);
  const allChecked = CHECKS.every(([k]) => checks[k]);
  const kb = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

  return (
    <div className={cx("om-ship", done && "om-ship-done")}>
      <div className="om-ship-head">
        <strong>{total > 1 ? `Shipment ${n} of ${total}` : "Shipment"}</strong>
        <span className={cx("om-pill", done ? "om-good" : "om-warn")}>{done ? `Dispatched ${when(s.dispatched_at)}` : "Not dispatched"}</span>
        <select
          className="input input-sm"
          value={s.arranged_by}
          disabled={done || erased}
          onChange={(e) => call(base, "PATCH", { arranged_by: e.target.value }, "Shipping arrangement changed")}
          aria-label="Who arranges shipping"
        >
          <option value="reseller">Reseller's own label</option>
          <option value="ravisn">Ravisn quote</option>
        </select>
      </div>
      <div className="muted om-ship-lines">
        {mine.map((l) => (
          <span key={l.id}>
            <span className="mono">{l.code}</span> × {l.qty}
          </span>
        ))}
      </div>
      {s.address_requested && !done && (
        <div className="om-notice">
          The reseller asked for the dispatch address to buy their label. Confirm the authorised origin address with them privately (email or WhatsApp). It is never shown on the website.
          <button className="link-btn" onClick={() => call(base, "PATCH", { address_requested: false }, "Marked as answered")}>
            Mark as answered
          </button>
        </div>
      )}
      <div className="om-ship-grid">
        <label className="om-field">
          <span>Carrier</span>
          <input className="input input-sm" value={f.carrier} onChange={(e) => setF({ ...f, carrier: e.target.value })} maxLength={60} disabled={erased} />
        </label>
        <label className="om-field">
          <span>Service</span>
          <input className="input input-sm" value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })} maxLength={60} disabled={done || erased} />
        </label>
        <label className="om-field">
          <span>Carrier tracking number</span>
          <input className="input input-sm mono" value={f.tracking} onChange={(e) => setF({ ...f, tracking: e.target.value })} maxLength={80} disabled={erased} />
        </label>
        <label className="om-field om-wide">
          <span>Shipping instructions</span>
          <textarea className="input om-text" rows={2} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} maxLength={800} disabled={done || erased} />
        </label>
      </div>
      <Button size="sm" disabled={!dirty || erased} onClick={() => call(base, "PATCH", done ? { carrier: f.carrier, tracking: f.tracking } : f, "Shipping details saved")}>
        Save shipping details
      </Button>

      {s.arranged_by === "reseller" ? (
        <div className="om-ship-block">
          <div className="om-label">
            Reseller's label · <span className={cx("om-pill", s.label_status === "approved" ? "om-good" : s.label_status === "none" ? "om-plain" : "om-warn")}>{LABEL_STATUS[s.label_status]}</span>
          </div>
          {s.label ? (
            <p>
              <a href={`/api/admin/orders/${encodeURIComponent(o.number)}/shipments/${s.id}/label`} target="_blank" rel="noreferrer">
                View {s.label.filename} <I.External size={10} />
              </a>{" "}
              <span className="muted">
                · {kb(s.label.size)} · uploaded {when(s.label.uploaded_at)}
              </span>
            </p>
          ) : (
            <p className="muted">The reseller has not uploaded a label yet. They can add one on their order page until dispatch.</p>
          )}
          {s.label_note && <p className="muted">Last note to the reseller: {s.label_note}</p>}
          {s.label && !done && (
            <div className="om-review">
              <div className="om-checks">
                {CHECKS.map(([k, t]) => (
                  <label key={k} className="om-check">
                    <input type="checkbox" checked={!!checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} />
                    <span>{t}</span>
                  </label>
                ))}
              </div>
              <div className="om-inline">
                <Button size="sm" disabled={!allChecked || s.label_status === "approved"} onClick={() => call(base, "PATCH", { label_status: "approved", checks }, "Label approved")}>
                  Approve label
                </Button>
                <input className="input input-sm" placeholder="What needs to change on the label" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
                <Button size="sm" variant="plain" disabled={note.trim().length < 4} onClick={() => call(base, "PATCH", { label_status: "rejected", label_note: note }, "Change requested").then((ok) => ok && setNote(""))}>
                  Ask for a change
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="om-ship-block">
          <div className="om-label">
            Ravisn shipping quote · <span className={cx("om-pill", s.payment_status === "paid" ? "om-good" : "om-warn")}>{SHIP_PAY[s.payment_status]}</span>
          </div>
          <div className="om-inline">
            <label className="om-field">
              <span>Shipping charge ({o.symbol})</span>
              <input className="input input-sm num" inputMode="decimal" value={charge} onChange={(e) => setCharge(e.target.value)} disabled={done} placeholder="0.00" />
            </label>
            <Button size="sm" disabled={done || chargeMinor === s.charge_minor || (chargeMinor !== null && !Number.isFinite(chargeMinor))} onClick={() => call(base, "PATCH", { charge_minor: chargeMinor }, "Shipping charge saved")}>
              Save charge
            </Button>
            <label className="om-field">
              <span>Shipping payment</span>
              <select className="input input-sm" value={s.payment_status} disabled={done} onChange={(e) => call(base, "PATCH", { payment_status: e.target.value }, SHIP_PAY[e.target.value as Shipment["payment_status"]])}>
                {(["quote_pending", "awaiting_payment", "paid"] as const).map((v) => (
                  <option key={v} value={v}>
                    {SHIP_PAY[v]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted om-hint">Send the quote and payment details to the reseller yourself. Nothing is charged automatically. Buy the label only after the shipping payment is received.</p>
        </div>
      )}

      {!done && !erased && (
        <Button size="sm" onClick={() => (setConf({ confirm: false, label_elsewhere: false, unpaid_ok: false }), setDispatch(true))}>
          Confirm dispatch
        </Button>
      )}
      {dispatch && (
        <Dialog
          title={`Confirm dispatch${total > 1 ? ` of shipment ${n}` : ""}`}
          onClose={() => setDispatch(false)}
          footer={
            <>
              <div className="spacer" />
              <Button variant="plain" onClick={() => setDispatch(false)}>
                Cancel
              </Button>
              <Button
                disabled={!conf.confirm || !s.carrier || !s.tracking}
                onClick={async () => (await call(`${base}/dispatch`, "POST", conf, "Dispatch recorded")) && setDispatch(false)}
              >
                Record dispatch
              </Button>
            </>
          }
        >
          {!s.carrier || !s.tracking ? (
            <p className="om-neg">Save the carrier and the carrier's real tracking number first.</p>
          ) : (
            <p>
              {s.carrier}, tracking <span className="mono">{s.tracking}</span>. The reseller will see this on their order page.
            </p>
          )}
          <label className="om-check">
            <input type="checkbox" checked={conf.confirm} onChange={(e) => setConf({ ...conf, confirm: e.target.checked })} />
            <span>I confirm this shipment has actually been handed to the carrier.</span>
          </label>
          {s.arranged_by === "reseller" && s.label_status !== "approved" && (
            <label className="om-check">
              <input type="checkbox" checked={conf.label_elsewhere} onChange={(e) => setConf({ ...conf, label_elsewhere: e.target.checked })} />
              <span>The label was not approved here; it was supplied and checked another way.</span>
            </label>
          )}
          {o.payment_status !== "Paid" && (
            <label className="om-check">
              <input type="checkbox" checked={conf.unpaid_ok} onChange={(e) => setConf({ ...conf, unpaid_ok: e.target.checked })} />
              <span>The order is not marked as paid. Dispatch it anyway.</span>
            </label>
          )}
          {s.arranged_by === "ravisn" && s.payment_status !== "paid" && <p className="om-neg">The shipping charge has not been marked as paid, so dispatch cannot be recorded yet.</p>}
        </Dialog>
      )}
    </div>
  );
}
