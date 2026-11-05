/**
 * Ravisn Assistant: a rules-based helper (not a generative AI model). It understands what a visitor is asking for,
 * searches the published catalogue, and answers from Ravisn's own published information. It never guesses stock,
 * prices, delivery times or refunds, and it only ever sees public data: no supplier, cost or customer information.
 */
import { savedOrders } from "./cart";
import { loadCountry, normaliseCode, slugForCode, type Country, type Product, type Site } from "./data";
import { lowestPrice, money, priceLabel, stockLabel, title } from "./format";

export interface FoundProduct {
  code: string;
  name: string;
  slug: string;
  price: string;
  status: string;
  stock: string;
  image: string | null;
}
export interface Action {
  label: string;
  to?: string;
  send?: string;
  team?: boolean;
  whatsapp?: boolean;
  /** Check an order saved in this browser, by its number. */
  order?: string;
  /** Open the secure order check (order number and private access key). */
  verify?: boolean;
}
export interface Reply {
  text: string;
  products?: FoundProduct[];
  actions?: Action[];
}
interface Filters {
  country?: string;
  department?: string;
  min?: number;
  max?: number;
  available?: boolean;
  words: string[];
}
export interface Memory {
  last?: Filters & { offset: number };
  misses: number;
  country?: string;
}

export const WELCOME = "Hi, I'm the Ravisn Assistant. I can find products for your store, walk you through ordering, explain how shipping works, or check an order securely. What can I help with?";
export const SUGGESTION_GROUPS: { title: string; items: string[] }[] = [
  { title: "Getting started", items: ["How does Ravisn work?", "How do I place an order?", "Do I need an account?", "Find products to resell"] },
  { title: "Shipping", items: ["Who pays for shipping?", "Can I upload my own shipping label?", "Can Ravisn arrange my shipping?", "Can you ship straight to my customer?"] },
  { title: "Products and orders", items: ["How do I check product availability?", "Can you find a product that isn't listed?", "How do I track my order?", "What is your returns process?"] },
];
export const SUGGESTIONS = SUGGESTION_GROUPS.flatMap((g) => g.items);

const COUNTRY_WORDS: [RegExp, string][] = [
  [/\b(uk|u\.k\.|united kingdom|britain|british|england|gb)\b/, "uk"],
  [/\b(usa|u\.s\.a?\.?|us|united states|america|american)\b/, "usa"],
  [/\b(canada|canadian)\b/, "canada"],
  [/\b(germany|german|deutschland|de)\b/, "germany"],
  [/\b(australia|australian|aus)\b/, "australia"],
];
const DEPT_WORDS: [RegExp, string][] = [
  [/\b(perfumes?|fragrances?|colognes?|scents?|parfum|edp|edt)\b/, "Fragrance"],
  [/\b(pets?|dogs?|cats?|puppy|kitten)\b/, "Pet Supplies"],
  [/\b(supplements?|vitamins?|health|wellness|capsules|gummies)\b/, "Health & Wellness"],
  [/\b(beauty|skincare|skin care|makeup|make-up|cosmetics?|hair ?care|personal care)\b/, "Beauty & Personal Care"],
  [/\b(toys?|pok[eé]mon|lego|collectibles?|trading cards?)\b/, "Toys & Collectibles"],
  [/\b(electronics?|gaming|games?|consoles?|controllers?|headphones?|gadgets?)\b/, "Electronics & Gaming"],
  [/\b(tools?|diy|drills?|power tools?)\b/, "Tools & DIY"],
  [/\b(home|kitchen|garden|homeware|household|tumblers?)\b/, "Home, Kitchen & Garden"],
  [/\b(fashion|accessories|bags?|jewel(le)?ry|watches?)\b/, "Fashion & Accessories"],
];
const STOP = new Set(
  "a an the and or of for to in on at by with from is are do does did you your we our i me my it its this that these those have has any some there please can could would like want need looking find search show me about price prices cost much how what which who when where stock stocks available availability buy order get sell selling resell product products item items got under below over above less more than between up max min cheaper cheap only now ones one all also just ok okay".split(
    " ",
  ),
);

const has = (q: string, re: RegExp) => re.test(q);

function found(p: Product, c: Country): FoundProduct {
  return {
    code: p.code,
    name: title(p),
    slug: c.slug,
    price: priceLabel(p, c.symbol),
    status: p.status,
    stock: p.availability === "unavailable" ? "" : stockLabel(p),
    image: p.images[0] ?? null,
  };
}

function parseFilters(raw: string): Filters {
  let q = ` ${raw.toLowerCase()} `;
  const f: Filters = { words: [] };
  for (const [re, slug] of COUNTRY_WORDS) if (!f.country && re.test(q)) (f.country = slug), (q = q.replace(new RegExp(re.source, "g"), " "));
  for (const [re, dept] of DEPT_WORDS) if (!f.department && re.test(q)) (f.department = dept), (q = q.replace(new RegExp(re.source, "g"), " "));
  // A currency symbol with no country named points at that currency's main catalogue.
  if (!f.country) f.country = /£/.test(q) ? "uk" : /€/.test(q) ? "germany" : /\$/.test(q) ? "usa" : undefined;
  const between = /between\s*[$£€]?\s*(\d+(?:\.\d+)?)\s*(?:and|to|-)\s*[$£€]?\s*(\d+(?:\.\d+)?)/.exec(q);
  if (between) {
    f.min = Number(between[1]);
    f.max = Number(between[2]);
    q = q.replace(between[0], " ");
  }
  const under = /(under|below|less than|up to|cheaper than|max(?:imum)?|no more than)\s*[$£€]?\s*(\d+(?:\.\d+)?)/.exec(q);
  if (under) (f.max = Number(under[2])), (q = q.replace(under[0], " "));
  const over = /(over|above|more than|at least|from|min(?:imum)?)\s*[$£€]?\s*(\d+(?:\.\d+)?)/.exec(q);
  if (over) (f.min = Number(over[2])), (q = q.replace(over[0], " "));
  if (/\b(available now|in stock|ready to (ship|dispatch))\b/.test(q)) (f.available = true), (q = q.replace(/\b(available now|in stock|ready to (ship|dispatch))\b/, " "));
  f.words = q
    .replace(/[^a-z0-9.\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
  return f;
}

async function search(site: Site, f: Filters, offset = 0, size = 4): Promise<{ list: FoundProduct[]; total: number }> {
  const countries = f.country ? site.countries.filter((c) => c.slug === f.country) : site.countries;
  const hits: { p: Product; c: Country; score: number }[] = [];
  for (const c of countries) {
    let products: Product[];
    try {
      products = await loadCountry(c.slug);
    } catch {
      continue;
    }
    for (const p of products) {
      if (f.department && p.department !== f.department) continue;
      if (f.available && p.availability !== "available") continue;
      if (p.availability === "unavailable" && !f.words.length) continue;
      const price = lowestPrice(p);
      if (f.max !== undefined && (price === null || price > f.max * 100)) continue;
      if (f.min !== undefined && (price === null || price < f.min * 100)) continue;
      let score = 1;
      if (f.words.length) {
        const text = `${p.code} ${p.legacy ?? ""} ${p.name} ${p.variant ?? ""} ${p.department}`.toLowerCase();
        const matched = f.words.filter((w) => text.includes(w) || (w.endsWith("s") && text.includes(w.slice(0, -1)))).length;
        if (matched < Math.ceil(f.words.length * 0.67)) continue;
        score = matched;
      }
      score += (p.availability === "available" ? 0.6 : 0) + (p.images.length ? 0.3 : 0);
      hits.push({ p, c, score });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  // Variety: round-robin across countries and product families, so one brand or country does not fill the list.
  const groups = new Map<string, typeof hits>();
  for (const h of hits) {
    const k = `${h.score.toFixed(1)}|${h.c.slug}|${h.p.name.toLowerCase().split(/\s+/).slice(0, 2).join(" ")}`;
    groups.set(k, [...(groups.get(k) ?? []), h]);
  }
  const ordered: typeof hits = [];
  const tiers = new Map<string, (typeof hits)[]>();
  const rank = new Map<string, number>();
  for (const [k, g] of groups) {
    const [tier, slug] = k.split("|");
    const r = rank.get(`${tier}|${slug}`) ?? 0;
    rank.set(`${tier}|${slug}`, r + 1);
    (g as any).rank = r;
    tiers.set(tier, [...(tiers.get(tier) ?? []), g]);
  }
  for (const gs of tiers.values()) gs.sort((a, b) => (a as any).rank - (b as any).rank);
  for (const gs of tiers.values()) for (let i = 0; gs.some((g) => g.length > i); i++) for (const g of gs) if (g[i]) ordered.push(g[i]);
  return { list: ordered.slice(offset, offset + size).map((h) => found(h.p, h.c)), total: ordered.length };
}

function describe(f: Filters, site: Site) {
  const parts = [];
  if (f.department) parts.push(`${f.department.toLowerCase()}${f.words.length ? "" : " products"}`);
  if (f.words.length) parts.push(`“${f.words.join(" ")}”`);
  const c = site.countries.find((x) => x.slug === f.country);
  let s = parts.length ? parts.join(" matching ") : "products";
  if (c) s += ` in the ${c.name}`;
  const sym = c?.symbol ?? "";
  if (f.min !== undefined && f.max !== undefined) s += ` between ${sym}${f.min} and ${sym}${f.max}`;
  else if (f.max !== undefined) s += ` under ${sym}${f.max}`;
  else if (f.min !== undefined) s += ` over ${sym}${f.min}`;
  if (f.available) s += " available now";
  return s;
}

function cutoffs(site: Site, slug?: string) {
  const cs = slug ? site.countries.filter((c) => c.slug === slug) : site.countries;
  return cs.map((c) => [c.name, c.ordering.find((s) => /label/i.test(s) && /(AM|PM)/.test(s))] as const).filter(([, s]) => s);
}

function returnsRules(site: Site, slug?: string) {
  const c = site.countries.find((x) => x.slug === slug) ?? site.countries[0];
  const score = (it: { title: string; body: string }) => (/return|refund|exchange/i.test(it.title) ? 3 : 0) + (/damag|claim/i.test(it.title) ? 2 : 0) + (/return|refund|exchange/i.test(it.body) ? 1 : 0);
  return c.policies
    .flatMap((s) => s.items)
    .filter((it) => score(it) > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, 3)
    .map((it) => it.body);
}

const teamAction: Action = { label: "Talk to the Ravisn team", team: true };

export async function answer(raw: string, site: Site, slug: string | undefined, mem: Memory): Promise<Reply> {
  const q = raw.trim().toLowerCase();
  const here = site.countries.find((c) => c.slug === (slug ?? mem.country));
  const ok = (r: Reply) => ((mem.misses = 0), r);
  const miss = (r: Reply) => {
    mem.misses += 1;
    if (mem.misses >= 2) r.actions = [...(r.actions ?? []), { label: "Message us on WhatsApp", whatsapp: true }];
    return r;
  };

  if (/^(hi|hello|hey|hiya|salam|salaam|assalam|good (morning|afternoon|evening))\b/.test(q) && q.length < 40)
    return ok({
      text: "Hello! What can I help you with today? I can find products, walk you through an order, or explain how shipping works.",
      actions: [
        { label: "Find products to resell", send: "Find products to resell" },
        { label: "How does Ravisn work?", send: "How does Ravisn work?" },
        { label: "Track an order", verify: true },
      ],
    });
  if (/^(thanks|thank you|thx|cheers|great|perfect|ok thanks|that'?s (all|it)|bye|goodbye)\b/.test(q) && q.length < 50)
    return ok({ text: "You're welcome. If anything else comes up, I'm right here, and the team can step in whenever you need them.", actions: [{ label: "Browse products", to: "/products" }] });
  if (has(q, /\b(whatsapp)\b/)) return ok({ text: `You can reach the Ravisn team on WhatsApp at ${site.whatsapp.display}. Replies are not instant outside working hours.`, actions: [{ label: "Open WhatsApp", whatsapp: true }] });
  if (has(q, /\b(urgent|asap|emergency|complain|complaint|problem with (my )?order|wrong address|change (my )?(order|address))\b/))
    return ok({
      text: "Sorry to hear that. This needs a person, so let's get you to the team. Start a chat with them here, or message them on WhatsApp for anything time-sensitive. Have your order number ready.",
      actions: [teamAction, { label: `WhatsApp ${site.whatsapp.display}`, whatsapp: true }],
    });
  if (has(q, /\b(how does (ravisn|this|it) work|what is ravisn|who (are|is) (you|ravisn)|what do you (do|sell)|about ravisn|is (this|ravisn) (legit|real|safe|trustworthy))\b/))
    return ok({
      text: `Ravisn Ltd supplies resellers from wholesale catalogues in the ${site.countries.map((c) => c.name).join(", ").replace(/, ([^,]*)$/, " and $1")}. You browse products with per-unit prices in local currency, send an order request (nothing is charged online), and our team confirms stock, price and shipping before you pay. Shipping is arranged by you with your own label, or quoted by Ravisn.`,
      actions: [
        { label: "How do I place an order?", send: "How do I place an order?" },
        { label: "Who pays for shipping?", send: "Who pays for shipping?" },
        { label: "About Ravisn", to: "/about" },
      ],
    });
  if (has(q, /\b((?<!bank )account|sign ?up|register|log ?in|sign ?in|password|membership)\b/))
    return ok({
      text: "You don't need an account. When you send an order you get a private link and access key for it. Keep them safe: they're how you follow the order, add a shipping label and see payment details. Orders sent from this browser are also listed under Saved order references.",
      actions: [{ label: "Saved order references", to: "/orders" }, { label: "Start browsing", to: "/products" }],
    });
  if (has(q, /\b(minimum order|min(imum)? (quantity|qty|spend)|moq|smallest order|how many (do i|must i) (buy|order))\b/))
    return ok({
      text: "Prices are per unit, and some products have single or pack options. Choose the quantity you need on the product page; our team confirms quantities with every order and can tell you what's possible for larger volumes.",
      actions: [{ label: "Browse products", to: "/products" }, teamAction],
    });
  if (has(q, /\b(drop ?ship|dropshipping|ship (straight |directly )?to my customer|send (it )?to my customer|blind ship|my customer'?s address)\b/))
    return ok({
      text: "Yes. At checkout you enter the recipient's delivery details, so the parcel can go straight to your customer. You then either attach your own prepaid label for that address, or ask Ravisn for a shipping quote. Product prices don't include shipping, so you can charge your customer for it or build it into your price.",
      actions: [{ label: "Shipping and labels", to: "/shipping" }, { label: "Can I upload my own shipping label?", send: "Can I upload my own shipping label?" }],
    });
  if (has(q, /\b(not listed|isn'?t listed|can'?t find|cannot find|source (a|this|it|for me)|sourcing|special request|request a product)\b/) && !has(q, /\b(order|parcel)\b/))
    return ok({
      text: "Tell me the product name or brand and I'll search all five catalogues for it. If it isn't listed, the team can tell you whether they can source it: send them the product name, the quantity you need and the market you sell in.",
      actions: [{ label: "Search all products", to: "/products" }, teamAction],
    });
  if (has(q, /\b(currenc(y|ies)|exchange rate|convert|pounds|dollars|euros?|gbp|usd|cad|eur|aud)\b/) && !has(q, /\b(under|below|over|above|between)\b/))
    return ok({
      text: `Each catalogue is priced per unit in its own currency: ${site.countries.map((c) => `${c.name} in ${c.currency}`).join(", ")}. You pay in the currency of the catalogue you order from, and our team confirms the final amount before payment.`,
      actions: site.countries.slice(0, 3).map((c) => ({ label: `Browse ${c.key} stock`, send: `Browse ${c.key} stock` })),
    });
  if (has(q, /\b(how long (does|until|before) .*(confirm|reply|respond|hear back)|when will (you|the team) (confirm|reply)|response time|opening hours|working hours|are you open)\b/))
    return ok({
      text: "The team reviews orders and messages as they come in and replies as soon as they can; it's not instant outside working hours. Your order page always shows the latest status, so you never have to guess. For anything time-sensitive, WhatsApp is the quickest way to reach a person.",
      actions: [{ label: "Track an order", verify: true }, { label: "Message us on WhatsApp", whatsapp: true }],
    });
  if (has(q, /\b(vat|tax|taxes|customs|duty|duties|import fees?|invoice|receipt)\b/))
    return ok({
      text: "Tax, customs and invoice questions depend on the market and the order, so I won't guess. The team confirms these details with you before payment.",
      actions: [teamAction, { label: "Terms and conditions", to: "/terms" }],
    });
  if (has(q, /\b(talk to|speak to|human|real person|agent|representative|someone|staff|the team|ravisn team)\b/))
    return ok({ text: "Of course. I'll bring in the Ravisn team. If nobody is available right now, you can leave a message and we'll get back to you.", actions: [teamAction] });
  if (has(q, /\b(supplier|suppliers|wholesaler|cost price|your cost|buying price|margins?|profit|mark-?up|who do you buy|where do you (get|source))\b/))
    return ok({ text: "That's something we keep private, so I can't share supplier details, purchase costs or margins. The prices on each product page are the prices you pay per unit, and our team confirms them for every order." });

  // A Ravisn reference or a legacy code: show that product.
  const code = /\b(rvn-?[a-z]{2}-?\d{5}|[a-z]{2}-?\d{1,5})\b/i.exec(raw);
  if (code && !/^rvs/i.test(code[0]) && slugForCode(code[0])) {
    const norm = normaliseCode(code[0]);
    const c = site.countries.find((x) => x.slug === slugForCode(norm));
    if (c) {
      const p = (await loadCountry(c.slug).catch(() => [] as Product[])).find((x) => x.code === norm || x.legacy === norm);
      if (p)
        return ok({
          text: `${p.code} is ${title(p)} from the ${c.name} catalogue. It's currently “${p.status}”${p.availability !== "unavailable" && stockLabel(p) ? ` with ${stockLabel(p)}` : ""}, priced ${priceLabel(p, c.symbol)}. Open it to check the photos and product reference before you order.`,
          products: [found(p, c)],
          actions: [{ label: "Open product", to: `/${c.slug}/${p.code}` }],
        });
      return miss({ text: `I couldn't find ${norm} in the ${c.name} catalogue; it may have been removed. Tell me the product name and I'll search for it.` });
    }
  }

  if (has(q, /\b(rvs-?\d{4}|track|tracking|where is my order|order status|my order|parcel)\b/)) {
    const saved = savedOrders().slice(0, 3);
    return ok({
      text: `I can check that for you. For privacy, an order opens only with its private link or access key, which you received when you sent it.${saved.length ? " These orders were sent from this browser, so I can check them straight away:" : " Choose “Check an order” and paste your order number with the private link or key."}`,
      actions: [...saved.map((o) => ({ label: `Check ${o.number}`, order: o.number })), { label: "Check an order", verify: true }, { label: "Track order page", to: "/track" }],
    });
  }
  if (has(q, /\b(who pays|pay for shipping|shipping cost|shipping charges?|postage cost|delivery cost|is shipping included|free shipping)\b/))
    return ok({
      text: "Shipping is the reseller's responsibility. You can arrange your own shipping label or request one through Ravisn for a separately confirmed charge. You can charge your customer for shipping or include it in your own selling price.",
      actions: [{ label: "Shipping and labels", to: "/shipping" }, { label: "Can Ravisn arrange my shipping?", send: "Can Ravisn arrange my shipping?" }],
    });
  if (has(q, /\b(own (shipping )?label|upload .*label|prepaid label|my label|send .*label|labels?)\b/))
    return ok({
      text: "Yes. At checkout choose “I'll arrange shipping” and attach your prepaid label (PDF or image, up to 1.5 MB), or add it later on your order page before dispatch, with the carrier and tracking number. We check it matches the dispatch origin, the recipient's address, the parcel and the carrier. If you need the dispatch address to buy the label, ask for it on your order page and we'll confirm it privately.",
      actions: [{ label: "Shipping and labels", to: "/shipping" }, { label: "Add a label to an order", to: "/track" }],
    });
  if (has(q, /\b(ravisn (arrange|ship|handle)|arrange (my )?shipping|ship it for me|you ship|do you ship|shipping quote)\b/))
    return ok({
      text: "Yes. Choose “Request a shipping quote from Ravisn” at checkout or on your order page. We'll confirm the actual shipping charge separately from the product prices; once it's paid we arrange the label, and the carrier's tracking number appears on your order page after dispatch.",
      actions: [{ label: "Shipping and labels", to: "/shipping" }, { label: "Start an order", to: "/products" }],
    });
  if (has(q, /\b(delivery times?|how long|when will .* arrive|dispatch time|cut-?off|same.?day|lead time)\b/)) {
    const cs = cutoffs(site, slug ?? mem.country);
    return ok({
      text: `Dispatch starts once your order, payment and shipping are confirmed, and it follows each country's cut-off time.${cs.length ? ` For example: ${cs.slice(0, 3).map(([n, s]) => `${n}: ${s!.charAt(0).toLowerCase()}${s!.slice(1)}`).join(" ")}` : ""} After that, the delivery time depends on the carrier and service used, so I won't promise a date. The team can tell you more for a specific order.`,
      actions: [{ label: "Country policies", to: `/${(here ?? site.countries[0]).slug}/ordering` }, teamAction],
    });
  }
  if (has(q, /\b(check (product )?availability|is it (available|in stock)|availability|statuses|what does .* mean)\b/))
    return ok({
      text: `Every product shows its status, such as “Available” or “Available on demand”, and the stock we last recorded. We confirm availability for every order before you pay. Tell me a product name or a Ravisn reference and I'll look it up.`,
      actions: [{ label: "What the statuses mean", to: "/faq" }, { label: "Browse available products", to: "/products?avail=available" }],
    });
  if (has(q, /\b(returns?|refunds?|exchange|damaged|broken|wrong item|cancel)\b/)) {
    const rules = returnsRules(site, slug ?? mem.country);
    return ok({
      text: rules.length ? `Here's how it works: ${rules.join(" ")} If something arrives damaged, contact us straight away with your order reference.` : "Returns are handled case by case. Please contact the team with your order reference before sending anything back.",
      actions: [{ label: "Returns and refunds", to: "/returns" }, teamAction],
    });
  }
  if (has(q, /\b(how (do|can|to) (i )?(place|make|start)? ?(an )?(order|buy|purchase)|place an order|ordering|checkout|how to order)\b/))
    return ok({
      text: "It's simple: 1. Find a product and open its reference to check the size and variation. 2. Choose the option and quantity, then Add to order. 3. Enter the recipient's delivery details and choose how shipping is arranged. 4. Review and send the request; nothing is charged. 5. Our team confirms stock, price and shipping, then sends payment details.",
      actions: [{ label: "Browse products", to: "/products" }, { label: "How it works", to: "/how-it-works" }],
    });
  if (has(q, /\b(pay|payment|paid|bank|transfer|card|invoice)\b/))
    return ok({ text: "No payment is taken on the website. After you send an order, our team confirms stock, price and shipping, then sends you payment details. Your order page shows the payment status.", actions: [{ label: "How it works", to: "/how-it-works" }] });
  if (has(q, /\b(photos?|images?|pictures?|packaging|colou?r)\b/))
    return ok({ text: "Product photos are a reference. Packaging, colours and presentation may vary, so open the product reference on each product page and check the exact size, variation and quantity before listing or ordering." });
  if (has(q, /\b(privacy|personal data|gdpr|delete my|my data)\b/)) return ok({ text: "Our privacy notice explains what we keep, why, and how to ask us to delete it.", actions: [{ label: "Privacy notice", to: "/privacy" }] });
  if (has(q, /\b(contact|email|phone number|call you)\b/)) return ok({ text: "You can talk to the team here, or see every way to reach us on the Contact page.", actions: [teamAction, { label: "Contact", to: "/contact" }] });
  if (has(q, /\b(discount|bulk|wholesale price|better price|negotiate)\b/)) return ok({ text: "Prices are per unit as listed, and some products have pack or bulk options. For larger quantities, the team can confirm what's possible.", actions: [teamAction] });
  if (has(q, /\b(reference|ravisn code|product code|rvn)\b/))
    return ok({ text: "Every product has a permanent Ravisn reference such as RVN-UK-10482. Older codes like UK-0001 still work in links and searches, so your saved listings keep working." });

  // Browsing: a country's stock, or "what can I resell?"
  const f = parseFilters(raw);
  if (f.country) mem.country = f.country;
  if (has(q, /\b(find products to resell|what (can|should) i (sell|resell)|best sellers?|ideas|recommend)\b/) && !f.department && !f.words.length) {
    const r = await search(site, { ...f, available: true, words: [] }, 0, 4);
    return ok({
      text: `Happy to help. Which area do you sell in? Here are a few products available now${f.country ? ` in the ${site.countries.find((c) => c.slug === f.country)?.name}` : ""} to get you started.`,
      products: r.list,
      actions: ["Fragrance", "Health & Wellness", "Beauty & Personal Care", "Electronics & Gaming"].map((d) => ({ label: d, send: `Show me ${d.toLowerCase()}${f.country ? ` in the ${f.country.toUpperCase()}` : ""}` })),
    });
  }
  if (/^\s*(browse|shop|show)\s+(the\s+)?(uk|us|usa|canada|canadian|germany|german|australia|australian)\s+(stock|catalogue|products)\s*$/i.test(raw) || (f.country && !f.department && !f.words.length && f.max === undefined && f.min === undefined)) {
    const c = site.countries.find((x) => x.slug === f.country)!;
    const r = await search(site, { country: c.slug, available: true, words: [] }, 0, 4);
    mem.last = { country: c.slug, available: true, words: [], offset: 4 };
    return ok({
      text: `The ${c.name} catalogue has ${c.count.toLocaleString("en-GB")} products, ${c.available.toLocaleString("en-GB")} available now, priced per unit in ${c.currency}. Here are a few to start with.`,
      products: r.list,
      actions: [{ label: `Shop all ${c.name} stock`, to: `/${c.slug}` }, { label: "Show more", send: "show more" }],
    });
  }
  if (/^\s*(show )?(more|next|others?|more please)\s*$/.test(q) && mem.last) {
    const r = await search(site, mem.last, mem.last.offset, 4);
    mem.last.offset += 4;
    if (!r.list.length) return ok({ text: "That's everything I found for that search. Try another category or country." });
    return ok({ text: `Here are ${r.list.length} more.`, products: r.list, actions: r.total > mem.last.offset ? [{ label: "Show more", send: "show more" }] : [] });
  }

  if (f.department || f.words.length || f.max !== undefined || f.min !== undefined) {
    const r = await search(site, f, 0, 4);
    mem.last = { ...f, offset: 4 };
    const sym = site.countries.find((c) => c.slug === f.country)?.symbol;
    if (r.list.length) {
      const qs = new URLSearchParams();
      if (f.words.length) qs.set("q", f.words.join(" "));
      if (f.country) qs.set("c", f.country);
      if (f.department) qs.set("dept", f.department.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-"));
      if (f.max !== undefined) qs.set("max", String(f.max));
      if (f.min !== undefined) qs.set("min", String(f.min));
      return ok({
        text: `I found ${r.total.toLocaleString("en-GB")} ${describe(f, site)}${!f.country && (f.max !== undefined || f.min !== undefined) ? " (prices compared in each catalogue's own currency)" : ""}. Here are the best matches; stock and prices are as listed and confirmed with every order.`,
        products: r.list,
        actions: [{ label: "See all results", to: `/products?${qs}` }, ...(r.total > 4 ? [{ label: "Show more", send: "show more" }] : [])],
      });
    }
    return miss({
      text: `I couldn't find ${describe(f, site)}${sym ? "" : ""}. Try fewer words, another category, or a different price, or ask the team to help you source it.`,
      actions: [{ label: "Browse all products", to: "/products" }, teamAction],
    });
  }
  return miss({
    text: "I'm not sure I understood that. I can find products (for example “perfumes in the UK under £20”), explain ordering and shipping, or help you track an order.",
    actions: [{ label: "Find products to resell", send: "Find products to resell" }, { label: "Who pays for shipping?", send: "Who pays for shipping?" }, teamAction],
  });
}

/** The reply as plain text, stored with the conversation so the team can read it. */
export function toPlain(r: Reply): string {
  const parts = [r.text];
  for (const p of r.products ?? []) parts.push(`${p.code} · ${p.name} · ${p.price} · ${p.status}`);
  for (const a of r.actions ?? []) if (a.to) parts.push(`${a.label}: ${a.to}`);
  return parts.join("\n").slice(0, 2900);
}

export { money };
