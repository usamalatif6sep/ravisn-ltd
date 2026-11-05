import { useEffect, useState } from "react";
import { clearCart, removeLine, setQty, useCart } from "../cart";
import { Loading, ProductImage, QtyStepper } from "../components";
import { loadCountry, type Product, type Site } from "../data";
import { money, title } from "../format";
import { Link, navigate, useTitle } from "../router";

export interface PricedLine {
  code: string;
  option: string | null;
  qty: number;
  product: Product | null;
  unit: number | null;
  problem: string | null;
}

export function priceLines(lines: { code: string; option: string | null; qty: number }[], products: Product[]): PricedLine[] {
  return lines.map((l) => {
    const p = products.find((x) => x.code === l.code) ?? null;
    if (!p) return { ...l, product: null, unit: null, problem: "No longer in the catalogue" };
    if (p.availability === "unavailable") return { ...l, product: p, unit: null, problem: "Out of stock" };
    if (p.tiers?.length) {
      const t = p.tiers.find(([label]) => label === l.option);
      return { ...l, product: p, unit: t ? t[1] : null, problem: t ? null : "Choose an option again" };
    }
    return { ...l, product: p, unit: p.price, problem: null };
  });
}

export function useCartLines(site: Site) {
  const cart = useCart();
  const country = site.countries.find((c) => c.slug === cart.catalogue) ?? null;
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    if (!country) {
      setProducts([]);
      return;
    }
    setProducts(null);
    loadCountry(country.slug).then(setProducts, () => setProducts([]));
  }, [country?.slug]);
  const lines = products ? priceLines(cart.lines, products) : null;
  const subtotal = lines?.reduce((a, l) => a + (l.unit ?? 0) * l.qty, 0) ?? 0;
  const pending = lines?.some((l) => l.unit === null) ?? false;
  return { cart, country, lines, subtotal, pending };
}

export default function OrderPage({ site }: { site: Site }) {
  useTitle("Your order · Ravisn Ltd");
  const { cart, country, lines, subtotal, pending } = useCartLines(site);

  if (!cart.lines.length || !country) {
    return (
      <main className="wrap narrow-page">
        <h1 className="page-title">Your order</h1>
        <div className="empty-state">
          <p className="lede small-lede">Your order is empty.</p>
          <p className="muted">Browse a catalogue, open a product, choose the option and quantity, then add it to your order.</p>
          <div className="row-gap">
            {site.countries.map((c) => (
              <Link key={c.slug} to={`/${c.slug}`} className="btn btn-light">
                {c.name}
              </Link>
            ))}
          </div>
          <Link to="/orders" className="text-link">
            Find an order you have already sent
          </Link>
        </div>
      </main>
    );
  }
  if (!lines) return <Loading />;
  const blocked = lines.some((l) => l.problem);

  return (
    <main className="wrap narrow-page">
      <p className="eyebrow">{country.name} catalogue · Prices in {country.currency}</p>
      <h1 className="page-title">Your order</h1>
      <ol className="flow" aria-label="Order steps">
        <li className="on">Products</li>
        <li>Delivery details</li>
        <li>Review and send</li>
      </ol>

      <section className="panel">
        <ul className="lines">
          {lines.map((l) => (
            <li key={`${l.code}|${l.option ?? ""}`} className="line">
              <div className="line-img">{l.product ? <ProductImage product={l.product} size="thumb" /> : <div className="img-tile img-thumb img-empty" />}</div>
              <div className="line-main">
                <div className="line-title">
                  {l.product ? (
                    <Link to={`/${country.slug}/${l.code}`}>{title(l.product)}</Link>
                  ) : (
                    <span>{l.code}</span>
                  )}
                </div>
                <div className="line-meta">
                  <span className="code">{l.code}</span>
                  {l.option && <span>Option: {l.option}</span>}
                  {l.unit !== null && <span>{money(l.unit, country.symbol)} each</span>}
                </div>
                {l.problem && <div className="line-problem">{l.problem}. Remove it to continue.</div>}
                <div className="line-actions">
                  <QtyStepper value={l.qty} onChange={(n) => setQty(l.code, l.option, n)} label={`Quantity of ${l.code}`} />
                  <button className="text-btn" onClick={() => removeLine(l.code, l.option)}>
                    Remove
                  </button>
                </div>
              </div>
              <div className="line-total num-strong">{l.unit !== null ? money(l.unit * l.qty, country.symbol) : "To confirm"}</div>
            </li>
          ))}
        </ul>
        <div className="totals">
          <div>
            <span>Subtotal</span>
            <span className="num-strong">
              {money(subtotal, country.symbol)} {country.currency}
            </span>
          </div>
          {pending && <p className="muted small">Some prices are confirmed by our team and are not included.</p>}
          <div className="muted">
            <span>Delivery</span>
            <span>Confirmed by Ravisn Ltd</span>
          </div>
        </div>
      </section>

      <div className="flow-actions">
        <button className="text-btn" onClick={() => confirm("Remove every product from this order?") && clearCart()}>
          Empty order
        </button>
        <div className="row-gap">
          <Link to={`/${country.slug}`} className="btn btn-light">
            Add more products
          </Link>
          <button className="btn btn-dark" disabled={blocked} onClick={() => navigate("/order/checkout")}>
            Continue to delivery details
          </button>
        </div>
      </div>
      <p className="muted small center-note">No payment is taken on this website. Our team reviews every order and confirms stock, price and delivery with you first.</p>
    </main>
  );
}
