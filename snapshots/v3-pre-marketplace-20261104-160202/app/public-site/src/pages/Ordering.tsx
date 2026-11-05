import { openChat } from "../components";
import type { Country, Site } from "../data";
import { Link, useTitle } from "../router";

export default function Ordering({ country }: { site: Site; country: Country }) {
  useTitle(`${country.name} ordering and policies · Ravisn Ltd`);
  return (
    <main className="wrap prose-page">
      <p className="eyebrow">
        <Link to={`/${country.slug}`}>{country.name}</Link> · Ordering
      </p>
      <h1>Ordering and policies</h1>
      <p className="lede small-lede">These terms apply to every order from the {country.name} catalogue. Sending an order means you have read and accepted them.</p>
      <section className="policy">
        <h2>How to order</h2>
        <ol className="steps compact">
          {country.ordering.map((s, i) => (
            <li key={i}>
              <span className="step-num">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </section>
      {country.policies.map((sec) => (
        <section key={sec.heading} className="policy">
          <h2>{sec.heading}</h2>
          <dl>
            {sec.items.map((it) => (
              <div key={it.title}>
                <dt>{it.title}</dt>
                <dd>{it.body}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <div className="contact-inline">
        <Link to={`/${country.slug}`} className="btn btn-dark">
          Browse {country.name}
        </Link>
        <button className="btn btn-light" onClick={() => openChat(`I have a question about the ${country.name} policies`)}>
          Ask a question
        </button>
      </div>
    </main>
  );
}
