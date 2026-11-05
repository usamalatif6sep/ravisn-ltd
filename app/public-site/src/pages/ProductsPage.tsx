import { useEffect, useMemo, useState } from "react";
import { Loading, ProductCard } from "../components";
import { deptSlug, loadAll, loadCountry, type Country, type Product, type Site } from "../data";
import { lowestPrice, num } from "../format";
import { Link, navigate, useTitle } from "../router";

const PAGE = 48;
type Sort = "relevance" | "price-asc" | "price-desc" | "new" | "name";

function params(search: string) {
  const p = new URLSearchParams(search);
  return {
    q: p.get("q") ?? "",
    dept: p.get("dept") ?? "",
    avail: p.get("avail") ?? "",
    sort: (p.get("sort") as Sort) || "relevance",
    min: p.get("min") ?? "",
    max: p.get("max") ?? "",
    c: p.get("c") ?? "",
  };
}

export default function ProductsPage({ site, country, department, search }: { site: Site; country?: Country; department?: string; search: string }) {
  const [rows, setRows] = useState<{ slug: string; product: Product }[] | null>(null);
  const [f, setF] = useState(() => params(search));
  const [limit, setLimit] = useState(PAGE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => setF(params(search)), [search]);
  const deptName = department ? rows?.find((r) => deptSlug(r.product.department) === department)?.product.department : undefined;
  useTitle(`${country ? `${country.name} catalogue` : deptName ?? (f.q ? `“${f.q}”` : "All products")} · Ravisn Ltd`);

  useEffect(() => {
    setRows(null);
    (country ? loadCountry(country.slug).then((ps) => ps.map((product) => ({ slug: country.slug, product }))) : loadAll(site)).then(setRows, () => setRows([]));
  }, [country?.slug, site]);
  useEffect(() => setLimit(PAGE), [f, country?.slug, department]);

  const update = (patch: Partial<typeof f>) => {
    const next = { ...f, ...patch };
    setF(next);
    const p = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => v && !(k === "sort" && v === "relevance") && p.set(k, v));
    const qs = p.toString();
    navigate(`${location.pathname}${qs ? `?${qs}` : ""}`, true);
  };

  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = useMemo(() => {
    if (!rows) return [];
    const min = f.min ? Number(f.min) * 100 : null;
    const max = f.max ? Number(f.max) * 100 : null;
    let out = rows.filter(({ slug, product: p }) => {
      if (f.c && slug !== f.c) return false;
      if (department && deptSlug(p.department) !== department) return false;
      if (f.dept && deptSlug(p.department) !== f.dept) return false;
      if (f.avail && p.availability !== f.avail) return false;
      const price = lowestPrice(p);
      if (min !== null && (price === null || price < min)) return false;
      if (max !== null && (price === null || price > max)) return false;
      if (words.length) {
        const text = `${p.code} ${p.legacy ?? ""} ${p.name} ${p.variant ?? ""} ${p.department} ${p.category}`.toLowerCase();
        if (!words.every((w) => text.includes(w))) return false;
      }
      return true;
    });
    const price = (p: Product) => lowestPrice(p) ?? Number.MAX_SAFE_INTEGER;
    if (f.sort === "price-asc") out = [...out].sort((a, b) => price(a.product) - price(b.product));
    if (f.sort === "price-desc") out = [...out].sort((a, b) => price(b.product) - price(a.product));
    if (f.sort === "name") out = [...out].sort((a, b) => a.product.name.localeCompare(b.product.name));
    if (f.sort === "new") out = [...out].sort((a, b) => (b.product.added ?? "").localeCompare(a.product.added ?? "") || (b.product.legacy ?? "").localeCompare(a.product.legacy ?? ""));
    if (f.sort === "relevance")
      out = [...out].sort((a, b) => Number(b.product.availability === "available") - Number(a.product.availability === "available") || Number(!!b.product.images.length) - Number(!!a.product.images.length));
    return out;
  }, [rows, f, department]);

  const depts = useMemo(() => {
    const m = new Map<string, number>();
    (rows ?? []).forEach(({ product }) => m.set(product.department, (m.get(product.department) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const byslug = Object.fromEntries(site.countries.map((c) => [c.slug, c]));
  const symbol = country?.symbol ?? (f.c ? byslug[f.c]?.symbol : "");
  const active = !!(f.q || f.dept || f.avail || f.min || f.max || f.c);

  return (
    <main className="wrap catalogue">
      <div className="cat-head">
        <div>
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span>›</span>
            {country ? <Link to="/countries">Countries</Link> : department ? <Link to="/categories">Categories</Link> : <span>Shop</span>}
          </nav>
          <h1>{country ? `${country.name}` : deptName ?? (department ? "Category" : "All products")}</h1>
          <p className="muted">
            {country
              ? `${num(country.count)} products · ${country.stock_text} · Prices per unit in ${country.currency}`
              : department
                ? "Products in this category across every country catalogue."
                : `${num(site.countries.reduce((a, c) => a + c.count, 0))} products across ${site.countries.length} countries.`}
          </p>
        </div>
        {country && (
          <div className="row-gap">
            <Link to={`/${country.slug}/ordering`} className="btn btn-light btn-small">
              {country.name} policies
            </Link>
          </div>
        )}
      </div>

      <div className="toolbar">
        <label className="search-box wide">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.5 10.5 3.2 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input value={f.q} onChange={(e) => update({ q: e.target.value })} placeholder="Name, brand or reference" aria-label="Search" />
          {f.q && (
            <button className="clear" onClick={() => update({ q: "" })} aria-label="Clear search">
              ×
            </button>
          )}
        </label>
        <button className="btn btn-light filters-toggle" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
          Filters
        </button>
        <div className={filtersOpen ? "filters open" : "filters"}>
          {!country && (
            <select value={f.c} onChange={(e) => update({ c: e.target.value })} aria-label="Country">
              <option value="">All countries</option>
              {site.countries.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {!department && (
            <select value={f.dept} onChange={(e) => update({ dept: e.target.value })} aria-label="Category">
              <option value="">All categories</option>
              {depts.map(([d, n]) => (
                <option key={d} value={deptSlug(d)}>
                  {d} ({num(n)})
                </option>
              ))}
            </select>
          )}
          <select value={f.avail} onChange={(e) => update({ avail: e.target.value })} aria-label="Availability">
            <option value="">Any availability</option>
            <option value="available">Available now</option>
            <option value="pending">On request or arriving</option>
          </select>
          <div className="price-range">
            <label>
              {symbol || "Min"}
              <input inputMode="decimal" value={f.min} onChange={(e) => update({ min: e.target.value.replace(/[^\d.]/g, "") })} placeholder="min" aria-label="Minimum price" />
            </label>
            <span className="muted">to</span>
            <label>
              {symbol || "Max"}
              <input inputMode="decimal" value={f.max} onChange={(e) => update({ max: e.target.value.replace(/[^\d.]/g, "") })} placeholder="max" aria-label="Maximum price" />
            </label>
          </div>
          <select value={f.sort} onChange={(e) => update({ sort: e.target.value as Sort })} aria-label="Sort">
            <option value="relevance">Featured first</option>
            <option value="price-asc">Price, low to high</option>
            <option value="price-desc">Price, high to low</option>
            <option value="new">Newest</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {!rows ? (
        <Loading label="Loading products" />
      ) : (
        <>
          <div className="result-line">
            <span>
              {num(results.length)} {results.length === 1 ? "product" : "products"}
            </span>
            {active && (
              <button className="text-btn" onClick={() => update({ q: "", dept: "", avail: "", min: "", max: "", c: "" })}>
                Clear filters
              </button>
            )}
          </div>
          {results.length === 0 ? (
            <div className="empty">
              <h2>No products match</h2>
              <p className="muted">Try fewer words, another category, or a different price range.</p>
            </div>
          ) : (
            <div className="grid">
              {results.slice(0, limit).map(({ slug, product }) => (
                <ProductCard key={`${slug}-${product.code}`} product={product} country={byslug[slug]} showCountry={!country} />
              ))}
            </div>
          )}
          {results.length > limit && (
            <div className="more">
              <button className="btn btn-light" onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({num(results.length - limit)} more)
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
