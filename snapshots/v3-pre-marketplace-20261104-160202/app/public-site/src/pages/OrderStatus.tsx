import { useEffect, useState } from "react";
import { api, ApiError, storeConfig, type PublicOrder, type StoreConfig } from "../api";
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
  const justSent = !!fresh && Date.now() - new Date(order.created_at).getTime() < 15 * 60 * 1000;

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

      <section className="panel ref-panel">
        <div>
          <div className="label">Order reference</div>
          <div className="order-ref">{order.number}</div>
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
            <dt>Delivery charges</dt>
            <dd>To be confirmed by Ravisn Ltd</dd>
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
