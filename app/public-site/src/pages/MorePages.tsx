import { useEffect, useState } from "react";
import { savedOrders } from "../cart";
import { IMAGE_NOTICE, openChat, SectionHead, SHIPPING_NOTE } from "../components";
import { loadHome, type HomeData, type Site } from "../data";
import { num } from "../format";
import { Link, navigate, useTitle } from "../router";

function useHome() {
  const [h, setH] = useState<HomeData | null>(null);
  useEffect(() => {
    loadHome().then(setH, () => {});
  }, []);
  return h;
}

export function Countries({ site }: { site: Site }) {
  useTitle("Shop by country · Ravisn Ltd");
  const home = useHome();
  return (
    <main className="wrap prose-wide">
      <p className="eyebrow">Shop by country</p>
      <h1 className="page-title">Five catalogues, one way of ordering.</h1>
      <p className="lede small-lede">Each catalogue holds stock in its own country, with prices per unit in local currency. One order holds products from one country.</p>
      <div className="country-showcase spaced">
        {site.countries.map((c) => (
          <Link key={c.slug} to={`/${c.slug}`} className="country-tile">
            <div className="country-collage">
              {(home?.countries[c.slug] ?? []).slice(0, 3).map((img, k) => (
                <img key={k} src={img} alt="" loading="lazy" referrerPolicy="no-referrer" />
              ))}
            </div>
            <div className="country-tile-body">
              <span className="country-code">{c.currency}</span>
              <span className="country-name">{c.name}</span>
              <span className="muted small">
                {num(c.count)} products · {num(c.available)} available now
              </span>
              <span className="muted small">{c.stock_text}</span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

export function Categories() {
  useTitle("Categories · Ravisn Ltd");
  const home = useHome();
  return (
    <main className="wrap prose-wide">
      <p className="eyebrow">Categories</p>
      <h1 className="page-title">Browse by what you sell.</h1>
      <p className="lede small-lede">Categories group products from every country catalogue. Open a category, then filter by country, availability or price.</p>
      <div className="dept-grid spaced">
        {(home?.departments ?? []).map((d) => (
          <Link key={d.slug} to={`/categories/${d.slug}`} className="dept-card">
            <div className="dept-img">{d.image && <img src={d.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}</div>
            <div className="dept-body">
              <span className="dept-name">{d.name}</span>
              <span className="muted small">
                {num(d.count)} products · {d.countries.length} {d.countries.length === 1 ? "country" : "countries"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

export function Track() {
  useTitle("Track an order · Ravisn Ltd");
  const [number, setNumber] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const saved = savedOrders();
  return (
    <main className="wrap narrow-page">
      <p className="eyebrow">Order tracking</p>
      <h1 className="page-title">Track an order</h1>
      <p className="muted">
        For your privacy, an order opens only with its private link or access key, which you received when you sent it. Knowing an order reference alone shows nothing.
      </p>
      {saved.length > 0 && (
        <section className="panel">
          <h2 className="panel-title">Orders sent from this browser</h2>
          <ul className="ref-list">
            {saved.map((o) => (
              <li key={o.number}>
                <Link to={`/order/${o.number}`}>
                  <span className="order-ref small-ref">{o.number}</span>
                  <span className="muted small">{new Date(o.at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form
        className="panel form-panel"
        onSubmit={(e) => {
          e.preventDefault();
          const n = number.trim().toUpperCase();
          let k = key.trim();
          const fromLink = /#t=([a-f0-9]{32})/i.exec(k);
          if (fromLink) k = fromLink[1];
          if (!/^(RVS-\d{4}-\d{6}|RV\d{6}-[A-Z0-9]{5})$/.test(n)) return setError("Enter the order reference, for example RVS-2026-000184");
          if (!/^[a-f0-9]{32}$/i.test(k)) return setError("Paste the private link or the 32-character access key from your order confirmation");
          navigate(`/order/${n}#t=${k}`);
        }}
      >
        <h2 className="panel-title">Open an order</h2>
        <label className="field">
          <span>Order reference</span>
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="RVS-2026-000184" autoComplete="off" />
        </label>
        <label className="field">
          <span>Private link or access key</span>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste the link you copied when you sent the order" autoComplete="off" />
        </label>
        {error && <span className="field-error">{error}</span>}
        <div className="row-gap">
          <button className="btn btn-dark">Open order</button>
          <button type="button" className="btn btn-light" onClick={() => openChat("I can't find my order link")}>
            I lost my link
          </button>
        </div>
      </form>
    </main>
  );
}

export function HowItWorks({ site }: { site: Site }) {
  useTitle("How it works · Ravisn Ltd");
  const c = site.countries[0];
  return (
    <main className="wrap prose-page">
      <p className="eyebrow">How it works</p>
      <h1>How ordering with Ravisn works</h1>
      <p className="lede small-lede">Ravisn publishes wholesale catalogues. You choose products, send an order request, and our team confirms everything with you before you pay.</p>
      <ol className="steps-luxe vertical">
        {[
          ["Find your products", "Browse by country or category, or search by name or Ravisn reference. Each product page shows its price per unit, options, status and the stock we last recorded."],
          ["Check the product reference", `Open the product reference link to confirm the size, variation, quantity and packaging. ${IMAGE_NOTICE}`],
          ["Build your order", "Choose the option and quantity and add products to your order. One order holds products from one country's catalogue."],
          ["Enter the recipient's details", "Add the recipient's name and delivery address, choose how shipping will be arranged, and add any special instructions."],
          ["Review and send", "Check every line and total, confirm the item, variation and quantity, and send the request. You receive an order reference and a private link."],
          ["We confirm, you pay", "Our team confirms stock, price and shipping with you, then sends payment details. Nothing is charged on the website."],
          ["Shipping and tracking", "Upload your prepaid label to the order, or pay the shipping quote Ravisn confirms. Once the parcel is handed to the carrier, tracking appears on your order page."],
        ].map(([h, t], k) => (
          <li key={h}>
            <span className="step-index">{String(k + 1).padStart(2, "0")}</span>
            <h3>{h}</h3>
            <p>{t}</p>
          </li>
        ))}
      </ol>
      <section className="policy">
        <h2>Country timings</h2>
        <p className="muted">Each catalogue has its own steps and cut-off times. For example, for {c.name}:</p>
        <ol className="plain-steps">
          {c.ordering.slice(3).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className="row-gap">
          {site.countries.map((x) => (
            <Link key={x.slug} to={`/${x.slug}/ordering`} className="btn btn-light btn-small">
              {x.name} policies
            </Link>
          ))}
        </div>
      </section>
      <div className="contact-inline">
        <Link to="/products" className="btn btn-dark">
          Browse products
        </Link>
        <Link to="/shipping" className="btn btn-light">
          Shipping and labels
        </Link>
      </div>
    </main>
  );
}

export function Shipping({ site }: { site: Site }) {
  useTitle("Shipping and labels · Ravisn Ltd");
  const cutoffs = site.countries.map((c) => [c.name, c.ordering.find((s) => /label/i.test(s) && /PM|AM/.test(s))] as const).filter(([, s]) => s);
  return (
    <main className="wrap prose-page">
      <p className="eyebrow">Shipping and labels</p>
      <h1>Shipping is the reseller's responsibility</h1>
      <p className="lede small-lede">{SHIPPING_NOTE} Product prices do not include shipping. You can charge your customer for shipping or include it in your own selling price.</p>
      <div className="option-cards">
        <div className="option-card">
          <span className="option-tag">Option A</span>
          <h2>You arrange shipping</h2>
          <ul className="plain-steps">
            <li>Buy a prepaid label with the carrier and service you prefer.</li>
            <li>Add the carrier, service and tracking number, and upload the label (PDF, PNG, JPEG or WebP, up to 1.5 MB) on your order page, at checkout or later before dispatch.</li>
            <li>Your label must match the confirmed dispatch origin, the recipient's address, the parcel size and weight, and the carrier arrangement.</li>
            <li>Need the dispatch address to buy a label? Ask for it on your order page; Ravisn confirms the authorised address and requirements privately.</li>
          </ul>
        </div>
        <div className="option-card">
          <span className="option-tag">Option B</span>
          <h2>Ravisn arranges shipping</h2>
          <ul className="plain-steps">
            <li>Choose "Request a shipping quote from Ravisn" at checkout, or on your order page later.</li>
            <li>We confirm the actual shipping charge, separately from product prices.</li>
            <li>Once that charge is paid, we arrange the label with the carrier.</li>
            <li>The carrier's real tracking number appears on your order page after dispatch.</li>
          </ul>
        </div>
      </div>
      <section className="policy">
        <h2>Good to know</h2>
        <dl>
          <div>
            <dt>Several shipments</dt>
            <dd>An order with products that ship separately can have a shipping arrangement per group of products. Your order page shows each one.</dd>
          </div>
          <div>
            <dt>Dispatch</dt>
            <dd>An order is marked dispatched only when the parcel has actually been handed to the carrier. We never invent tracking numbers.</dd>
          </div>
          <div>
            <dt>Label security</dt>
            <dd>Labels are stored privately with your order. Only you, with your order's private link, and the Ravisn team can open them.</dd>
          </div>
          {cutoffs.map(([name, s]) => (
            <div key={name}>
              <dt>{name} cut-off</dt>
              <dd>{s}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="contact-inline">
        <Link to="/track" className="btn btn-dark">
          Add a label to my order
        </Link>
        <button className="btn btn-light" onClick={() => openChat("Can Ravisn arrange my shipping?")}>
          Ask about shipping
        </button>
      </div>
    </main>
  );
}

export function About({ site }: { site: Site }) {
  useTitle("About Ravisn · Ravisn Ltd");
  const total = site.countries.reduce((a, c) => a + c.count, 0);
  return (
    <main className="wrap prose-page">
      <p className="eyebrow">About Ravisn</p>
      <h1>A supply partner for resellers</h1>
      <p className="lede small-lede">
        {site.company} brings wholesale stock from several countries into clear, consistent catalogues for resellers: {num(total)} products across the {site.countries.map((c) => c.name).join(", ").replace(/, ([^,]*)$/, " and $1")}.
      </p>
      <section className="policy">
        <dl>
          <div>
            <dt>What we do</dt>
            <dd>We publish catalogues with prices per unit in local currency, keep a permanent Ravisn reference for every product, and coordinate fulfilment once an order is confirmed.</dd>
          </div>
          <div>
            <dt>How we work</dt>
            <dd>Every order is reviewed by our team. We confirm stock, price and shipping with you before asking for payment, and we never mark an order dispatched before it is.</dd>
          </div>
          <div>
            <dt>Your data</dt>
            <dd>Order and chat details are used to fulfil your orders and answer you. See the privacy notice for what we keep and for how long.</dd>
          </div>
        </dl>
      </section>
      <div className="contact-inline">
        <Link to="/products" className="btn btn-dark">
          Browse products
        </Link>
        <Link to="/contact" className="btn btn-light">
          Contact us
        </Link>
      </div>
    </main>
  );
}

function policyItems(site: Site, re: RegExp) {
  return site.countries.map((c) => ({ c, items: c.policies.flatMap((s) => s.items).filter((it) => re.test(it.title) || re.test(it.body)) })).filter((x) => x.items.length);
}

export function Terms({ site }: { site: Site }) {
  useTitle("Terms and conditions · Ravisn Ltd");
  return (
    <main className="wrap prose-page">
      <p className="eyebrow">Terms and conditions</p>
      <h1>Terms of ordering</h1>
      <p className="lede small-lede">These terms describe how ordering from {site.company} works. Each country catalogue also has its own policies, which apply to orders from that catalogue.</p>
      <section className="policy">
        <dl>
          {[
            ["Orders are requests", "Sending an order is a request to buy. It becomes an agreement when Ravisn confirms stock, price and shipping and you pay in full."],
            ["Prices", "Prices are per unit in the catalogue's currency and do not include shipping. The price confirmed by our team before payment is the price you pay."],
            ["Product information", IMAGE_NOTICE],
            ["Shipping", `${SHIPPING_NOTE} Labels you supply must match the confirmed dispatch origin, destination, parcel and carrier.`],
            ["Dispatch and tracking", "An order or shipment is marked dispatched only after it has been handed to the carrier, with the carrier's own tracking number."],
            ["Product references", "Each product keeps its permanent Ravisn reference. Older catalogue codes keep working as aliases."],
            ["Country policies", "Labels, cut-off times, payment currencies, damage and other rules for each catalogue are set out in its policies, linked below."],
          ].map(([t, b]) => (
            <div key={t}>
              <dt>{t}</dt>
              <dd>{b}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="row-gap">
        {site.countries.map((c) => (
          <Link key={c.slug} to={`/${c.slug}/ordering`} className="btn btn-light btn-small">
            {c.name} policies
          </Link>
        ))}
      </div>
    </main>
  );
}

export function Returns({ site }: { site: Site }) {
  useTitle("Returns and refunds · Ravisn Ltd");
  const groups = policyItems(site, /return|refund|exchange|damag|claim|cancel/i);
  return (
    <main className="wrap prose-page">
      <p className="eyebrow">Returns and refunds</p>
      <h1>Returns, refunds and damage</h1>
      <p className="lede small-lede">These are the rules from each country's published policies. Please read them before ordering, and contact us straight away if something arrives damaged.</p>
      {groups.length === 0 && <p className="muted">No returns rules are published yet. Ask the team before ordering.</p>}
      {groups.map(({ c, items }) => (
        <section key={c.slug} className="policy">
          <h2>{c.name}</h2>
          <dl>
            {items.map((it) => (
              <div key={it.title}>
                <dt>{it.title}</dt>
                <dd>{it.body}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <div className="contact-inline">
        <button className="btn btn-dark" onClick={() => openChat("I want to report a problem with an order")}>
          Report a problem
        </button>
        <Link to="/faq" className="btn btn-light">
          FAQs
        </Link>
      </div>
    </main>
  );
}

export { SectionHead };
