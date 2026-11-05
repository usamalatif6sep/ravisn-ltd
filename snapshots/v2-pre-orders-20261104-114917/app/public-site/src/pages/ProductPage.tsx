import { useEffect, useState } from "react";
import { AvailabilityLabel, ChatIcon, Loading, ProductImage } from "../components";
import { loadCountry, type Country, type Product, type Site } from "../data";
import { mailLink, money, priceLabel, stockLabel, title, whatsappLink } from "../format";
import { Link, useTitle } from "../router";

export default function ProductPage({ site, country, code }: { site: Site; country: Country; code: string }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [image, setImage] = useState(0);
  useEffect(() => {
    loadCountry(country.slug).then(setProducts, () => setProducts([]));
  }, [country.slug]);
  useEffect(() => setImage(0), [code]);

  const product = products?.find((p) => p.code.toLowerCase() === code.toLowerCase());
  useTitle(product ? `${product.code} ${title(product)} · Ravisn Ltd` : "Product · Ravisn Ltd");

  if (products === null) return <Loading />;
  if (!product) {
    return (
      <main className="wrap problem">
        <h1>{code.toUpperCase()} is not in the {country.name} catalogue</h1>
        <p className="muted">It may have sold out or been removed. Search the catalogue, or ask us on WhatsApp.</p>
        <div className="row-gap">
          <Link to={`/${country.slug}`} className="btn btn-dark">
            Browse {country.name}
          </Link>
          <a className="btn btn-light" href={whatsappLink(site, code.toUpperCase())} target="_blank" rel="noopener noreferrer">
            Ask on WhatsApp
          </a>
        </div>
      </main>
    );
  }

  const status = site.statuses.find((s) => s.name === product.status);
  const variants = product.group ? products.filter((p) => p.group === product.group) : [];
  const stock = stockLabel(product);

  return (
    <main className="wrap product">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Catalogue</Link>
        <span>›</span>
        <Link to={`/${country.slug}`}>{country.name}</Link>
        <span>›</span>
        <Link to={`/${country.slug}?cat=${encodeURIComponent(product.category)}`}>{product.category}</Link>
      </nav>

      <div className="product-grid">
        <section className="gallery" aria-label="Photos">
          <ProductImage product={product} size="hero" index={image} />
          {product.images.length > 1 && (
            <div className="thumbs">
              {product.images.map((_, i) => (
                <button key={i} className={i === image ? "on" : undefined} onClick={() => setImage(i)} aria-label={`Photo ${i + 1}`}>
                  <ProductImage product={product} size="thumb" index={i} />
                </button>
              ))}
            </div>
          )}
          {product.images.length > 0 && product.images[0].startsWith("https://i.ebayimg.com/") && (
            <p className="photo-note">Photo from an eBay listing of this product.</p>
          )}
        </section>

        <section className="buy" aria-label="Product details">
          <span className="code code-chip">{product.code}</span>
          <h1>{product.name}</h1>
          {product.variant && <p className="variant">{product.variant}</p>}

          <div className="price-block">
            {product.tiers?.length ? (
              <table className="tiers">
                <tbody>
                  {product.tiers.map(([label, p]) => (
                    <tr key={label}>
                      <th>{label}</th>
                      <td>{money(p, country.symbol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="price">{priceLabel(product, country.symbol)}</div>
            )}
            <p className="muted small">Per unit, in {country.currency}. Prices follow the market; the price confirmed on WhatsApp is the price you pay.</p>
          </div>

          <div className="availability">
            <AvailabilityLabel product={product} />
            {stock && product.availability !== "unavailable" && <span className="stock">{stock}</span>}
            {status && <p className="muted small">{`“${status.name}” ${status.definition}`}</p>}
          </div>

          {variants.length > 1 && (
            <div className="variants">
              <div className="label">Options</div>
              <div className="variant-list">
                {variants.map((v) => (
                  <Link key={v.code} to={`/${country.slug}/${v.code}`} className={v.code === product.code ? "variant-opt on" : "variant-opt"}>
                    <span>{v.variant}</span>
                    <span className="muted">{priceLabel(v, country.symbol)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="actions">
            <a className="btn btn-dark btn-wide" href={whatsappLink(site, product.code)} target="_blank" rel="noopener noreferrer">
              <ChatIcon />
              <span>Enquire on WhatsApp</span>
            </a>
            <a className="btn btn-light btn-wide" href={mailLink(site, product.code)}>
              Email about {product.code}
            </a>
          </div>

          {product.link && (
            <a className="ref-link" href={product.link} target="_blank" rel="noopener noreferrer nofollow">
              View the reference listing on {product.link_site}
              <span aria-hidden="true"> ↗</span>
            </a>
          )}
          {product.link && <p className="muted small">Order the exact item shown there: same size, weight, variant and count.</p>}

          <dl className="facts">
            <div>
              <dt>Product code</dt>
              <dd className="code">{product.code}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{product.category}</dd>
            </div>
            <div>
              <dt>Stock held</dt>
              <dd>{country.stock_text}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>{country.currency_text}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="section how">
        <h2 className="section-title">How to order</h2>
        <ol className="steps compact">
          {country.ordering.map((s, i) => (
            <li key={i}>
              <span className="step-num">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <Link to={`/${country.slug}/ordering`} className="text-link">
          Read the {country.name} ordering policies →
        </Link>
      </section>
    </main>
  );
}
