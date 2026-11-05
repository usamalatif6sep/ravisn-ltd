import { useEffect, useState } from "react";
import { storeConfig, type StoreConfig } from "../api";
import { ChatIcon, IMAGE_NOTICE, openChat } from "../components";
import type { Site } from "../data";
import { mailLink, whatsappLink } from "../format";
import { Link, useTitle } from "../router";

export function Faq({ site }: { site: Site }) {
  useTitle("Help and FAQ · Ravisn Ltd");
  const first = site.countries[0];
  const faq: [string, React.ReactNode][] = [
    [
      "How do I place an order?",
      <ol className="plain-steps" key="o">
        {first.ordering.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>,
    ],
    ["Is my order paid when I send it?", "No. Sending an order is a request. Our team reviews it, confirms stock, price and delivery with you, and then sends payment details. Your order page shows the payment status."],
    ["How are prices shown?", "Prices are per unit, in the currency of each catalogue. Some products have options, such as single or pack, each with its own price. The team confirms the final price before you pay."],
    ["Can one order hold products from different countries?", "No. Each catalogue is fulfilled from its own country, so an order holds products from one catalogue. Send a separate order for each country."],
    ["Are the product photos exact?", `${IMAGE_NOTICE} Photos marked as illustrative show a similar item and are for orientation only.`],
    ["How do I find my order later?", "After sending, you get an order reference (for example RVS-2026-000184) and a private link. Copy or save them. Orders sent from this browser are listed under Track order."],
    ["What are Ravisn references?", "Every product has a permanent reference such as RVN-UK-10482. Older codes such as UK-0001 still work in links and searches."],
    ["Can I change or cancel an order?", "Ask the team as soon as possible, quoting your order reference. Changes are possible until the order is confirmed with the supplier; the policies of each catalogue apply."],
    ["Who pays for shipping?", "Shipping is the reseller's responsibility. Arrange your own prepaid label, or request one through Ravisn for a separately confirmed charge. You can charge your customer for shipping or include it in your own selling price."],
    ["Can I upload my own shipping label?", "Yes. Upload a PDF or image label at checkout or later on your order page, before dispatch, with the carrier and tracking number. Ravisn checks it matches the dispatch origin, address, parcel and carrier."],
    ["Can Ravisn arrange my shipping?", "Yes. Choose a shipping quote from Ravisn. We confirm the charge, and once it is paid we arrange the label and add the carrier's tracking to your order."],
    ["How do I track my order?", "Open the private link you received when you sent the order, or use Track order with your order reference and access key. Tracking appears once the parcel is handed to the carrier."],
    ["What are your delivery times?", "Dispatch depends on the country's cut-off times and on when payment and shipping are agreed. Delivery time then depends on the carrier and service chosen. Each country's policies list its cut-offs."],
    ["Delivery, dispatch and labels", "Each catalogue has its own cut-off times and label rules. Read them on the country's policies page before your first order."],
  ];
  return (
    <main className="wrap prose-page">
      <p className="eyebrow">Help</p>
      <h1>Help and FAQ</h1>
      <p className="lede small-lede">Short answers to the questions resellers ask most. If yours is not here, ask in the chat.</p>
      <section className="policy faq">
        {faq.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <div className="faq-a">{a}</div>
          </details>
        ))}
      </section>
      <section className="policy">
        <h2>What the stock statuses mean</h2>
        <dl>
          {site.statuses.map((s) => (
            <div key={s.name}>
              <dt>{s.name}</dt>
              <dd>{s.definition}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="policy">
        <h2>Country policies</h2>
        <div className="row-gap">
          {site.countries.map((c) => (
            <Link key={c.slug} to={`/${c.slug}/ordering`} className="btn btn-light btn-small">
              {c.name}
            </Link>
          ))}
        </div>
      </section>
      <div className="contact-inline">
        <button className="btn btn-dark" onClick={() => openChat()}>
          Ask in the chat
        </button>
        <Link to="/contact" className="btn btn-light">
          Other ways to contact us
        </Link>
        <Link to="/shipping" className="btn btn-light">
          Shipping and labels
        </Link>
      </div>
    </main>
  );
}

export function Contact({ site }: { site: Site }) {
  useTitle("Contact · Ravisn Ltd");
  return (
    <main className="wrap prose-page">
      <p className="eyebrow">Contact</p>
      <h1>Talk to Ravisn Ltd</h1>
      <p className="lede small-lede">The chat is the quickest way to reach us. We reply as soon as we can; replies are not instant outside working hours.</p>
      <div className="contact-cards">
        <button className="contact-card" onClick={() => openChat()}>
          <span className="contact-card-title">Chat</span>
          <span className="muted">Product questions, orders and help. Leave a message when the team is away.</span>
        </button>
        <a className="contact-card" href={whatsappLink(site)} target="_blank" rel="noopener noreferrer">
          <span className="contact-card-title">
            <ChatIcon /> WhatsApp
          </span>
          <span className="muted">{site.whatsapp.display}, for urgent questions.</span>
        </a>
        <a className="contact-card" href={mailLink(site)}>
          <span className="contact-card-title">Email</span>
          <span className="muted">{site.email}</span>
        </a>
      </div>
      <p className="muted small">When asking about an order, quote its reference, for example RV261104-7KQ3M.</p>
    </main>
  );
}

export function Privacy({ site }: { site: Site }) {
  useTitle("Privacy notice · Ravisn Ltd");
  const [cfg, setCfg] = useState<(StoreConfig & { retention?: { chat_days: number; order_personal_days: number } }) | null>(null);
  useEffect(() => {
    storeConfig().then(setCfg, () => {});
  }, []);
  const chatDays = cfg?.retention?.chat_days ?? 90;
  const orderDays = cfg?.retention?.order_personal_days ?? 730;
  return (
    <main className="wrap prose-page">
      <p className="eyebrow">Privacy</p>
      <h1>Privacy notice</h1>
      <p className="lede small-lede">How {site.company} handles the details you give us when you order or chat on this website.</p>
      <section className="policy">
        <dl>
          <div>
            <dt>What we collect</dt>
            <dd>
              For orders: your name or business name, email address and phone number; the recipient's name and delivery address; the products and quantities; and any special instructions. For chats: your messages and, if you give them, your name and contact details. To stop abuse we keep a scrambled code derived from your connection, not your IP address itself.
            </dd>
          </div>
          <div>
            <dt>Why</dt>
            <dd>To review, confirm and fulfil your order, to send you updates about it, and to answer your questions. We do not use your details for advertising and we do not sell them.</dd>
          </div>
          <div>
            <dt>Who sees it</dt>
            <dd>
              The {site.company} team. When we arrange fulfilment of an order, our team passes the delivery details needed for shipping to the fulfilment partner for that order only. Nothing is passed on automatically.
            </dd>
          </div>
          <div>
            <dt>How long we keep it</dt>
            <dd>
              Chats are deleted {chatDays} days after the last message. Personal details on completed or cancelled orders are erased after {orderDays} days; the order reference and products are kept for our accounts.
            </dd>
          </div>
          <div>
            <dt>In your browser</dt>
            <dd>
              This site stores your order in progress, your order references and your chat in your browser's local storage so they survive a page reload. Delivery details you type are kept only until the tab is closed. There are no advertising or tracking cookies.
            </dd>
          </div>
          <div>
            <dt>Security</dt>
            <dd>Order and chat details are sent over an encrypted connection and kept in a database that only the {site.company} team can access. The catalogue and supplier records are kept separately.</dd>
          </div>
          <div>
            <dt>Your choices</dt>
            <dd>
              You can ask us to show, correct or delete your details at any time. Contact us in the chat or at <a href={`mailto:${site.email}`}>{site.email}</a>, quoting your order reference if you have one.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
