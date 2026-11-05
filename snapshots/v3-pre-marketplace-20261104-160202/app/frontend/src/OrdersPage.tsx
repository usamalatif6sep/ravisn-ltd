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
interface Order extends OrderRow {
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
  const [tracking, setTracking] = useState({ carrier: "", tracking: "" });
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [erase, setErase] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const apply = (d: Order) => {
    setO(d);
    setTracking({ carrier: d.carrier ?? "", tracking: d.tracking ?? "" });
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
          <h2>Tracking</h2>
          <div className="om-inline">
            <input className="input input-sm" placeholder="Carrier" value={tracking.carrier} onChange={(e) => setTracking({ ...tracking, carrier: e.target.value })} disabled={erased} />
            <input className="input input-sm" placeholder="Tracking number" value={tracking.tracking} onChange={(e) => setTracking({ ...tracking, tracking: e.target.value })} disabled={erased} />
            <Button size="sm" disabled={erased || (tracking.carrier === (o.carrier ?? "") && tracking.tracking === (o.tracking ?? ""))} onClick={() => patch(tracking, "Tracking saved")}>
              Save
            </Button>
          </div>
          <p className="muted om-hint">The reseller sees tracking on their order page.</p>
          <h2 className="om-sub">Update for the reseller</h2>
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
