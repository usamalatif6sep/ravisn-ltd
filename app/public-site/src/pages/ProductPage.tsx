import { useEffect, useState } from "react";
import { addLine, getCart } from "../cart";
import { AvailabilityLabel, IMAGE_NOTICE, ILLUSTRATIVE_NOTICE, Loading, openChat, ProductImage, QtyStepper, SHIPPING_NOTE } from "../components";
import { deptSlug, findProduct, loadCountry, type Country, type Product, type Site } from "../data";
import { money, priceLabel, stockLabel, title } from "../format";
import { Link, navigate, useTitle } from "../router";

export default function ProductPage({ site, country, code }: { site: Site; country: Country; code: string }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [image, setImage] = useState(0);
  const [option, setOption] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    loadCountry(country.slug).then(setProducts, () => setProducts([]));
  }, [country.slug]);

  const product = products ? findProduct(products, code) : undefined;
  useEffect(() => {
    // Old links with legacy codes (UK-0001) move to the permanent reference (RVN-UK-10482).
    if (product && product.code !== code) navigate(`/${country.slug}/${product.code}${location.search}`, true);
  }, [product?.code, code]);
  useEffect(() => {
    setImage(0);
    setQty(1);
    setAdded(null);
    setConflict(false);
    setOption(product?.tiers?.length === 1 ? product.tiers[0][0] : null);
  }, [code, product?.code]);
  useTitle(product ? `${product.code} ${title(product)} · Ravisn Ltd` : "Product · Ravisn Ltd");

  if (products === null) return <Loading />;
  if (!product) {
    return (
      <main className="wrap problem">
        <h1>{code.toUpperCase()} is not in the {country.name} catalogue</h1>
        <p className="muted">It may have sold out or been removed. Search the catalogue, or ask us in the chat.</p>
        <div className="row-gap">
          <Link to={`/${country.slug}`} className="btn btn-dark">
            Browse {country.name}
          </Link>
          <button className="btn btn-light" onClick={() => openChat(`I'm looking for ${code.toUpperCase()}`)}>
            Ask in the chat
          </button>
        </div>
      </main>
    );
  }

  const status = site.statuses.find((s) => s.name === product.status);
  const variants = product.group ? products.filter((p) => p.group === product.group) : [];
  const stock = stockLabel(product);
  const tiers = product.tiers ?? [];
  const unit = tiers.length ? tiers.find(([l]) => l === option)?.[1] ?? null : product.price;
  const unavailable = product.availability === "unavailable";
  const needsOption = tiers.length > 0 && !option;
  const overStock = product.qty !== null && product.qty_basis !== "minimum" && qty > product.qty;

  const add = (replace = false) => {
    if (needsOption || unavailable) return;
    if (!addLine(country.slug, product.code, option, qty, replace)) {
      setConflict(true);
      return;
    }
    setConflict(false);
    setAdded(`${qty} × ${product.code}${option ? ` (${option})` : ""} added to your order`);
  };
  const otherCountry = site.countries.find((c) => c.slug === getCart().catalogue);

  return (
    <main className="wrap product">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Catalogue</Link>
        <span>›</span>
        <Link to={`/${country.slug}`}>{country.name}</Link>
        <span>›</span>
        <Link to={`/categories/${deptSlug(product.department)}`}>{product.department}</Link>
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
          <div className="image-notice" role="note">
            {product.illustrative && <p className="illustrative-note">{ILLUSTRATIVE_NOTICE}</p>}
            <p>{IMAGE_NOTICE}</p>
            {product.link ? (
              <a className="ref-link" href={product.link} target="_blank" rel="noopener noreferrer nofollow">
                View the product reference on {product.link_site}
                <span aria-hidden="true"> ↗</span>
              </a>
            ) : (
              <p className="muted">No reference listing is available for this product. Ask us for details before ordering.</p>
            )}
          </div>
        </section>

        <section className="buy" aria-label="Product details">
          <div className="buy-meta">
            <span className="code code-chip">{product.code}</span>
            <span className="muted small">{country.name}</span>
          </div>
          <h1>{product.name}</h1>
          {product.variant && <p className="variant">{product.variant}</p>}

          <div className="price-block">
            <div className="price">{unit !== null && unit !== undefined ? money(unit, country.symbol) : priceLabel(product, country.symbol)}</div>
            <p className="muted small">
              Per unit, in {country.currency}.{" "}
              {needsOption ? "Choose an option below to see its price." : unit === null ? "We confirm the price before you pay." : "Ravisn Ltd confirms the final price, stock and delivery before payment."}
            </p>
          </div>

          <div className="availability">
            <AvailabilityLabel product={product} />
            {stock && !unavailable && <span className="stock">{stock}</span>}
            {status && <p className="muted small">{`“${status.name}” ${status.definition}`}</p>}
          </div>

          {variants.length > 1 && (
            <div className="variants">
              <div className="label">Variation</div>
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

          {tiers.length > 0 && (
            <div className="variants">
              <div className="label" id="opt-label">
                Option <span className="req-mark">Required</span>
              </div>
              <div className="variant-list" role="radiogroup" aria-labelledby="opt-label">
                {tiers.map(([label, price]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={option === label}
                    aria-label={`${label}, ${money(price, country.symbol)}`}
                    className={option === label ? "variant-opt on" : "variant-opt"}
                    onClick={() => setOption(label)}
                  >
                    <span>{label}</span>
                    <span className="muted">{money(price, country.symbol)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!unavailable ? (
            <div className="order-box">
              <div className="order-row">
                <div>
                  <div className="label">Quantity</div>
                  <QtyStepper value={qty} onChange={setQty} />
                </div>
                {unit != null && (
                  <div className="order-line-total">
                    <div className="label">Line total</div>
                    <div className="num-strong">{money(unit * qty, country.symbol)}</div>
                  </div>
                )}
              </div>
              {overStock && <p className="hint">That is more than the {product.qty} reported in stock. You can still ask; we will confirm what is available.</p>}
              {product.availability === "pending" && <p className="hint">This item is “{product.status}”. We will confirm timing before you pay.</p>}
              <button className="btn btn-dark btn-wide" onClick={() => add()} disabled={needsOption}>
                {needsOption ? "Choose an option" : "Add to order"}
              </button>
              {conflict && (
                <div className="notice notice-warn" role="alert">
                  <p>
                    Your order already holds products from {otherCountry?.name ?? "another catalogue"}. Each order is fulfilled from one country, so send that order first or start a new one.
                  </p>
                  <div className="row-gap">
                    <Link to="/order" className="btn btn-light btn-small">
                      View current order
                    </Link>
                    <button className="btn btn-light btn-small" onClick={() => add(true)}>
                      Start a new {country.name} order
                    </button>
                  </div>
                </div>
              )}
              {added && (
                <div className="notice notice-ok" role="status">
                  <p>{added}.</p>
                  <div className="row-gap">
                    <button className="btn btn-dark btn-small" onClick={() => navigate("/order")}>
                      Review order
                    </button>
                    <Link to={`/${country.slug}`} className="btn btn-light btn-small">
                      Continue browsing
                    </Link>
                  </div>
                </div>
              )}
              <p className="muted small confirm-note">Adding to your order does not reserve stock. You review everything before sending, and our team confirms the order with you.</p>
            </div>
          ) : (
            <div className="notice">
              <p>This product is out of stock, so it cannot be ordered right now.</p>
              <button className="text-btn" onClick={() => openChat(`When will ${product.code} be back in stock?`)}>
                Ask us about it
              </button>
            </div>
          )}

          <div className="ship-note">
            <div className="label">Shipping</div>
            <p>{SHIPPING_NOTE}</p>
            {product.fulfilment && (
              <dl className="fulfil">
                {product.fulfilment.dispatch_cutoff && (
                  <div>
                    <dt>Dispatch cut-off</dt>
                    <dd>{product.fulfilment.dispatch_cutoff}</dd>
                  </div>
                )}
                {product.fulfilment.dispatch_estimate && (
                  <div>
                    <dt>Usual dispatch</dt>
                    <dd>{product.fulfilment.dispatch_estimate}</dd>
                  </div>
                )}
                {product.fulfilment.carriers && (
                  <div>
                    <dt>Carriers</dt>
                    <dd>{product.fulfilment.carriers}</dd>
                  </div>
                )}
                {product.fulfilment.labels && (
                  <div>
                    <dt>Labels</dt>
                    <dd>{product.fulfilment.labels}</dd>
                  </div>
                )}
                {product.fulfilment.tracking && (
                  <div>
                    <dt>Tracking</dt>
                    <dd>{product.fulfilment.tracking}</dd>
                  </div>
                )}
                {product.fulfilment.verified_at && <p className="muted small">Confirmed by Ravisn on {new Date(product.fulfilment.verified_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.</p>}
              </dl>
            )}
            <Link to="/shipping" className="text-link small">
              Shipping and labels
            </Link>
          </div>

          <dl className="facts">
            <div>
              <dt>Ravisn reference</dt>
              <dd className="code">{product.code}</dd>
            </div>
            {product.legacy && (
              <div>
                <dt>Previous code</dt>
                <dd className="code">{product.legacy}</dd>
              </div>
            )}
            <div>
              <dt>Catalogue</dt>
              <dd>{country.name}</dd>
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
          <p className="muted small help-line">
            Questions about this product?{" "}
            <button className="text-btn" onClick={() => openChat(`I have a question about ${product.code}`)}>
              Ask in the chat
            </button>
          </p>
        </section>
      </div>

      <section className="section how">
        <h2 className="section-title">How ordering works</h2>
        <ol className="steps compact">
          {country.ordering.map((s, i) => (
            <li key={i}>
              <span className="step-num">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <Link to={`/${country.slug}/ordering`} className="text-link">
          Read the {country.name} ordering policies
        </Link>
      </section>
    </main>
  );
}
