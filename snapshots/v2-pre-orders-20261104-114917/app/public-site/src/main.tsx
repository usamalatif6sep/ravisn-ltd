import "@fontsource-variable/inter";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Footer, Header, Loading, Problem } from "./components";
import { loadSite, type Site } from "./data";
import CountryPage from "./pages/CountryPage";
import Home from "./pages/Home";
import Ordering from "./pages/Ordering";
import ProductPage from "./pages/ProductPage";
import SearchPage from "./pages/SearchPage";
import { Link, useLocation } from "./router";
import "./styles.css";

function App() {
  const [site, setSite] = useState<Site | null>(null);
  const [error, setError] = useState(false);
  const { path, search } = useLocation();
  useEffect(() => {
    loadSite().then(setSite, () => setError(true));
  }, []);

  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const country = site?.countries.find((c) => c.slug === parts[0]?.toLowerCase());

  let page: React.ReactNode;
  if (error) page = <Problem text="The catalogue could not be loaded. Check your connection and reload the page." />;
  else if (!site) page = <Loading />;
  else if (parts.length === 0) page = <Home site={site} />;
  else if (parts[0] === "search" && parts.length === 1) page = <SearchPage site={site} search={search} />;
  else if (country && parts.length === 1) page = <CountryPage key={country.slug} country={country} search={search} />;
  else if (country && parts.length === 2 && parts[1] === "ordering") page = <Ordering site={site} country={country} />;
  else if (country && parts.length === 2) page = <ProductPage site={site} country={country} code={parts[1]} />;
  else
    page = (
      <main className="wrap problem">
        <h1>Page not found</h1>
        <p className="muted">The link may be out of date.</p>
        <Link to="/" className="btn btn-dark">
          Go to the catalogue
        </Link>
      </main>
    );

  return (
    <>
      <Header site={site} active={country?.slug} />
      {page}
      <Footer site={site} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
