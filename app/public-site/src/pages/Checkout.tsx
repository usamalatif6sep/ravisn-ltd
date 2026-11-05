import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, newKey, storeConfig, type CountryRule, type PublicOrder, type StoreConfig } from "../api";
import { clearCart, saveOrder } from "../cart";
import { IMAGE_NOTICE, Loading, SHIPPING_NOTE } from "../components";
import type { Site } from "../data";
import { money, title } from "../format";
import { Link, navigate, useTitle } from "../router";
import { useCartLines } from "./OrderPage";

interface Details {
  customer_name: string;
  email: string;
  phone_country: string;
  phone: string;
  recipient_name: string;
  address_country: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postcode: string;
  instructions: string;
  ship_method: "reseller" | "ravisn";
  ship_carrier: string;
  ship_service: string;
  ship_tracking: string;
  ship_instructions: string;
}
const blank: Details = {
  ship_method: "reseller", ship_carrier: "", ship_service: "", ship_tracking: "", ship_instructions: "",
  customer_name: "", email: "", phone_country: "", phone: "", recipient_name: "", address_country: "", address1: "", address2: "", city: "",
  region: "", postcode: "", instructions: "",
};
const DRAFT = "ravisn.checkout.v1"; // this tab only (sessionStorage), never kept after the browser closes

function loadDraft(): Details {
  try {
    return { ...blank, ...JSON.parse(sessionStorage.getItem(DRAFT) || "{}") };
  } catch {
    return { ...blank };
  }
}

function check(d: Details, rule: CountryRule | undefined): Record<string, string> {
  const e: Record<string, string> = {};
  const need = (k: keyof Details, msg: string) => {
    if (!d[k].trim()) e[k] = msg;
  };
  need("customer_name", "Enter your name or business name");
  need("email", "Enter your email address");
  if (d.email.trim() && !/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(d.email.trim())) e.email = "Enter an email address like name@example.com";
  need("phone", "Enter a phone number");
  if (d.phone.trim() && d.phone.replace(/\D/g, "").length < 6) e.phone = "Enter a complete phone number";
  need("recipient_name", "Enter the recipient's full name");
  need("address_country", "Choose the delivery country");
  need("address1", "Enter the first line of the address");
  need("city", "Enter the city or town");
  if (rule?.region_required) need("region", `Choose the ${rule.region_label.toLowerCase()}`);
  if (rule?.has_postcode) need("postcode", `Enter the ${rule.postcode_label.toLowerCase()}`);
  return e;
}

export default function Checkout({ site }: { site: Site }) {
  useTitle("Delivery details · Ravisn Ltd");
  const { cart, country, lines, subtotal, pending } = useCartLines(site);
  const [cfg, setCfg] = useState<StoreConfig | null>(null);
  const [cfgError, setCfgError] = useState(false);
  const [d, setD] = useState<Details>(loadDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<"details" | "review">("details");
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const key = useRef<string>(newKey());
  const [label, setLabel] = useState<File | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const honey = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storeConfig().then(setCfg, () => setCfgError(true));
  }, []);
  useEffect(() => {
    if (!cfg || !country) return;
    setD((x) => {
      const dest = x.address_country || cfg.catalogue_delivery[country.key] || "";
      return { ...x, address_country: dest, phone_country: x.phone_country || dest };
    });
  }, [cfg, country?.key]);
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }, [d]);

  const rule = cfg?.countries.find((c) => c.code === d.address_country);
  const dialRule = cfg?.countries.find((c) => c.code === d.phone_country);
  const sortedCountries = useMemo(() => [...(cfg?.countries ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [cfg]);

  if (!cart.lines.length || !country) {
    return (
      <main className="wrap narrow-page">
        <h1 className="page-title">Your order is empty</h1>
        <p className="muted">Add products before entering delivery details.</p>
        <Link to="/" className="btn btn-dark">
          Browse the catalogue
        </Link>
      </main>
    );
  }
  if (cfgError) {
    return (
      <main className="wrap narrow-page">
        <h1 className="page-title">Ordering is not available right now</h1>
        <p className="muted">We could not reach the order service. Your order is saved in this browser; please try again in a few minutes, or ask us in the chat.</p>
      </main>
    );
  }
  if (!lines || !cfg) return <Loading />;
  if (lines.some((l) => l.problem)) {
    return (
      <main className="wrap narrow-page">
        <h1 className="page-title">Your order needs a change</h1>
        <p className="muted">A product in your order is no longer available as chosen.</p>
        <Link to="/order" className="btn btn-dark">
          Review products
        </Link>
      </main>
    );
  }

  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setD((x) => ({ ...x, [k]: v, ...(k === "address_country" ? { region: "", postcode: "" } : {}) }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: "" }));
  };
  const field = (k: keyof Details) => ({ value: d[k], onChange: set(k), "aria-invalid": !!errors[k] || undefined, "aria-describedby": errors[k] ? `${k}-err` : undefined, id: k });
  const err = (k: string) => (errors[k] ? <span className="field-error" id={`${k}-err`}>{errors[k]}</span> : null);

  const toReview = (e: React.FormEvent) => {
    e.preventDefault();
    const found = check(d, rule);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(Object.keys(found)[0])?.focus();
      return;
    }
    setSendError(null);
    setStage("review");
    window.scrollTo(0, 0);
  };

  const submit = async () => {
    if (!confirmed || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const o = await api<PublicOrder>("/api/store/orders", {
        body: {
          catalogue: country.slug,
          items: cart.lines.map((l) => ({ code: l.code, option: l.option, qty: l.qty })),
          customer_name: d.customer_name, email: d.email, phone_dial: dialRule?.dial ?? "", phone: d.phone, recipient_name: d.recipient_name,
          address_country: d.address_country, address1: d.address1, address2: d.address2, city: d.city, region: d.region, postcode: d.postcode,
          instructions: d.instructions, confirmed: true, website: honey.current?.value ?? "",
          shipping: d.ship_method === "ravisn" ? { method: "ravisn", instructions: d.ship_instructions }
            : { method: "reseller", carrier: d.ship_carrier, service: d.ship_service, tracking: d.ship_tracking, instructions: d.ship_instructions },
        },
        headers: { "Idempotency-Key": key.current },
      });
      saveOrder({ number: o.number, token: o.token!, at: o.created_at, catalogue: country.slug });
      let note = "";
      if (label && d.ship_method === "reseller" && o.shipments?.[0]) {
        const form = new FormData();
        form.append("file", label);
        const up = await fetch(`/api/store/orders/${o.number}/shipments/${o.shipments[0].id}/label`, {
          method: "POST", body: form, headers: { "X-Ravisn-Store": "1", "X-Order-Token": o.token! },
        }).catch(() => null);
        if (!up || !up.ok) note = "&label=failed";
      }
      clearCart();
      try {
        sessionStorage.removeItem(DRAFT);
      } catch {
        /* ignore */
      }
      navigate(`/order/${o.number}?sent=1${note}#t=${o.token}`, true);
    } catch (ex) {
      const e = ex as ApiError;
      if (e.fields && Object.keys(e.fields).some((k) => k !== "confirmed")) {
        setErrors(e.fields);
        setStage("details");
        window.scrollTo(0, 0);
      }
      setSendError(e.message);
      setSending(false);
    }
  };

  const steps = (
    <ol className="flow" aria-label="Order steps">
      <li className="done">
        <Link to="/order">Products</Link>
      </li>
      <li className={stage === "details" ? "on" : "done"}>{stage === "review" ? <button className="link-like" onClick={() => setStage("details")}>Delivery details</button> : "Delivery details"}</li>
      <li className={stage === "review" ? "on" : undefined}>Review and send</li>
    </ol>
  );

  if (stage === "details") {
    return (
      <main className="wrap narrow-page">
        <p className="eyebrow">{country.name} catalogue</p>
        <h1 className="page-title">Delivery details</h1>
        {steps}
        {sendError && <div className="notice notice-warn" role="alert">{sendError}</div>}
        <form className="form" onSubmit={toReview} noValidate>
          <p className="muted small">
            Fields marked <span className="opt">optional</span> can be left empty. Everything else is required.
          </p>
          <fieldset className="panel">
            <legend>Your details</legend>
            <label className="field">
              <span>Your name or business name</span>
              <input {...field("customer_name")} autoComplete="organization" maxLength={100} />
              {err("customer_name")}
            </label>
            <div className="field-row">
              <label className="field">
                <span>Email address</span>
                <input {...field("email")} type="email" autoComplete="email" maxLength={254} />
                {err("email")}
              </label>
              <div className="field">
                <span id="phone-label">Phone number</span>
                <div className="phone" role="group" aria-labelledby="phone-label">
                  <select value={d.phone_country} onChange={set("phone_country")} aria-label="Country calling code">
                    {sortedCountries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} +{c.dial}
                      </option>
                    ))}
                  </select>
                  <input {...field("phone")} type="tel" autoComplete="tel-national" inputMode="tel" maxLength={24} placeholder="Number" />
                </div>
                {err("phone")}
              </div>
            </div>
          </fieldset>

          <fieldset className="panel">
            <legend>Recipient and delivery address</legend>
            <label className="field">
              <span>Recipient's full name</span>
              <input {...field("recipient_name")} autoComplete="shipping name" maxLength={100} />
              {err("recipient_name")}
            </label>
            <label className="field">
              <span>Country</span>
              <select {...field("address_country")} autoComplete="shipping country">
                {sortedCountries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              {err("address_country")}
              {d.address_country && d.address_country !== cfg.catalogue_delivery[country.key] && (
                <span className="hint">This catalogue ships from {country.name}. We will confirm whether delivery to this country is possible.</span>
              )}
            </label>
            <label className="field">
              <span>Address line 1</span>
              <input {...field("address1")} autoComplete="shipping address-line1" maxLength={120} />
              {err("address1")}
            </label>
            <label className="field">
              <span>
                Address line 2 <span className="opt">optional</span>
              </span>
              <input {...field("address2")} autoComplete="shipping address-line2" maxLength={120} />
            </label>
            <div className="field-row">
              <label className="field">
                <span>City or town</span>
                <input {...field("city")} autoComplete="shipping address-level2" maxLength={80} />
                {err("city")}
              </label>
              {rule && rule.region_label && (
                <label className="field">
                  <span>
                    {rule.region_label} {!rule.region_required && <span className="opt">optional</span>}
                  </span>
                  {rule.regions.length ? (
                    <select {...field("region")} autoComplete="shipping address-level1">
                      <option value="">Choose…</option>
                      {rule.regions.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input {...field("region")} autoComplete="shipping address-level1" maxLength={80} />
                  )}
                  {err("region")}
                </label>
              )}
            </div>
            {rule?.has_postcode !== false && (
              <label className="field field-short">
                <span>
                  {rule?.postcode_label || "Postcode"} {!rule && <span className="opt">optional</span>}
                </span>
                <input {...field("postcode")} autoComplete="shipping postal-code" maxLength={12} placeholder={rule?.postcode_example ? `e.g. ${rule.postcode_example}` : undefined} />
                {err("postcode")}
              </label>
            )}
          </fieldset>

          <fieldset className="panel">
            <legend>
              Special instructions <span className="opt">optional</span>
            </legend>
            <label className="field">
              <span className="sr-only">Special instructions</span>
              <textarea {...field("instructions")} rows={4} maxLength={1500} placeholder="For example: an urgent delivery request, delivery access instructions, important recipient information or other order requirements." />
              {err("instructions")}
            </label>
          </fieldset>
          <fieldset className="panel">
            <legend>Shipping</legend>
            <p className="ship-callout">{SHIPPING_NOTE} You can charge your customer for shipping or include it in your own price.</p>
            <div className="choice-cards" role="radiogroup" aria-label="Who arranges shipping">
              {([
                ["reseller", "I'll arrange shipping", "Use your own prepaid label. Details are optional now; you can add them before dispatch."],
                ["ravisn", "Request a shipping quote from Ravisn", "We confirm the charge separately. Once it is paid, we arrange the label."],
              ] as const).map(([v, h, s]) => (
                <label key={v} className={d.ship_method === v ? "choice on" : "choice"}>
                  <input type="radio" name="ship_method" checked={d.ship_method === v} onChange={() => setD((x) => ({ ...x, ship_method: v }))} />
                  <span>
                    <strong>{h}</strong>
                    <span className="muted small">{s}</span>
                  </span>
                </label>
              ))}
            </div>
            {d.ship_method === "reseller" && (
              <>
                <div className="field-row">
                  <label className="field">
                    <span>
                      Carrier <span className="opt">optional</span>
                    </span>
                    <input {...field("ship_carrier")} maxLength={60} placeholder="For example Royal Mail, USPS, DHL" />
                  </label>
                  <label className="field">
                    <span>
                      Shipping service <span className="opt">optional</span>
                    </span>
                    <input {...field("ship_service")} maxLength={60} placeholder="For example Tracked 48" />
                  </label>
                </div>
                <label className="field">
                  <span>
                    Tracking number <span className="opt">optional</span>
                  </span>
                  <input {...field("ship_tracking")} maxLength={80} autoComplete="off" />
                </label>
                <label className="field">
                  <span>
                    Prepaid shipping label <span className="opt">optional, PDF or image up to 1.5 MB</span>
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const f2 = e.target.files?.[0] ?? null;
                      setLabelError(f2 && f2.size > 1_500_000 ? "That file is larger than 1.5 MB" : null);
                      setLabel(f2 && f2.size <= 1_500_000 ? f2 : null);
                    }}
                  />
                  {labelError && <span className="field-error">{labelError}</span>}
                  <span className="hint muted-hint">Your label must match the dispatch origin we confirm, the recipient's address, the parcel and the carrier. Need the dispatch address? Ask for it on your order page after sending.</span>
                </label>
              </>
            )}
            <label className="field">
              <span>
                Shipping instructions <span className="opt">optional</span>
              </span>
              <textarea {...field("ship_instructions")} rows={2} maxLength={800} />
            </label>
          </fieldset>
          <input ref={honey} className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" />

          <div className="flow-actions">
            <Link to="/order" className="text-link">
              Back to products
            </Link>
            <button className="btn btn-dark" type="submit">
              Review order
            </button>
          </div>
        </form>
      </main>
    );
  }

  const region = rule?.regions.find((r) => r.code === d.region)?.name ?? d.region;
  return (
    <main className="wrap narrow-page">
      <p className="eyebrow">{country.name} catalogue</p>
      <h1 className="page-title">Review and send</h1>
      {steps}
      {sendError && <div className="notice notice-warn" role="alert">{sendError}</div>}

      <section className="panel">
        <h2 className="panel-title">Products</h2>
        <table className="review-table">
          <thead>
            <tr>
              <th>Product</th>
              <th className="r">Qty</th>
              <th className="r">Price</th>
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={`${l.code}|${l.option ?? ""}`}>
                <td>
                  <div>{l.product ? title(l.product) : l.code}</div>
                  <div className="muted small">
                    <span className="code">{l.code}</span>
                    {l.option ? ` · ${l.option}` : ""}
                  </div>
                </td>
                <td className="r">{l.qty}</td>
                <td className="r">{l.unit !== null ? money(l.unit, country.symbol) : "To confirm"}</td>
                <td className="r num-strong">{l.unit !== null ? money(l.unit * l.qty, country.symbol) : "To confirm"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="summary">
          <div>
            <dt>Subtotal</dt>
            <dd className="num-strong">
              {money(subtotal, country.symbol)} {country.currency}
            </dd>
          </div>
          {pending && (
            <div>
              <dt>Prices to confirm</dt>
              <dd>Some products are priced by our team and are not included above.</dd>
            </div>
          )}
          <div>
            <dt>Shipping</dt>
            <dd>
              {d.ship_method === "ravisn"
                ? "Not included. Ravisn will quote the shipping charge separately; once it is paid we arrange the label."
                : `Not included. You arrange shipping with your own prepaid label${label ? ` (${label.name} will be uploaded)` : ""}${d.ship_carrier ? `, ${d.ship_carrier}` : ""}${d.ship_tracking ? `, tracking ${d.ship_tracking}` : ""}.`}
            </dd>
          </div>
          <div>
            <dt>Payment status</dt>
            <dd>Not paid. No payment is taken on this website. Sending this order is a request: we confirm stock, price and delivery, then send payment details.</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Delivery</h2>
          <button className="text-btn" onClick={() => setStage("details")}>
            Change
          </button>
        </div>
        <dl className="summary">
          <div>
            <dt>Ordered by</dt>
            <dd>
              {d.customer_name}
              <br />
              {d.email}
              <br />
              {d.phone.trim().startsWith("+") ? d.phone.trim() : `+${dialRule?.dial} ${dialRule?.dial === "39" ? d.phone.trim() : d.phone.trim().replace(/^0+/, "")}`}
            </dd>
          </div>
          <div>
            <dt>Deliver to</dt>
            <dd>
              {d.recipient_name}
              <br />
              {d.address1}
              {d.address2 && (
                <>
                  <br />
                  {d.address2}
                </>
              )}
              <br />
              {[d.city, region, d.postcode.toUpperCase()].filter(Boolean).join(", ")}
              <br />
              {rule?.name}
            </dd>
          </div>
          <div>
            <dt>Special instructions</dt>
            <dd>{d.instructions.trim() || <span className="muted">None</span>}</dd>
          </div>
        </dl>
      </section>

      <section className="panel confirm-panel">
        <p className="muted small">{IMAGE_NOTICE}</p>
        <label className="check">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>I have reviewed the product information and confirmed the item, variation and quantity I intend to order.</span>
        </label>
        <button className="btn btn-dark btn-wide" onClick={submit} disabled={!confirmed || sending} aria-busy={sending}>
          {sending ? "Sending your order…" : "Send order request"}
        </button>
        <p className="muted small">
          By sending, you agree to the{" "}
          <Link to={`/${country.slug}/ordering`} className="text-link small">
            {country.name} ordering policies
          </Link>{" "}
          and our{" "}
          <Link to="/privacy" className="text-link small">
            privacy notice
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
