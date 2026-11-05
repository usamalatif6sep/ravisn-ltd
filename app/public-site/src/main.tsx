import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/fraunces/opsz-italic.css";
import "@fontsource-variable/manrope";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ChatWidget from "./ChatWidget";
import { Footer, Header, Loading, Problem } from "./components";
import { loadSite, type Site } from "./data";
import Checkout from "./pages/Checkout";
import Home from "./pages/Home";
import { Contact, Faq, Privacy } from "./pages/InfoPages";
import { About, Categories, Countries, HowItWorks, Returns, Shipping, Terms, Track } from "./pages/MorePages";
import Ordering from "./pages/Ordering";
import OrderPage from "./pages/OrderPage";
import OrderStatus, { OrdersList } from "./pages/OrderStatus";
import ProductPage from "./pages/ProductPage";
import ProductsPage from "./pages/ProductsPage";
import { Link, useLocation } from "./router";
import "./styles.css";
import "./premium.css";

function NotFound() {
  return (
    <main className="wrap problem">
      <h1>Page not found</h1>
      <p className="muted">The link may be out of date.</p>
      <div className="row-gap">
        <Link to="/" className="btn btn-dark">
          Go to the homepage
        </Link>
        <Link to="/products" className="btn btn-light">
          Browse all products
        </Link>
      </div>
    </main>
  );
}

function App() {
  const [site, setSite] = useState<Site | null>(null);
  const [error, setError] = useState(false);
  const { path, search } = useLocation();
  useEffect(() => {
    loadSite().then(setSite, () => setError(true));
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0); // block body: scrollTo returns a Promise in newer browsers, which must not become the effect's cleanup
  }, [path]);

  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const country = site?.countries.find((c) => c.slug === parts[0]?.toLowerCase());
  const one = parts.length === 1;

  let page: React.ReactNode;
  if (error) page = <Problem text="The catalogue could not be loaded. Check your connection and reload the page." />;
  else if (!site) page = <Loading />;
  else if (parts.length === 0) page = <Home site={site} />;
  else if ((parts[0] === "products" || parts[0] === "search") && one) page = <ProductsPage key="all" site={site} search={search} />;
  else if (parts[0] === "countries" && one) page = <Countries site={site} />;
  else if (parts[0] === "categories" && one) page = <Categories />;
  else if (parts[0] === "categories" && parts.length === 2) page = <ProductsPage key={`d-${parts[1]}`} site={site} department={parts[1].toLowerCase()} search={search} />;
  else if (parts[0] === "track" && one) page = <Track />;
  else if (parts[0] === "how-it-works" && one) page = <HowItWorks site={site} />;
  else if (parts[0] === "shipping" && one) page = <Shipping site={site} />;
  else if ((parts[0] === "faq" || parts[0] === "help") && one) page = <Faq site={site} />;
  else if (parts[0] === "about" && one) page = <About site={site} />;
  else if (parts[0] === "terms" && one) page = <Terms site={site} />;
  else if (parts[0] === "returns" && one) page = <Returns site={site} />;
  else if (parts[0] === "contact" && one) page = <Contact site={site} />;
  else if (parts[0] === "privacy" && one) page = <Privacy site={site} />;
  else if (parts[0] === "orders" && one) page = <OrdersList site={site} />;
  else if (parts[0] === "order" && one) page = <OrderPage site={site} />;
  else if (parts[0] === "order" && parts[1] === "checkout") page = <Checkout site={site} />;
  else if (parts[0] === "order" && parts.length === 2) page = <OrderStatus key={parts[1]} site={site} number={parts[1].toUpperCase()} />;
  else if (country && one) page = <ProductsPage key={country.slug} site={site} country={country} search={search} />;
  else if (country && parts.length === 2 && parts[1] === "ordering") page = <Ordering site={site} country={country} />;
  else if (country && parts.length === 2) page = <ProductPage key={parts[1]} site={site} country={country} code={parts[1]} />;
  else page = <NotFound />;

  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <Header site={site} active={country?.slug} />
      <div id="main">{page}</div>
      <Footer site={site} />
      {site && <ChatWidget site={site} slug={country?.slug} />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
