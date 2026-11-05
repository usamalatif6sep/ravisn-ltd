import { useEffect, useMemo, useRef, useState } from "react";
import { Loading, ProductCard, Problem } from "../components";
import { loadCountry, type Country, type Product } from "../data";
import { lowestPrice, num } from "../format";
import { Link, navigate, useTitle } from "../router";

const PAGE = 48;
type Avail = "all" | "available" | "pending" | "unavailable";
const SORTS: Record<string, string> = { code: "Product code", "price-asc": "Price: low to high", "price-desc": "Price: high to low", name: "Name A to Z", stock: "Most in stock" };

function readParams(search: string) {
  const p = new URLSearchParams(search);
  return {
    q: p.get("q") ?? "",
    cat: p.get("cat") ?? "",
    avail: (p.get("avail") as Avail) || "all",
    min: p.get("min") ?? "",
    max: p.get("max") ?? "",
    sort: p.get("sort") && SORTS[p.get("sort")!] ? p.get("sort")! : "code",
  };
}

export default function CountryPage({ country, search }: { country: Country; search: string }) {
  useTitle(`${country.name} catalogue · Ravisn Ltd`);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState(() => readParams(search));
  const [shown, setShown] = useState(PAGE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCountry(country.slug).then(setProducts, () => setError("The catalogue could not be loaded. Check your connection and reload the page."));
  }, [country.slug]);

  useEffect(() => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && !(k === "avail" && v === "all") && !(k === "sort" && v === "code") && p.set(k, v));
    const qs = p.toString();
    navigate(`/${country.slug}${qs ? `?${qs}` : ""}`, true);
    setShown(PAGE);
  }, [f, country.slug]);

  const results = useMemo(() => {
    if (!products) return [];
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    const min = f.min ? Math.round(parseFloat(f.min) * 100) : null;
    const max = f.max ? Math.round(parseFloat(f.max) * 100) : null;
    const out = products.filter((p) => {
      if (f.cat && p.category !== f.cat) return false;
      if (f.avail !== "all" && p.availability !== f.avail) return false;
      const price = lowestPrice(p);
      if (min !== null && !Number.isNaN(min) && (price === null || price < min)) return false;
      if (max !== null && !Number.isNaN(max) && (price === null || price > max)) return false;
      if (words.length) {
        const hay = `${p.code} ${p.name} ${p.variant ?? ""} ${p.category}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const by: Record<string, (a: Product, b: Product) => number> = {
      code: () => 0,
      "price-asc": (a, b) => (lowestPrice(a) ?? 1e12) - (lowestPrice(b) ?? 1e12),
      "price-desc": (a, b) => (lowestPrice(b) ?? -1) - (lowestPrice(a) ?? -1),
      name: (a, b) => a.name.localeCompare(b.name),
      stock: (a, b) => (b.availability === "unavailable" ? -1 : b.qty ?? -1) - (a.availability === "unavailable" ? -1 : a.qty ?? -1),
    };
    return f.sort === "code" ? out : [...out].sort(by[f.sort]);
  }, [products, f]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && setShown((s) => s + PAGE), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [results]);

  if (error) return <Problem text={error} />;
  const set = (patch: Partial<typeof f>) => setF((cur) => ({ ...cur, ...patch }));
  const active = !!(f.q || f.cat || f.avail !== "all" || f.min || f.max);

  return (
    <main className="wrap catalogue">
      <div className="cat-head">
        <div>
          <p className="eyebrow">
            <Link to="/">Catalogue</Link> · {country.key}
          </p>
          <h1>{country.name}</h1>
          <p className="muted">
            {num(country.count)} products · {num(country.available)} available now · Prices in {country.currency} · {country.stock_text}
          </p>
        </div>
        <Link to={`/${country.slug}/ordering`} className="btn btn-light">
          Ordering & policies
        </Link>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.5 10.5 3.2 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search by name or code" aria-label={`Search ${country.name} products`} />
          {f.q && (
            <button className="clear" onClick={() => set({ q: "" })} aria-label="Clear search">
              ×
            </button>
          )}
        </div>
        <button className="btn btn-light filters-toggle" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
          Filters{active ? " ·" : ""}
        </button>
        <div className={`filters ${filtersOpen ? "open" : ""}`}>
          <div className="seg" role="radiogroup" aria-label="Availability">
            {(
              [
                ["all", "All"],
                ["available", "Available now"],
                ["pending", "On request"],
                ["unavailable", "Out of stock"],
              ] as [Avail, string][]
            ).map(([k, label]) => (
              <button key={k} role="radio" aria-checked={f.avail === k} className={f.avail === k ? "on" : undefined} onClick={() => set({ avail: k })}>
                {label}
              </button>
            ))}
          </div>
          <select value={f.cat} onChange={(e) => set({ cat: e.target.value })} aria-label="Category">
            <option value="">All categories</option>
            {country.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <div className="price-range">
            <label>
              <span>{country.symbol}</span>
              <input inputMode="decimal" placeholder="Min" value={f.min} onChange={(e) => set({ min: e.target.value.replace(/[^\d.]/g, "") })} aria-label="Minimum price" />
            </label>
            <span className="muted">to</span>
            <label>
              <span>{country.symbol}</span>
              <input inputMode="decimal" placeholder="Max" value={f.max} onChange={(e) => set({ max: e.target.value.replace(/[^\d.]/g, "") })} aria-label="Maximum price" />
            </label>
          </div>
          <select value={f.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort">
            {Object.entries(SORTS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {products === null ? (
        <Loading />
      ) : (
        <>
          <div className="result-line">
            <span>{active ? `${num(results.length)} of ${num(products.length)} products` : `${num(products.length)} products`}</span>
            {active && (
              <button className="text-btn" onClick={() => setF({ q: "", cat: "", avail: "all", min: "", max: "", sort: f.sort })}>
                Clear filters
              </button>
            )}
          </div>
          {results.length === 0 ? (
            <div className="empty">
              <h2>No products match</h2>
              <p className="muted">Try a shorter search or clear the filters. You can also ask us on WhatsApp.</p>
            </div>
          ) : (
            <div className="grid">
              {results.slice(0, shown).map((p) => (
                <ProductCard key={p.code} product={p} country={country} />
              ))}
            </div>
          )}
          {shown < results.length && <div ref={sentinel} className="sentinel" aria-hidden="true" />}
        </>
      )}
    </main>
  );
}
