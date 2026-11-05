import { useEffect, useRef, useState, type ReactNode } from "react";
import { units, useCart } from "./cart";
import { loadHome, type Country, type Department, type Product, type Site } from "./data";
import { num, priceLabel, stockLabel, title } from "./format";
import { Link, useLocation } from "./router";
import { hires, MARKET_CODE } from "./brand";
import { Icon, type IconName } from "./icons";

export const IMAGE_NOTICE =
  "Product images are provided for reference. Packaging, colours and presentation may vary. Please review the linked product details and confirm the exact specifications, size, variation and quantity before listing or ordering.";
export const ILLUSTRATIVE_NOTICE = "Illustrative image only. Please confirm the exact item using the product reference and specifications.";
export const SHIPPING_NOTE = "Shipping is arranged and paid for by the reseller. You may provide your own prepaid label or request a shipping quote from Ravisn.";

export function ChatIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16h-6.2L7 19.5V16a2.5 2.5 0 0 1-2.5-2.5v-7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function BagIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.5 8h13l-1 11.2a1.8 1.8 0 0 1-1.8 1.6H8.3a1.8 1.8 0 0 1-1.8-1.6L5.5 8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

const Chevron = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="m2 3.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

function useDepartments() {
  const [d, setD] = useState<Department[]>([]);
  useEffect(() => {
    loadHome().then((h) => setD(h.departments), () => {});
  }, []);
  return d;
}

function Menu({ label, children, active }: { label: string; children: (close: () => void) => ReactNode; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { path } = useLocation();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className={open ? "nav-menu open" : "nav-menu"} ref={ref} onMouseLeave={() => setOpen(false)}>
      <button className={active ? "nav-link on" : "nav-link"} aria-expanded={open} onClick={() => setOpen((o) => !o)} onMouseEnter={() => setOpen(true)}>
        {label} <Chevron />
      </button>
      {open && <div className="nav-panel">{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function Header({ site, active }: { site: Site | null; active?: string }) {
  const cart = useCart();
  const n = units(cart);
  const deps = useDepartments();
  const { path } = useLocation();
  const [mobile, setMobile] = useState(false);
  useEffect(() => setMobile(false), [path]);
  const total = site?.countries.reduce((a, c) => a + c.count, 0) ?? 0;
  return (
    <>
      <div className="announce" role="note">
        <div className="wrap announce-row">
          <span>Wholesale stock in the {site ? site.countries.map((c) => c.key).join(", ").replace(/, ([^,]*)$/, " and $1") : "UK, USA, Canada, Germany and Australia"}</span>
          <span className="announce-sep" aria-hidden="true" />
          <span>Every order confirmed by our team before payment</span>
          <span className="announce-sep" aria-hidden="true" />
          <Link to="/shipping">Shipping arranged by you, or quoted by Ravisn</Link>
        </div>
      </div>
      <header className="site-header">
        <div className="wrap header-row">
          <Link to="/" className="wordmark" aria-label="Ravisn Ltd home">
            Ravisn<span className="wordmark-dot" aria-hidden="true">.</span>
            <span className="wordmark-sub">Ltd</span>
          </Link>
          <nav className="main-nav" aria-label="Main">
            <Menu label="Shop" active={!!active || path.startsWith("/products") || path.startsWith("/countries")}>
              {() => (
                <div className="panel-grid">
                  <div>
                    <div className="panel-head">Shop by country</div>
                    {site?.countries.map((c) => (
                      <Link key={c.slug} to={`/${c.slug}`} className="panel-link">
                        <span>{c.name}</span>
                        <span className="muted small">{num(c.count)}</span>
                      </Link>
                    ))}
                  </div>
                  <div className="panel-feature">
                    <div className="panel-head">Full catalogue</div>
                    <p className="muted small">{num(total)} products with permanent Ravisn references.</p>
                    <Link to="/products" className="btn btn-dark btn-small">
                      All products
                    </Link>
                    <Link to="/countries" className="text-link small">
                      Compare countries
                    </Link>
                  </div>
                </div>
              )}
            </Menu>
            <Menu label="Categories" active={path.startsWith("/categories")}>
              {() => (
                <div className="panel-cats">
                  {deps.map((d) => (
                    <Link key={d.slug} to={`/categories/${d.slug}`} className="panel-link">
                      <span>{d.name}</span>
                      <span className="muted small">{num(d.count)}</span>
                    </Link>
                  ))}
                  <Link to="/categories" className="text-link small panel-all">
                    All categories
                  </Link>
                </div>
              )}
            </Menu>
            <Link to="/how-it-works" className={path === "/how-it-works" ? "nav-link on" : "nav-link"}>
              How it works
            </Link>
            <Link to="/shipping" className={path === "/shipping" ? "nav-link on" : "nav-link"}>
              Shipping
            </Link>
            <Link to="/faq" className={path === "/faq" ? "nav-link on" : "nav-link"}>
              Help
            </Link>
          </nav>
          <div className="header-actions">
            <Link to="/track" className="header-link">
              Track order
            </Link>
            <Link to="/contact" className="header-link hide-sm">
              Contact
            </Link>
            <Link to="/order" className="bag-link" aria-label={n ? `My order, ${n} ${n === 1 ? "item" : "items"}` : "My order"}>
              <BagIcon />
              {n > 0 && <span className="bag-count">{n > 99 ? "99+" : n}</span>}
            </Link>
            <button className="burger" aria-label="Menu" aria-expanded={mobile} onClick={() => setMobile((m) => !m)}>
              <span />
              <span />
            </button>
          </div>
        </div>
        {mobile && (
          <div className="mobile-nav">
            <div className="wrap">
              <div className="panel-head">Shop</div>
              <Link to="/products" className="panel-link">
                All products
              </Link>
              {site?.countries.map((c) => (
                <Link key={c.slug} to={`/${c.slug}`} className="panel-link">
                  {c.name}
                </Link>
              ))}
              <div className="panel-head">Categories</div>
              {deps.slice(0, 6).map((d) => (
                <Link key={d.slug} to={`/categories/${d.slug}`} className="panel-link">
                  {d.name}
                </Link>
              ))}
              <Link to="/categories" className="panel-link">
                All categories
              </Link>
              <div className="panel-head">Ravisn</div>
              {[
                ["/how-it-works", "How it works"],
                ["/shipping", "Shipping and labels"],
                ["/track", "Track an order"],
                ["/order", "My order"],
                ["/faq", "Help and FAQs"],
                ["/contact", "Contact"],
              ].map(([to, label]) => (
                <Link key={to} to={to} className="panel-link">
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>
    </>
  );
}

export function Footer({ site }: { site: Site | null }) {
  const deps = useDepartments();
  if (!site) return null;
  const updated = new Date(site.generated).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const total = site.countries.reduce((a, c) => a + c.count, 0);
  return (
    <footer className="site-footer lx-footer">
      <div className="wrap">
        <div className="lx-foot-cta">
          <div>
            <p className="eyebrow lx-eyebrow-light">Reseller support</p>
            <h2>Questions before you order? We're here.</h2>
            <p>Ask the Ravisn Assistant anything about products, ordering or shipping, or reach the team directly.</p>
          </div>
          <div className="lx-foot-cta-actions">
            <button className="btn lx-btn-gold btn-lg" onClick={() => openChat()}>
              <Icon name="chat" size={18} /> Chat with Ravisn
            </button>
            <a className="btn lx-btn-glass btn-lg" href={`https://wa.me/${site.whatsapp.number}`} target="_blank" rel="noopener noreferrer">
              <Icon name="whatsapp" size={18} /> WhatsApp
            </a>
          </div>
        </div>

        <ul className="lx-foot-promises">
          {(
            [
              ["shield", "Confirmed before payment", "Our team checks every order"],
              ["tag", "Per-unit wholesale prices", "In each market's own currency"],
              ["label", "Flexible shipping", "Your label, or a Ravisn quote"],
              ["lock", "Private order links", "No account needed"],
            ] as [IconName, string, string][]
          ).map(([icon, h, t]) => (
            <li key={h}>
              <span className="lx-ico lx-ico-light">
                <Icon name={icon} size={19} />
              </span>
              <span>
                <strong>{h}</strong>
                <small>{t}</small>
              </span>
            </li>
          ))}
        </ul>

        <div className="lx-foot-grid">
          <div className="lx-foot-brand">
            <Link to="/" className="wordmark footer-mark" aria-label="Ravisn Ltd home">
              Ravisn<span className="wordmark-dot">.</span>
              <span className="wordmark-sub">Ltd</span>
            </Link>
            <p>
              Ravisn Ltd supplies resellers with {num(total)} wholesale products across {site.countries.length} markets. Every product has a permanent Ravisn reference, and every order is reviewed by our team before payment.
            </p>
            <div className="lx-foot-contact">
              <a href={`mailto:${site.email}`}>
                <Icon name="mail" size={17} /> {site.email}
              </a>
              <a href={`https://wa.me/${site.whatsapp.number}`} target="_blank" rel="noopener noreferrer">
                <Icon name="whatsapp" size={17} /> WhatsApp {site.whatsapp.display}
              </a>
            </div>
            <div className="lx-foot-markets" aria-label="Markets">
              {site.countries.map((c) => (
                <Link key={c.slug} to={`/${c.slug}`}>
                  <span>{MARKET_CODE[c.slug] ?? c.key}</span> {c.currency}
                </Link>
              ))}
            </div>
          </div>
          <nav aria-label="Shop">
            <div className="footer-head">Shop</div>
            <Link to="/products">All products</Link>
            <Link to="/products?sort=new">New arrivals</Link>
            <Link to="/products?avail=available">Available now</Link>
            <Link to="/countries">Compare markets</Link>
            {site.countries.map((c) => (
              <Link key={c.slug} to={`/${c.slug}`}>
                {c.name}
              </Link>
            ))}
          </nav>
          <nav aria-label="Categories">
            <div className="footer-head">Categories</div>
            {deps.slice(0, 8).map((d) => (
              <Link key={d.slug} to={`/categories/${d.slug}`}>
                {d.name}
              </Link>
            ))}
            <Link to="/categories">All categories</Link>
          </nav>
          <nav aria-label="Ordering and help">
            <div className="footer-head">Ordering and help</div>
            <Link to="/how-it-works">How ordering works</Link>
            <Link to="/shipping">Shipping and labels</Link>
            <Link to="/track">Track an order</Link>
            <Link to="/order">My order</Link>
            <Link to="/orders">Saved order references</Link>
            <Link to="/faq">Help and FAQs</Link>
            <Link to="/contact">Contact us</Link>
          </nav>
          <nav aria-label="Company and legal">
            <div className="footer-head">Company</div>
            <Link to="/about">About Ravisn</Link>
            <Link to="/terms">Terms and conditions</Link>
            <Link to="/returns">Returns and refunds</Link>
            <Link to="/privacy">Privacy notice</Link>
            <div className="footer-head lx-foot-sub">Market policies</div>
            {site.countries.map((c) => (
              <Link key={c.slug} to={`/${c.slug}/ordering`}>
                {c.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <div className="lx-foot-base">
        <div className="wrap">
          <span>
            © {new Date(site.generated).getFullYear()} {site.company}. All rights reserved.
          </span>
          <span>Catalogue updated {updated} · Prices per unit in local currency · Shipping not included</span>
        </div>
      </div>
    </footer>
  );
}

export function ProductImage({ product, size = "card", index = 0 }: { product: Product; size?: "card" | "hero" | "thumb"; index?: number }) {
  // Try a sharper size of the same photo first, then the stored size, then the placeholder.
  const [tries, setTries] = useState(0);
  const raw = product.images[index];
  const sharp = hires(raw, size === "hero" ? 1600 : size === "thumb" ? 225 : 500);
  const src = tries === 0 && sharp ? sharp : raw;
  const failed = tries > (sharp && sharp !== raw ? 1 : 0);
  useEffect(() => setTries(0), [raw]);
  if (!src || failed) {
    return (
      <div className={`img-tile img-${size} img-empty`} role="img" aria-label={`Photo of ${product.code} coming soon`}>
        <svg width={size === "hero" ? 40 : 24} height={size === "hero" ? 40 : 24} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="12" cy="12.5" r="3.3" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        {size !== "thumb" && <span>Photo coming soon</span>}
      </div>
    );
  }
  return (
    <div className={`img-tile img-${size}`}>
      <img src={src} alt={title(product)} loading={size === "hero" ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setTries((t) => t + 1)} />
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
          {showCountry && <span className="card-country">{country.key}</span>}
        </div>
        <div className="card-title">{product.name}</div>
        {product.variant && <div className="card-variant">{product.variant}</div>}
        <div className="card-price">{priceLabel(product, country.symbol)}</div>
        <div className="card-foot">
          <AvailabilityLabel product={product} />
          <span className="card-stock">{product.availability !== "unavailable" && stockLabel(product)}</span>
        </div>
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

/** A horizontally scrolling row with arrow buttons; swipe and keyboard friendly. */
export function Rail({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <div className="rail-wrap">
      <button className="rail-btn prev" onClick={() => move(-1)} aria-label={`Previous ${label}`}>
        ‹
      </button>
      <div className="rail" ref={ref} role="region" aria-label={label} tabIndex={0}>
        {children}
      </div>
      <button className="rail-btn next" onClick={() => move(1)} aria-label={`Next ${label}`}>
        ›
      </button>
    </div>
  );
}

export function SectionHead({ eyebrow, title, link }: { eyebrow?: string; title: string; link?: { to: string; label: string } }) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="section-title">{title}</h2>
      </div>
      {link && (
        <Link to={link.to} className="text-link">
          {link.label}
        </Link>
      )}
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
        Back to the home page
      </Link>
    </div>
  );
}

export const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

/** Opens the chat panel from anywhere on the site, optionally with a question. */
export function openChat(message?: string, send = false) {
  window.dispatchEvent(new CustomEvent("ravisn-chat", { detail: { message, send } }));
}
