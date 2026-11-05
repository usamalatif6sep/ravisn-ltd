import { useEffect, useMemo, useState } from "react";
import { Loading, ProductCard } from "../components";
import { loadCountry, type Country, type Product, type Site } from "../data";
import { num } from "../format";
import { navigate, useTitle } from "../router";

export default function SearchPage({ site, search }: { site: Site; search: string }) {
  const q0 = new URLSearchParams(search).get("q") ?? "";
  const [q, setQ] = useState(q0);
  const [all, setAll] = useState<{ country: Country; products: Product[] }[] | null>(null);
  const [limit, setLimit] = useState(96);
  useTitle(`Search “${q0}” · Ravisn Ltd`);

  useEffect(() => {
    Promise.all(site.countries.map(async (c) => ({ country: c, products: await loadCountry(c.slug) }))).then(setAll, () => setAll([]));
  }, [site]);

  const results = useMemo(() => {
    const words = q0.toLowerCase().split(/\s+/).filter(Boolean);
    if (!all || !words.length) return [];
    const out: { country: Country; product: Product }[] = [];
    for (const { country, products } of all) {
      for (const p of products) {
        const hay = `${p.code} ${p.name} ${p.variant ?? ""} ${p.category}`.toLowerCase();
        if (words.every((w) => hay.includes(w))) out.push({ country, product: p });
      }
    }
    const exact = q0.trim().toUpperCase();
    return out.sort((a, b) => Number(b.product.code === exact) - Number(a.product.code === exact));
  }, [all, q0]);

  return (
    <main className="wrap catalogue">
      <div className="cat-head">
        <div>
          <p className="eyebrow">All countries</p>
          <h1>Search</h1>
        </div>
      </div>
      <form
        className="toolbar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/search?q=${encodeURIComponent(q.trim())}`, true);
          setLimit(96);
        }}
      >
        <div className="search-box wide">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name or code" aria-label="Search all countries" autoFocus />
        </div>
        <button className="btn btn-dark" type="submit">
          Search
        </button>
      </form>
      {all === null ? (
        <Loading />
      ) : !q0 ? null : (
        <>
          <div className="result-line">{num(results.length)} results for “{q0}”</div>
          {results.length === 0 ? (
            <div className="empty">
              <h2>No products match</h2>
              <p className="muted">Try fewer words, or a product code such as UK-0123.</p>
            </div>
          ) : (
            <div className="grid">
              {results.slice(0, limit).map(({ country, product }) => (
                <ProductCard key={product.code} product={product} country={country} showCountry />
              ))}
            </div>
          )}
          {results.length > limit && (
            <div className="more">
              <button className="btn btn-light" onClick={() => setLimit((l) => l + 96)}>
                Show more
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
