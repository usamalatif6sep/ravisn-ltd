import { useState } from "react";
import { openChat } from "../components";
import type { Site } from "../data";
import { num } from "../format";
import { Link, navigate, useTitle } from "../router";

export default function Home({ site }: { site: Site }) {
  useTitle(`${site.company} · Reseller catalogue`);
  const [q, setQ] = useState("");
  const total = site.countries.reduce((a, c) => a + c.count, 0);
  return (
    <main>
      <section className="hero wrap">
        <p className="eyebrow">{site.company} · Reseller catalogue</p>
        <h1>
          Find a product.
          <br />
          Check the price. Order by code.
        </h1>
        <p className="lede">
          {num(total)} products held in the {site.countries.map((c) => c.name).join(", ").replace(/, ([^,]*)$/, " and $1")}. Add products to an order and send it; our team confirms stock, price and delivery before you pay.
        </p>
        <form
          className="hero-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.5 10.5 3.2 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every country by product name or code" aria-label="Search products" />
          <button className="btn btn-dark" type="submit">
            Search
          </button>
        </form>
      </section>

      <section className="wrap section">
        <h2 className="section-title">Choose a country</h2>
        <div className="country-grid">
          {site.countries.map((c) => (
            <Link key={c.slug} to={`/${c.slug}`} className="country-card">
              <span className="country-code">{c.currency}</span>
              <span className="country-name">{c.name}</span>
              <span className="country-figures">
                <span>
                  <strong>{num(c.count)}</strong> products
                </span>
                <span>
                  <strong>{num(c.available)}</strong> available now
                </span>
              </span>
              <span className="country-foot">
                {c.stock_text} · Prices in {c.currency}
              </span>
              <span className="country-cta">Browse {c.name} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap section steps-section">
        <h2 className="section-title">How ordering works</h2>
        <ol className="steps">
          {site.countries[0].ordering.slice(0, 4).map((s, i) => (
            <li key={i}>
              <span className="step-num">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="muted small">Each country has its own label and cut-off rules. Read them on the country's ordering page before your first order.</p>
      </section>

      <section className="wrap section contact-band">
        <div>
          <h2>Questions before you order?</h2>
          <p className="muted">Ask in the chat for help finding a product, or read the answers to common questions.</p>
        </div>
        <div className="contact-actions">
          <button className="btn btn-dark" onClick={() => openChat()}>
            Open chat
          </button>
          <Link to="/help" className="btn btn-light">
            Help and FAQ
          </Link>
        </div>
      </section>
    </main>
  );
}
