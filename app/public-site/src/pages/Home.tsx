import { useEffect, useState, type CSSProperties } from "react";
import { categoryArt, HERO_STILL_LIFE, MARKET, MARKET_CODE, PHOTO } from "../brand";
import { openChat, ProductCard, Rail, SectionHead } from "../components";
import { loadHome, type Department, type HomeData, type Site } from "../data";
import { num } from "../format";
import { Icon, type IconName } from "../icons";
import { Link, navigate, useTitle } from "../router";

/** An image that quietly removes itself if the remote photo is gone. */
function Shot({ src, className, alt = "", eager }: { src: string; className?: string; alt?: string; eager?: boolean }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return <img className={className} src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setGone(true)} />;
}

function listNames(names: string[]) {
  return names.join(", ").replace(/, ([^,]*)$/, " and $1");
}

/* ------------------------------------------------------------------ hero */

function Hero({ site, total, depts }: { site: Site; total: number; depts: number }) {
  const [q, setQ] = useState("");
  const [a, b, c] = HERO_STILL_LIFE;
  return (
    <section className="lx-hero">
      <div className="lx-hero-glow" aria-hidden="true" />
      <div className="wrap lx-hero-grid">
        <div className="lx-hero-copy">
          <p className="lx-kicker">
            <span className="lx-kicker-dot" aria-hidden="true" />
            Ravisn wholesale · {site.countries.length} catalogues
          </p>
          <h1>
            Premium stock,
            <br />
            <em>curated</em> for resellers.
          </h1>
          <p className="lx-lede">
            {num(total)} products across fragrance, beauty, wellness and more. Clear per-unit prices in local currency, and every order confirmed by our team before you pay.
          </p>
          <form
            className="lx-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(q.trim() ? `/products?q=${encodeURIComponent(q.trim())}` : "/products");
            }}
          >
            <Icon name="search" size={19} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a product, brand or Ravisn reference" aria-label="Search products" />
            <button type="submit">Search</button>
          </form>
          <div className="lx-hero-ctas">
            <Link to="/products" className="btn lx-btn-gold btn-lg">
              Browse the catalogue <Icon name="arrow" size={17} />
            </Link>
            <Link to="/how-it-works" className="btn lx-btn-glass btn-lg">
              How ordering works
            </Link>
          </div>
          <dl className="lx-hero-stats">
            <div>
              <dt>Products</dt>
              <dd>{num(total)}</dd>
            </div>
            <div>
              <dt>Markets</dt>
              <dd>{site.countries.length}</dd>
            </div>
            <div>
              <dt>Categories</dt>
              <dd>{depts || "10"}</dd>
            </div>
            <div>
              <dt>Charged online</dt>
              <dd>Nothing</dd>
            </div>
          </dl>
        </div>

        <div className="lx-hero-art" aria-hidden={!PHOTO.hero}>
          {PHOTO.hero ? (
            <img className="lx-hero-photo" src={PHOTO.hero} alt="Ravisn wholesale products" />
          ) : (
            <div className="lx-still">
              <div className="lx-arch lx-arch-main">
                <Shot src={a.src} eager />
              </div>
              <div className="lx-arch lx-arch-left">
                <Shot src={b.src} eager />
              </div>
              <div className="lx-arch lx-arch-right">
                <Shot src={c.src} eager />
              </div>
              <div className="lx-plinth" />
              <div className="lx-float lx-float-a">
                <span className="lx-float-icon">
                  <Icon name="shield" size={18} />
                </span>
                <span>
                  <strong>Confirmed by our team</strong>
                  <small>Stock, price and shipping before payment</small>
                </span>
              </div>
              <div className="lx-float lx-float-b">
                <span className="lx-currencies">
                  {site.countries.map((c2) => (
                    <span key={c2.slug}>{c2.currency}</span>
                  ))}
                </span>
                <span>
                  <strong>Per-unit pricing</strong>
                  <small>In each catalogue's own currency</small>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ service ribbon */

const RIBBON: [IconName, string][] = [
  ["shield", "Every order confirmed before payment"],
  ["tag", "Wholesale prices per unit"],
  ["globe", "UK · USA · Canada · Germany · Australia"],
  ["label", "Your own label, or a Ravisn quote"],
  ["hash", "Permanent product references"],
  ["lock", "No account needed"],
];

function Ribbon() {
  const items = [...RIBBON, ...RIBBON];
  return (
    <div className="lx-ribbon" role="note" aria-label="The Ravisn service">
      <div className="lx-ribbon-track">
        {items.map(([icon, text], i) => (
          <span key={i} className="lx-ribbon-item" aria-hidden={i >= RIBBON.length}>
            <Icon name={icon} size={17} />
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ categories */

function CategoryCard({ d, i, big }: { d: Department; i: number; big?: boolean }) {
  const art = categoryArt(d.slug, d.image, i);
  const shots = art.images.slice(0, big ? 3 : 2);
  return (
    <Link to={`/categories/${d.slug}`} className={big ? "lx-cat lx-cat-big" : "lx-cat"} style={{ "--tint": art.tint, "--tone": art.tone } as CSSProperties}>
      <div className="lx-cat-stage" aria-hidden="true">
        {art.photo ? (
          <img className="lx-cat-photo" src={art.photo} alt="" loading="lazy" />
        ) : (
          shots.map((s, k) => <Shot key={s} src={s} className={`lx-cat-shot s${k}`} />)
        )}
      </div>
      <div className="lx-cat-body">
        <span className="lx-cat-count">{num(d.count)} products</span>
        <h3>{d.name}</h3>
        <p>{art.line}</p>
        <span className="lx-cat-go">
          Shop {d.name.split(/[ ,&]/)[0].toLowerCase()} <Icon name="arrow" size={15} />
        </span>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ page */

export default function Home({ site }: { site: Site }) {
  useTitle(`${site.company} · Premium wholesale stock for resellers`);
  const [home, setHome] = useState<HomeData | null>(null);
  useEffect(() => {
    loadHome().then(setHome, () => setHome({ departments: [], featured: [], recent: [], countries: {}, hero: [], video: null }));
  }, []);
  const total = site.countries.reduce((a, c) => a + c.count, 0);
  const available = site.countries.reduce((a, c) => a + c.available, 0);
  const byslug = Object.fromEntries(site.countries.map((c) => [c.slug, c]));
  const depts = home?.departments ?? [];
  const showcase = [...depts.filter((d) => d.slug !== "more-products"), ...depts.filter((d) => d.slug === "more-products")].slice(0, 9);
  const markets = listNames(site.countries.map((c) => c.name));

  return (
    <main className="home lx">
      <Hero site={site} total={total} depts={depts.length} />
      <Ribbon />

      {/* categories */}
      <section className="wrap lx-section">
        <SectionHead eyebrow="Shop by category" title="Curated departments, ready to list." link={{ to: "/categories", label: "All categories" }} />
        {home ? (
          <div className="lx-cats">
            {showcase.map((d, i) => (
              <CategoryCard key={d.slug} d={d} i={i} big={i === 0} />
            ))}
          </div>
        ) : (
          <div className="lx-cats lx-skeleton" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className={i === 0 ? "lx-cat lx-cat-big" : "lx-cat"} />
            ))}
          </div>
        )}
      </section>

      {/* markets */}
      <section className="lx-band">
        <div className="wrap lx-section">
          <SectionHead eyebrow="Market coverage" title="Five catalogues. One way of ordering." link={{ to: "/countries", label: "Compare markets" }} />
          <div className="lx-markets">
            {site.countries.map((c) => {
              const share = c.count ? Math.round((c.available / c.count) * 100) : 0;
              return (
                <Link key={c.slug} to={`/${c.slug}`} className="lx-market" style={{ "--tone": MARKET[c.slug] ?? "#20365f" } as CSSProperties}>
                  <div className="lx-market-stage" aria-hidden="true">
                    <span className="lx-market-sym">{c.symbol}</span>
                    <span className="lx-market-avail">{share}% ready now</span>
                  </div>
                  <div className="lx-market-body">
                    <div className="lx-market-top">
                      <span className="lx-market-code">{MARKET_CODE[c.slug] ?? c.key}</span>
                      <span className="lx-market-cur">
                        {c.symbol} {c.currency}
                      </span>
                    </div>
                    <h3>{c.name}</h3>
                    <p>
                      {num(c.count)} products · {num(c.available)} available now
                    </p>
                    <span className="lx-market-go">
                      Shop {c.name} <Icon name="arrow" size={15} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* featured */}
      {home && home.featured.length > 0 && (
        <section className="wrap lx-section">
          <SectionHead eyebrow="Featured collection" title="Hand-picked from every catalogue." link={{ to: "/products", label: "View all products" }} />
          <Rail label="featured products">
            {home.featured.map(({ slug, product }) => (
              <div className="rail-item" key={product.code}>
                <ProductCard product={product} country={byslug[slug]} showCountry />
              </div>
            ))}
          </Rail>
        </section>
      )}

      {/* why ravisn */}
      <section className="wrap lx-section">
        <div className="lx-why">
          <div className="lx-why-panel">
            <p className="eyebrow lx-eyebrow-light">Why resellers choose Ravisn</p>
            <h2>A calmer way to buy wholesale.</h2>
            <p>No account to open, no card taken online and no surprises. You choose, we confirm, then you decide.</p>
            <div className="lx-why-stats">
              <div>
                <strong>{num(total)}</strong>
                <span>products listed</span>
              </div>
              <div>
                <strong>{num(available)}</strong>
                <span>available now</span>
              </div>
              <div>
                <strong>{site.countries.length}</strong>
                <span>local currencies</span>
              </div>
            </div>
            <div className="lx-why-shots" aria-hidden="true">
              {HERO_STILL_LIFE.slice(3, 5).map((s) => (
                <span key={s.id} className="lx-why-shot">
                  <Shot src={s.src} />
                </span>
              ))}
            </div>
          </div>
          <div className="lx-why-list">
            {(
              [
                ["tag", "Clear wholesale pricing", "Every price is per unit in the catalogue's own currency, with single and pack options where they exist."],
                ["shield", "Confirmed before you pay", "Sending an order is a request. Our team checks stock, price and shipping, then sends payment details."],
                ["label", "Shipping on your terms", "Upload your own prepaid label, or ask Ravisn for a separately confirmed shipping quote."],
                ["hash", "Permanent references", "Each product keeps its Ravisn reference, so your listings and repeat orders stay consistent."],
                ["globe", "Five markets, one flow", `Catalogues for the ${markets}, all ordered the same way.`],
                ["person", "Real people behind it", "The Ravisn team reviews every order and answers in the chat when available."],
              ] as [IconName, string, string][]
            ).map(([icon, h, t]) => (
              <div key={h} className="lx-why-item">
                <span className="lx-ico">
                  <Icon name={icon} size={20} />
                </span>
                <div>
                  <h3>{h}</h3>
                  <p>{t}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* how ordering works */}
      <section className="lx-band lx-band-sand">
        <div className="wrap lx-section">
          <SectionHead eyebrow="How ordering works" title="From product to parcel in four steps." link={{ to: "/how-it-works", label: "The full process" }} />
          <ol className="lx-steps">
            {(
              [
                ["search", "Choose", "Find products by market or category. Open each product's reference to check size, variation and photos."],
                ["bag", "Request", "Add products to your order, enter the recipient's details and send. Nothing is charged at this stage."],
                ["shield", "Confirm", "Our team confirms stock, price and shipping with you, then sends payment details."],
                ["truck", "Ship", "Send your own prepaid label or ask Ravisn to arrange one. Tracking appears on your order page."],
              ] as [IconName, string, string][]
            ).map(([icon, h, t], k) => (
              <li key={h} className="lx-step">
                <div className="lx-step-top">
                  <span className="lx-step-ico">
                    <Icon name={icon} size={22} />
                  </span>
                  <span className="lx-step-n">{String(k + 1).padStart(2, "0")}</span>
                </div>
                <h3>{h}</h3>
                <p>{t}</p>
              </li>
            ))}
          </ol>
          <div className="lx-steps-cta">
            <Link to="/products" className="btn btn-dark btn-lg">
              Start an order
            </Link>
            <button className="btn btn-light btn-lg" onClick={() => openChat("How do I place an order?", true)}>
              <Icon name="chat" size={17} /> Ask how it works
            </button>
          </div>
        </div>
      </section>

      {/* recent */}
      {home && home.recent.length > 0 && (
        <section className="wrap lx-section">
          <SectionHead eyebrow="New arrivals" title="Recently added to the catalogue." link={{ to: "/products?sort=new", label: "See the newest" }} />
          <Rail label="recently added products">
            {home.recent.map(({ slug, product }) => (
              <div className="rail-item" key={product.code}>
                <ProductCard product={product} country={byslug[slug]} showCountry />
              </div>
            ))}
          </Rail>
        </section>
      )}

      {/* shipping */}
      <section className="wrap lx-section">
        <div className="lx-ship">
          <div className="lx-ship-copy">
            <p className="eyebrow lx-eyebrow-light">Shipping and fulfilment</p>
            <h2>Shipping is your choice, and your cost.</h2>
            <p>Product prices never include shipping, so you stay in control of your margin. Charge your customer for delivery or build it into your selling price.</p>
            <div className="row-gap">
              <Link to="/shipping" className="btn lx-btn-gold">
                Shipping and labels
              </Link>
              <Link to="/track" className="btn lx-btn-glass">
                Track an order
              </Link>
            </div>
          </div>
          <div className="lx-ship-options">
            <div className="lx-ship-card">
              <span className="lx-ico lx-ico-light">
                <Icon name="label" size={20} />
              </span>
              <h3>Your own prepaid label</h3>
              <p>Attach it at checkout or later on your order page. We check it matches the parcel, recipient and carrier before dispatch.</p>
            </div>
            <div className="lx-ship-card">
              <span className="lx-ico lx-ico-light">
                <Icon name="truck" size={20} />
              </span>
              <h3>A Ravisn shipping quote</h3>
              <p>Ask us to arrange it. The shipping charge is confirmed separately from product prices, and tracking appears after dispatch.</p>
            </div>
          </div>
        </div>
      </section>

      {/* the ravisn standard */}
      <section className="wrap lx-section lx-standard">
        <div className="lx-standard-head">
          <p className="eyebrow">The Ravisn standard</p>
          <h2 className="section-title">Built on trust, not on fine print.</h2>
        </div>
        <div className="lx-standard-grid">
          {(
            [
              ["check", "Checked references", "Every listing links to a product reference so you can confirm the exact item, size and variation before listing."],
              ["clock", "Honest availability", "Each product shows its current status and the stock we last recorded, and we confirm both on every order."],
              ["lock", "Private by design", "Your order opens only with its private link. We keep only what we need, as our privacy notice explains."],
            ] as [IconName, string, string][]
          ).map(([icon, h, t]) => (
            <div key={h} className="lx-standard-card">
              <span className="lx-ico">
                <Icon name={icon} size={20} />
              </span>
              <h3>{h}</h3>
              <p>{t}</p>
            </div>
          ))}
        </div>
      </section>

      {/* faq + help */}
      <section className="wrap lx-section">
        <div className="lx-faq">
          <div>
            <SectionHead eyebrow="Questions" title="Good to know before your first order." link={{ to: "/faq", label: "All FAQs" }} />
            <div className="faq lx-faq-list">
              {[
                ["Is my order paid when I send it?", "No. Sending an order is a request. Our team confirms stock, price and shipping with you first, then sends payment details."],
                ["Who pays for shipping?", "You do. Shipping is separate from product prices: send your own prepaid label, or ask Ravisn for a quote."],
                ["Do I need an account?", "No. When you send an order you receive a private link to follow it. Keep it safe: it is how you, and only you, open the order."],
                ["Are the photos exact?", "Photos are a reference. Packaging, colours and presentation may vary, so open the product reference and check the size, variation and quantity."],
                ["Can I order from several countries?", "Each order holds products from one country's catalogue. Send a separate order for each country."],
              ].map(([q2, a]) => (
                <details key={q2}>
                  <summary>{q2}</summary>
                  <div className="faq-a">{a}</div>
                </details>
              ))}
            </div>
          </div>
          <aside className="lx-help">
            <span className="lx-help-avatar" aria-hidden="true">
              R
            </span>
            <h3>Need a hand?</h3>
            <p>The Ravisn Assistant can find products, explain ordering and shipping, and check your order securely. The team is one tap away.</p>
            <button className="btn lx-btn-gold btn-wide" onClick={() => openChat()}>
              <Icon name="chat" size={18} /> Chat with Ravisn
            </button>
            <div className="lx-help-links">
              <a href={`https://wa.me/${site.whatsapp.number}`} target="_blank" rel="noopener noreferrer">
                <Icon name="whatsapp" size={17} /> WhatsApp {site.whatsapp.display}
              </a>
              <a href={`mailto:${site.email}`}>
                <Icon name="mail" size={17} /> {site.email}
              </a>
            </div>
          </aside>
        </div>
      </section>

      {/* closing */}
      <section className="wrap lx-section">
        <div className="lx-closing">
          <div className="lx-closing-copy">
            <h2>
              Ready to stock <em>your</em> store?
            </h2>
            <p>Browse {num(total)} products, or tell us what you are looking for and we will help you find it.</p>
            <div className="row-gap">
              <Link to="/products" className="btn lx-btn-gold btn-lg">
                Browse all products
              </Link>
              <button className="btn lx-btn-glass btn-lg" onClick={() => openChat("Find products to resell", true)}>
                Ask the Ravisn Assistant
              </button>
            </div>
          </div>
          <div className="lx-closing-art" aria-hidden="true">
            {categoryArt("fragrance").images.slice(2, 5).map((s) => (
              <span key={s} className="lx-arch">
                <Shot src={s} />
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
