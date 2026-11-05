import { useState } from "react";
import { units, useCart } from "./cart";
import type { Country, Product, Site } from "./data";
import { num, priceLabel, stockLabel, title } from "./format";
import { Link } from "./router";

export const IMAGE_NOTICE =
  "Product images are provided for reference. Packaging, colours and presentation may vary. Please review the linked product details and confirm the exact specifications, size, variation and quantity before listing or ordering.";
export const ILLUSTRATIVE_NOTICE = "Illustrative image only. Please confirm the exact item using the product reference and specifications.";

export function ChatIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.1 8.6c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5.6 1 1.4 1.8 2.5 2.4.2.1.4.1.5 0l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.2.1.4.2.4.4 0 .3-.1 1-.6 1.4-.5.5-1.2.6-1.8.5-1.9-.4-3.7-1.6-4.9-3.2-.8-1.1-1.3-2.2-.9-3.4l.2-.5Z" fill="currentColor" />
    </svg>
  );
}

export function BagIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.5 8h13l-1 11.2a1.8 1.8 0 0 1-1.8 1.6H8.3a1.8 1.8 0 0 1-1.8-1.6L5.5 8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function Header({ site, active }: { site: Site | null; active?: string }) {
  const cart = useCart();
  const n = units(cart);
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link to="/" className="wordmark" aria-label="Ravisn Ltd home">
          Ravisn <span>Ltd</span>
        </Link>
        <nav className="country-nav" aria-label="Countries">
          {site?.countries.map((c) => (
            <Link key={c.slug} to={`/${c.slug}`} className={c.slug === active ? "on" : undefined}>
              {c.key}
            </Link>
          ))}
        </nav>
        <nav className="header-links" aria-label="Help and order">
          <Link to="/help" className="header-link">
            Help
          </Link>
          <Link to="/order" className="bag-link" aria-label={n ? `Your order, ${n} ${n === 1 ? "item" : "items"}` : "Your order"}>
            <BagIcon />
            {n > 0 && <span className="bag-count">{n > 99 ? "99+" : n}</span>}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer({ site }: { site: Site | null }) {
  if (!site) return null;
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div>
          <div className="wordmark footer-mark">
            Ravisn <span>Ltd</span>
          </div>
          <p className="muted small">Reseller catalogue. Every order is reviewed and confirmed by our team before payment.</p>
        </div>
        <div>
          <div className="footer-head">Catalogues</div>
          {site.countries.map((c) => (
            <Link key={c.slug} to={`/${c.slug}`}>
              {c.name}
            </Link>
          ))}
        </div>
        <div>
          <div className="footer-head">Ordering</div>
          <Link to="/order">Your order</Link>
          <Link to="/orders">Order references</Link>
          {site.countries.map((c) => (
            <Link key={c.slug} to={`/${c.slug}/ordering`}>
              {c.name} policies
            </Link>
          ))}
        </div>
        <div>
          <div className="footer-head">Support</div>
          <Link to="/help">Help and FAQ</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/privacy">Privacy notice</Link>
        </div>
      </div>
      <div className="wrap footer-base muted small">
        © {new Date(site.generated).getFullYear()} {site.company}. Catalogue updated {new Date(site.generated).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
      </div>
    </footer>
  );
}

export function ProductImage({ product, size = "card", index = 0 }: { product: Product; size?: "card" | "hero" | "thumb"; index?: number }) {
  const [failed, setFailed] = useState(false);
  const src = product.images[index];
  if (!src || failed) {
    return (
      <div className={`img-tile img-${size} img-empty`} role="img" aria-label={`Photo of ${product.code} coming soon`}>
        <svg width={size === "hero" ? 44 : 26} height={size === "hero" ? 44 : 26} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8.5 6 10 4h4l1.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <circle cx="12" cy="12.5" r="3.4" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        {size !== "thumb" && <span>Photo coming soon</span>}
      </div>
    );
  }
  return (
    <div className={`img-tile img-${size}`}>
      <img src={src} alt={title(product)} loading={size === "hero" ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      {product.illustrative && size !== "thumb" && <span className="illustrative-tag">Illustrative image</span>}
    </div>
  );
}

export function AvailabilityLabel({ product }: { product: Product }) {
  return (
    <span className={`avail avail-${product.availability}`}>
      <span className="dot" />
      {product.status}
    </span>
  );
}

export function ProductCard({ product, country, showCountry }: { product: Product; country: Country; showCountry?: boolean }) {
  return (
    <Link to={`/${country.slug}/${product.code}`} className="card" aria-label={`${title(product)}, ${priceLabel(product, country.symbol)}`}>
      <ProductImage product={product} />
      <div className="card-body">
        <div className="card-meta">
          <span className="code">{product.code}</span>
          {showCountry && <span className="card-country">{country.name}</span>}
        </div>
        <div className="card-title">{product.name}</div>
        {product.variant && <div className="card-variant">{product.variant}</div>}
        <div className="card-price">{priceLabel(product, country.symbol)}</div>
        <div className="card-foot">
          <AvailabilityLabel product={product} />
          <span className="card-stock">{product.availability !== "unavailable" && stockLabel(product)}</span>
        </div>
        <span className="card-cta">View details</span>
      </div>
    </Link>
  );
}

export function QtyStepper({ value, onChange, max = 999, label = "Quantity" }: { value: number; onChange: (n: number) => void; max?: number; label?: string }) {
  const set = (n: number) => onChange(Math.max(1, Math.min(max, Math.floor(n) || 1)));
  return (
    <div className="qty" role="group" aria-label={label}>
      <button type="button" onClick={() => set(value - 1)} disabled={value <= 1} aria-label="Fewer">
        −
      </button>
      <input inputMode="numeric" value={value} onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")))} aria-label={label} />
      <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label="More">
        +
      </button>
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="loading" aria-label={label} role="status">
      <span className="spinner" />
    </div>
  );
}

export function Problem({ text }: { text: string }) {
  return (
    <div className="wrap problem">
      <h1>Something went wrong</h1>
      <p className="muted">{text}</p>
      <Link to="/" className="btn btn-light">
        Back to the catalogue
      </Link>
    </div>
  );
}

export const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

/** Opens the chat panel from anywhere on the site. */
export function openChat(message?: string) {
  window.dispatchEvent(new CustomEvent("ravisn-chat", { detail: { message } }));
}
