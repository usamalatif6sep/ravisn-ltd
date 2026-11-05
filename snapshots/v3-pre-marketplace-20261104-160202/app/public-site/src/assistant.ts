/**
 * The automated assistant in the chat. It answers only from public information: the published catalogue (codes,
 * names, prices, statuses, stock as listed) and Ravisn's written policies. It never guesses stock, delivery times,
 * refunds or specifications; when it does not know, it says so and offers the team.
 */
import { loadCountry, normaliseCode, slugForCode, type Country, type Product, type Site } from "./data";
import { priceLabel, stockLabel, title } from "./format";

export interface FoundProduct {
  code: string;
  name: string;
  slug: string;
  price: string;
  status: string;
  stock: string;
}
export interface Reply {
  text: string;
  products?: FoundProduct[];
  links?: { label: string; to: string }[];
  offerTeam?: boolean;
}

const has = (q: string, re: RegExp) => re.test(q);
const STOP = new Set(
  "a an the and or of for to in on at by with from is are do does did you your we our i me my it its this that these those have has any some there please can could would like want need looking find search show me about price prices cost much how what which who when where stock available availability buy order get sell selling product products item items do you have got".split(
    " ",
  ),
);

function found(p: Product, c: Country): FoundProduct {
  return { code: p.code, name: title(p), slug: c.slug, price: priceLabel(p, c.symbol), status: p.status, stock: p.availability === "unavailable" ? "" : stockLabel(p) };
}

/** Written policies of one catalogue whose title (or, failing that, text) matches. */
function policies(site: Site, slug: string | undefined, re: RegExp) {
  const c = site.countries.find((x) => x.slug === slug) ?? site.countries[0];
  const items = c.policies.flatMap((sec) => sec.items).filter((it) => it.title !== "Status meanings");
  const byTitle = items.filter((it) => re.test(it.title));
  const chosen = byTitle.length ? byTitle : items.filter((it) => re.test(it.body));
  return [...new Set(chosen.map((it) => `${it.title}: ${it.body}`))].slice(0, 4);
}

async function search(site: Site, slug: string | undefined, q: string): Promise<{ list: FoundProduct[]; total: number }> {
  const words = q
    .toLowerCase()
    .replace(/[^a-z0-9.\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
  if (!words.length) return { list: [], total: 0 };
  const countries = slug ? [...site.countries].sort((a, b) => (a.slug === slug ? -1 : b.slug === slug ? 1 : 0)) : site.countries;
  const hits: { p: Product; c: Country; score: number }[] = [];
  for (const c of countries) {
    let products: Product[];
    try {
      products = await loadCountry(c.slug);
    } catch {
      continue;
    }
    for (const p of products) {
      const text = `${p.code} ${p.name} ${p.variant ?? ""} ${p.category}`.toLowerCase();
      const score = words.filter((w) => text.includes(w)).length;
      if (score && score >= Math.ceil(words.length * 0.67)) hits.push({ p, c, score: score + (p.availability === "available" ? 0.5 : 0) + (c.slug === slug ? 0.25 : 0) });
    }
    if (slug && c.slug === slug && hits.length >= 5) break;
  }
  hits.sort((a, b) => b.score - a.score);
  return { list: hits.slice(0, 5).map((h) => found(h.p, h.c)), total: hits.length };
}

export async function answer(raw: string, site: Site, slug?: string): Promise<Reply> {
  const q = raw.trim().toLowerCase();
  const country = site.countries.find((c) => c.slug === slug);
  const where = (country ?? site.countries[0]).name;

  if (has(q, /\b(supplier|suppliers|wholesaler|cost price|your cost|buying price|margin|margins|profit|mark-?up|who do you buy|source it)\b/))
    return {
      text: "I can't share supplier details, purchase costs or margins. The prices on the website are the prices you pay per unit, and the team confirms them for each order. For anything else about a product, ask me or the team.",
      offerTeam: true,
    };

  const code = /\b([a-z]{2})-?(\d{1,5})\b/i.exec(raw);
  if (code && !/^rv\d/i.test(code[0])) {
    const norm = normaliseCode(code[0]);
    const s = slugForCode(norm);
    const c = site.countries.find((x) => x.slug === s);
    if (c) {
      const p = (await loadCountry(c.slug).catch(() => [] as Product[])).find((x) => x.code === norm);
      if (p)
        return {
          text: `${p.code} is ${title(p)} in the ${c.name} catalogue. Status: ${p.status}${p.availability !== "unavailable" && stockLabel(p) ? `, ${stockLabel(p)}` : ""}. Price: ${priceLabel(p, c.symbol)}. Open it to check the photos and the product reference before ordering.`,
          products: [found(p, c)],
        };
      return { text: `I can't find ${norm} in the ${c.name} catalogue. It may have been removed. Would you like me to search by name instead?`, offerTeam: true };
    }
  }
  if (has(q, /^(hi|hello|hey|salam|salaam|assalam|good (morning|afternoon|evening))\b/) && q.length < 40)
    return {
      text: "Hello. I can find products by name or code, explain how ordering works, and answer questions from Ravisn's published policies. What are you looking for?",
    };
  if (has(q, /\b(human|person|agent|someone|staff|representative|talk to|speak to|real person|call me)\b/) || has(q, /\bteam\b/))
    return { text: "Of course. I can bring in the Ravisn Ltd team.", offerTeam: true };
  if (has(q, /\b(rv\d{6}|order status|my order|where is my|tracking|track my)\b/))
    return {
      text: "Your order status and tracking, once dispatched, are on your order page. Orders sent from this browser are listed under Your order references. For anything else about an order, the team can help.",
      links: [{ label: "Your order references", to: "/orders" }],
      offerTeam: true,
    };
  if (has(q, /\b(how (do|can|to) (i )?(order|buy|purchase)|place an order|ordering|checkout|how to order)\b/)) {
    const c = country ?? site.countries[0];
    return { text: `Here is how ordering works${country ? ` in ${c.name}` : ""}:\n${c.ordering.map((s, i) => `${i + 1}. ${s}`).join("\n")}`, links: [{ label: "Help and FAQ", to: "/help" }] };
  }
  if (has(q, /\b(refund|return|cancel|exchange|damaged|broken|wrong item)\b/)) {
    const p = policies(site, slug, /refund|return|cancel|exchange|damag|replace|claim/i);
    return p.length
      ? { text: `From the ${where} policies:\n${p.join("\n")}`, links: country ? [{ label: `${country.name} policies`, to: `/${country.slug}/ordering` }] : undefined, offerTeam: true }
      : { text: "I don't have a written policy on that here, so I won't guess. The team can answer it for you.", offerTeam: true };
  }
  if (has(q, /\b(pay|payment|paid|bank|transfer|card|invoice)\b/)) {
    const p = policies(site, slug, /pay/i);
    return {
      text: `No payment is taken on this website. When you send an order, Ravisn Ltd reviews it and confirms stock, price and delivery, then sends payment details.${p.length ? `\nFrom the ${where} policies:\n${p.join("\n")}` : ""}`,
    };
  }
  if (has(q, /\b(deliver|delivery|shipping|ship|dispatch|courier|label|labels|cut-?off|arrive|postage)\b/)) {
    const p = policies(site, slug, /dispatch|deliver|shipping|label|courier|track|cut-?off|timing/i);
    return p.length
      ? { text: `From the ${where} policies:\n${p.join("\n")}\nDelivery charges and timing are confirmed by the team for each order.`, offerTeam: true }
      : { text: "Delivery charges and timing are confirmed by the team for each order. I don't have more detail on that here.", offerTeam: true };
  }
  if (has(q, /\b(photo|photos|image|images|picture|packaging|colour|color)\b/))
    return {
      text: "Product images are provided for reference. Packaging, colours and presentation may vary. Please open the product reference link on the product page and confirm the exact specifications, size, variation and quantity before listing or ordering.",
    };
  if (has(q, /\b(privacy|personal data|gdpr|delete my|my data)\b/))
    return { text: "Our privacy notice explains what we keep, why, and how to ask us to delete it.", links: [{ label: "Privacy notice", to: "/privacy" }] };
  if (has(q, /\b(contact|whatsapp|email|phone number|call)\b/))
    return { text: "You can reach the team here in the chat, or see all contact options on the Contact page.", links: [{ label: "Contact", to: "/contact" }], offerTeam: true };
  if (has(q, /\b(statuses|what does .* mean|available on demand|in transit|bulk only)\b/))
    return { text: site.statuses.map((s) => `${s.name}: ${s.definition}`).join("\n") };

  const { list, total } = await search(site, slug, raw);
  if (list.length)
    return {
      text: `I found ${total > list.length ? `${total} products; here are the closest ${list.length}` : list.length === 1 ? "1 product" : `${list.length} products`}${country ? ` (${country.name} first)` : ""}. Stock and prices are as listed; the team confirms them for each order.`,
      products: list,
      links: total > list.length ? [{ label: "See all results", to: `/search?q=${encodeURIComponent(raw.trim())}` }] : undefined,
    };
  if (has(q, /\b(price|prices|cost|discount|wholesale|bulk)\b/))
    return { text: "Prices are per unit, in the catalogue's currency, and the team confirms the final price before you pay. For bulk or special pricing, ask the team.", offerTeam: true };
  if (has(q, /\b(stock|available|availability|in stock)\b/))
    return { text: "Each product shows its status and the stock we last recorded. The team confirms availability for every order. Tell me a product name or code and I'll look it up." };
  return { text: "I'm not sure about that one, and I'd rather not guess. Try a product name or code, or ask the team.", offerTeam: true };
}

/** The reply as plain text, stored with the conversation so the team can read it. */
export function toPlain(r: Reply): string {
  const parts = [r.text];
  for (const p of r.products ?? []) parts.push(`${p.code} · ${p.name} · ${p.price} · ${p.status}`);
  for (const l of r.links ?? []) parts.push(`${l.label}: ${l.to}`);
  return parts.join("\n").slice(0, 2900);
}
