import { useEffect, useState } from "react";
import { api, ApiError, storeConfig, type PublicOrder, type Shipment, type StoreConfig } from "../api";
import { saveOrder, savedOrders } from "../cart";
import { Loading, openChat } from "../components";
import type { Site } from "../data";
import { money } from "../format";
import { Link, useTitle } from "../router";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function OrderStatus({ site, number }: { site: Site; number: string }) {
  useTitle(`Order ${number} · Ravisn Ltd`);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<StoreConfig | null>(null);
  const [copied, setCopied] = useState(false);
  const fresh = new URLSearchParams(location.hash.slice(1)).get("t");
  const token = fresh ?? savedOrders().find((o) => o.number === number.toUpperCase())?.token ?? null;

  useEffect(() => {
    storeConfig().then(setCfg, () => {});
    if (!token) {
      setError("This browser has no access key for that order. Open the order link you saved, or ask us in the chat.");
      return;
    }
    api<PublicOrder>(`/api/store/orders/${encodeURIComponent(number)}`, { headers: { "X-Order-Token": token } }).then(
      (o) => {
        setOrder(o);
        saveOrder({ number: o.number, token, at: o.created_at, catalogue: site.countries.find((c) => c.key === o.catalogue)?.slug ?? o.catalogue });
      },
      (e: ApiError) => setError(e.status === 404 ? "We could not find that order with this link." : e.message),
    );
  }, [number, token]);

  if (error) {
    return (
      <main className="wrap narrow-page">
        <h1 className="page-title">Order {number.toUpperCase()}</h1>
        <p className="muted">{error}</p>
        <Link to="/orders" className="btn btn-light">
          Your order references
        </Link>
      </main>
    );
  }
  if (!order) return <Loading label="Loading your order" />;
  const country = site.countries.find((c) => c.key === order.catalogue);
  const dest = cfg?.countries.find((c) => c.code === order.delivery?.country);
  const link = `${location.origin}/order/${order.number}#t=${token}`;
  const justSent = (!!fresh && Date.now() - new Date(order.created_at).getTime() < 15 * 60 * 1000) || new URLSearchParams(location.search).has("sent");
  const labelFailed = new URLSearchParams(location.search).get("label") === "failed";

  return (
    <main className="wrap narrow-page">
      {justSent ? (
        <div className="sent">
          <div className="sent-mark" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="page-title">Thank you. Your order request has been sent.</h1>
          <p className="lede small-lede">Ravisn Ltd will review your order and confirm stock, price and delivery with you before payment. Nothing has been charged.</p>
        </div>
      ) : (
        <h1 className="page-title">Order {order.number}</h1>
      )}

      {labelFailed && (
        <div className="notice notice-warn" role="alert">
          Your order was sent, but the label could not be uploaded. Add it below in Shipping.
        </div>
      )}
      <section className="panel ref-panel">
        <div>
          <div className="label">Order reference</div>
          <div className="order-ref">{order.number}</div>
          {order.legacy_number && <p className="muted small">Previously {order.legacy_number}</p>}
          <p className="muted small">Sent {when(order.created_at)}. Keep this reference for any question about the order.</p>
        </div>
        <div className="row-gap">
          <button
            className="btn btn-light btn-small"
            onClick={() => {
              navigator.clipboard?.writeText(`${order.number} ${link}`).then(() => setCopied(true), () => {});
            }}
          >
            {copied ? "Copied" : "Copy reference and link"}
          </button>
          <button className="btn btn-light btn-small" onClick={() => window.print()}>
            Print or save
          </button>
        </div>
      </section>

      <section className="panel">
        <dl className="summary">
          <div>
            <dt>Order status</dt>
            <dd>
              <span className="status-pill">{order.status === "New" ? "Received, awaiting review" : order.status}</span>
            </dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd>{order.payment_status === "Pending confirmation" ? "Not requested yet. We send payment details once the order is confirmed." : order.payment_status}</dd>
          </div>
          {order.tracking && (
            <div>
              <dt>Tracking</dt>
              <dd>{[order.carrier, order.tracking].filter(Boolean).join(" ")}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="panel">
        <h2 className="panel-title">Shipping</h2>
        <p className="muted small">{order.shipping_note ?? "Shipping is arranged and paid for by the reseller."}</p>
        {order.shipments.map((s, k) => (
          <ShipmentBox key={s.id} s={s} n={k + 1} total={order.shipments.length} order={order} token={token!} onChange={setOrder} />
        ))}
      </section>

      <section className="panel">
        <h2 className="panel-title">Products</h2>
        <table className="review-table">
          <tbody>
            {order.items.map((l) => (
              <tr key={`${l.code}|${l.option ?? ""}`}>
                <td>
                  <div>{l.name}</div>
                  <div className="muted small">
                    {country ? (
                      <Link to={`/${country.slug}/${l.code}`} className="code">
                        {l.code}
                      </Link>
                    ) : (
                      <span className="code">{l.code}</span>
                    )}
                    {l.option ? ` · ${l.option}` : ""}
                  </div>
                </td>
                <td className="r">{l.qty}</td>
                <td className="r num-strong">{l.line_minor !== null ? money(l.line_minor, order.symbol) : "To confirm"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="summary">
          <div>
            <dt>Subtotal</dt>
            <dd className="num-strong">
              {money(order.subtotal_minor, order.symbol)} {order.currency}
            </dd>
          </div>
          <div>
            <dt>Shipping</dt>
            <dd>
              {order.shipments.every((x) => x.arranged_by === "reseller")
                ? "Not included: arranged with your own prepaid label"
                : order.shipments
                    .filter((x) => x.arranged_by === "ravisn")
                    .map((x) => (x.charge_minor !== null ? `Ravisn quote ${money(x.charge_minor, order.symbol)}` : "Ravisn quote to be confirmed"))
                    .join(", ")}
            </dd>
          </div>
        </dl>
      </section>

      {order.delivery && (
        <section className="panel">
          <h2 className="panel-title">Delivery</h2>
          <p>
            {order.delivery.recipient_name}
            <br />
            {order.delivery.address1}
            {order.delivery.address2 && (
              <>
                <br />
                {order.delivery.address2}
              </>
            )}
            <br />
            {[order.delivery.city, order.delivery.region, order.delivery.postcode].filter(Boolean).join(", ")}
            <br />
            {dest?.name ?? order.delivery.country}
          </p>
        </section>
      )}

      {order.updates.length > 0 && (
        <section className="panel">
          <h2 className="panel-title">Updates</h2>
          <ul className="updates">
            {order.updates.map((u, i) => (
              <li key={i}>
                <span className="muted small">{when(u.at)}</span>
                <span>{u.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flow-actions">
        <button className="text-btn" onClick={() => openChat(`I have a question about order ${order.number}`)}>
          Ask about this order
        </button>
        <Link to="/" className="btn btn-dark">
          Back to the catalogue
        </Link>
      </div>
    </main>
  );
}

const PAY: Record<Shipment["payment_status"], string> = {
  not_applicable: "",
  quote_pending: "Ravisn is preparing your shipping quote",
  awaiting_payment: "Shipping quote ready: awaiting payment",
  paid: "Shipping paid",
};
const LABEL: Record<Shipment["label_status"], string> = { none: "No label yet", submitted: "Label received, being checked", approved: "Label checked", rejected: "Label needs a change" };

function ShipmentBox({ s, n, total, order, token, onChange }: { s: Shipment; n: number; total: number; order: PublicOrder; token: string; onChange: (o: PublicOrder) => void }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState({ carrier: s.carrier ?? "", service: s.service ?? "", tracking: s.tracking ?? "", instructions: s.instructions ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = s.dispatch_status === "dispatched";
  const base = `/api/store/orders/${order.number}/shipments/${s.id}`;
  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await api<PublicOrder>(base, { body, headers: { "X-Order-Token": token } }));
      setEdit(false);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${base}/label`, { method: "POST", body: form, headers: { "X-Ravisn-Store": "1", "X-Order-Token": token } });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "The label could not be uploaded");
      onChange(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    const res = await fetch(`${base}/label`, { headers: { "X-Order-Token": token } });
    if (!res.ok) return setError("The label could not be opened");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = s.label?.filename ?? "label";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  return (
    <div className="shipment">
      <div className="shipment-head">
        <strong>{total > 1 ? `Shipment ${n} of ${total}` : "Your shipment"}</strong>
        <span className={done ? "status-pill pill-good" : "status-pill"}>{done ? `Dispatched ${new Date(s.dispatched_at!).toLocaleDateString("en-GB")}` : "Not dispatched yet"}</span>
      </div>
      {total > 1 && <p className="muted small">Products: {s.lines.join(", ")}</p>}
      <dl className="summary compact">
        <div>
          <dt>Arranged by</dt>
          <dd>{s.arranged_by === "ravisn" ? "Ravisn (shipping quoted separately)" : "You, with your own prepaid label"}</dd>
        </div>
        {s.arranged_by === "ravisn" && (
          <div>
            <dt>Shipping charge</dt>
            <dd>
              {s.charge_minor !== null ? `${order.symbol}${(s.charge_minor / 100).toFixed(2)} ${order.currency}` : "Not quoted yet"}
              {PAY[s.payment_status] && <span className="muted"> · {PAY[s.payment_status]}</span>}
            </dd>
          </div>
        )}
        {(s.carrier || s.service) && (
          <div>
            <dt>Carrier</dt>
            <dd>{[s.carrier, s.service].filter(Boolean).join(", ")}</dd>
          </div>
        )}
        {s.tracking && (
          <div>
            <dt>Tracking</dt>
            <dd className="code">{s.tracking}</dd>
          </div>
        )}
        {s.arranged_by === "reseller" && (
          <div>
            <dt>Label</dt>
            <dd>
              {LABEL[s.label_status]}
              {s.label && (
                <>
                  {" · "}
                  <button className="text-btn" onClick={download}>
                    {s.label.filename}
                  </button>
                </>
              )}
              {s.label_note && <div className="hint">{s.label_note}</div>}
            </dd>
          </div>
        )}
        {s.address_requested && (
          <div>
            <dt>Dispatch address</dt>
            <dd>Requested. Ravisn will confirm the authorised address and label requirements with you privately, by email or WhatsApp.</dd>
          </div>
        )}
      </dl>
      {error && <div className="field-error">{error}</div>}
      {!done && (
        <div className="shipment-actions">
          {edit ? (
            <form
              className="ship-form"
              onSubmit={(e) => {
                e.preventDefault();
                call(v);
              }}
            >
              <div className="field-row">
                <label className="field">
                  <span>Carrier</span>
                  <input value={v.carrier} onChange={(e) => setV({ ...v, carrier: e.target.value })} maxLength={60} />
                </label>
                <label className="field">
                  <span>Service</span>
                  <input value={v.service} onChange={(e) => setV({ ...v, service: e.target.value })} maxLength={60} />
                </label>
              </div>
              <label className="field">
                <span>Tracking number</span>
                <input value={v.tracking} onChange={(e) => setV({ ...v, tracking: e.target.value })} maxLength={80} />
              </label>
              <label className="field">
                <span>Shipping instructions</span>
                <textarea rows={2} value={v.instructions} onChange={(e) => setV({ ...v, instructions: e.target.value })} maxLength={800} />
              </label>
              <div className="row-gap">
                <button className="btn btn-dark btn-small" disabled={busy}>
                  Save shipping details
                </button>
                <button type="button" className="btn btn-light btn-small" onClick={() => setEdit(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="row-gap">
              {s.arranged_by === "reseller" && (
                <>
                  <button className="btn btn-light btn-small" onClick={() => setEdit(true)}>
                    {s.carrier || s.tracking ? "Change carrier or tracking" : "Add carrier and tracking"}
                  </button>
                  <label className="btn btn-light btn-small file-btn">
                    {s.label ? "Replace label" : "Upload label"}
                    <input type="file" hidden accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                  </label>
                  {!s.address_requested && (
                    <button className="btn btn-light btn-small" disabled={busy} onClick={() => call({ request_address: true })}>
                      Ask for the dispatch address
                    </button>
                  )}
                  <button className="text-btn" disabled={busy} onClick={() => call({ arranged_by: "ravisn" })}>
                    Ask Ravisn to arrange it instead
                  </button>
                </>
              )}
              {s.arranged_by === "ravisn" && s.payment_status === "quote_pending" && (
                <button className="text-btn" disabled={busy} onClick={() => call({ arranged_by: "reseller" })}>
                  I'll arrange my own label instead
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function OrdersList({ site }: { site: Site }) {
  useTitle("Your order references · Ravisn Ltd");
  const list = savedOrders();
  return (
    <main className="wrap narrow-page">
      <h1 className="page-title">Your order references</h1>
      <p className="muted">Orders sent from this browser. To open an order on another device, use the link you copied when you sent it.</p>
      {list.length === 0 ? (
        <div className="empty-state">
          <p>No orders sent from this browser yet.</p>
          <Link to="/" className="btn btn-dark">
            Browse the catalogue
          </Link>
        </div>
      ) : (
        <ul className="ref-list">
          {list.map((o) => (
            <li key={o.number}>
              <Link to={`/order/${o.number}`}>
                <span className="order-ref small-ref">{o.number}</span>
                <span className="muted small">
                  {site.countries.find((c) => c.slug === o.catalogue)?.name} · {when(o.at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
