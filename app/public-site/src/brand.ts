/**
 * Ravisn art direction: curated, high-resolution catalogue photography and per-category styling.
 *
 * Image slots: drop optional lifestyle photographs into public/brand/ (for example public/brand/hero.jpg or
 * public/brand/categories/fragrance.jpg) and list them in PHOTO below. Each slot falls back to the curated
 * studio composition built from real catalogue photos, so the site never shows an empty frame.
 * Only self-hosted files and i.ebayimg.com are allowed by the site's Content Security Policy.
 */

const EBAY = (id: string, size = 960) => `https://i.ebayimg.com/images/g/${id}/s-l${size}.jpg`;

/** eBay serves the same photo at several sizes; catalogue data often stores the 225px thumbnail. */
export function hires(url: string | null | undefined, size = 960): string | null {
  if (!url) return null;
  return /i\.ebayimg\.com/.test(url) ? url.replace(/s-l\d+\.(jpg|jpeg|png|webp)/i, `s-l${size}.$1`) : url;
}

/** Optional self-hosted lifestyle photographs (public/brand/...). Empty until real photos are added. */
export const PHOTO: { hero?: string; shipping?: string; categories: Record<string, string> } = {
  categories: {},
};

/** Clean studio shots from the live catalogue, chosen for the hero still life. */
export const HERO_STILL_LIFE = [
  { id: "U4UAAeSwGClq1qlz", code: "RVN-US-58615", slug: "usa", label: "Fragrance" },
  { id: "XVIAAeSwAMtqQ8S4", code: "RVN-US-65575", slug: "usa", label: "Beauty" },
  { id: "qZ4AAeSw3rRq5-41", code: "RVN-US-65093", slug: "usa", label: "Fragrance" },
  { id: "z3gAAeSwMBhqQJCU", code: "RVN-US-72256", slug: "usa", label: "Home" },
  { id: "X1gAAeSwx9pqqOsB", code: "RVN-US-89011", slug: "usa", label: "Beauty" },
].map((p) => ({ ...p, src: EBAY(p.id, 960) }));

export interface CategoryArt {
  /** short supporting line on the card */
  line: string;
  /** backdrop tint for the studio composition */
  tint: string;
  /** deeper tone used for accents */
  tone: string;
  /** curated product photos (eBay image ids) */
  shots: string[];
}

const ART: Record<string, CategoryArt> = {
  fragrance: {
    line: "Designer and niche perfumes, from everyday icons to collector bottles.",
    tint: "#f1e4d6",
    tone: "#8a5a3c",
    shots: ["qZ4AAeSw3rRq5-41", "U4UAAeSwGClq1qlz", "bXMAAeSws~hq6oNJ", "anIAAeSwFpBoTB1c", "rRgAAeSwkOFqz95K", "E4AAAeSwTbZqqep4"],
  },
  "beauty-and-personal-care": {
    line: "Prestige skincare and cosmetics that move fast in every market.",
    tint: "#f4e3e1",
    tone: "#9c5b5b",
    shots: ["XVIAAeSwAMtqQ8S4", "X1gAAeSwx9pqqOsB", "FeIAAeSw~ahq4i-b", "UVkAAOSw101mHcs7", "-5oAAOSwYJhmcgKU"],
  },
  "health-and-wellness": {
    line: "Supplements and everyday wellness with steady repeat demand.",
    tint: "#e6ecdf",
    tone: "#56704a",
    shots: ["3eIAAeSwQ4lq2jsB", "6eIAAeSwURVq0fp4", "zAgAAeSw~JppQhf4", "r2oAAOSwOM5noLo9"],
  },
  "home-kitchen-and-garden": {
    line: "Drinkware, kitchen and home pieces your customers ask for by name.",
    tint: "#efe6dc",
    tone: "#8b6a4f",
    shots: ["n~IAAeSwR51pqPrT", "z3gAAeSwMBhqQJCU", "i-kAAOSw3lpme3f1"],
  },
  "pet-supplies": {
    line: "Trusted pet care and supplements for dogs and cats.",
    tint: "#e3e9ee",
    tone: "#4f6a80",
    shots: ["7EMAAeSwe2FpYCs6", "hQsAAeSwIAdq3m4k", "vqkAAeSw9fJqhiEx"],
  },
  "fashion-and-accessories": {
    line: "Leather goods, caps and knitwear with lasting appeal.",
    tint: "#ece4d8",
    tone: "#6e5638",
    shots: ["dYgAAeSwJ2dqexX5", "sCQAAeSwoY5q2Qtm", "Y6YAAeSwfoxq6dvE"],
  },
  "toys-and-collectibles": {
    line: "Sealed trading cards and collectible figures.",
    tint: "#efe2ea",
    tone: "#7d4f6d",
    shots: ["oeMAAeSwm2ppvbHR", "knEAAeSwQbBoiS0l"],
  },
  "electronics-and-gaming": {
    line: "Controllers, earbuds and accessories in sealed retail packaging.",
    tint: "#e4e6ec",
    tone: "#3f4a63",
    shots: ["w0cAAeSwRrRqpEpi", "ldcAAeSwv89pEzjC", "UhMAAeSw3VtpqPXD"],
  },
  "tools-and-diy": {
    line: "Cordless power tools and batteries from names trades trust.",
    tint: "#efe8d6",
    tone: "#7a6a2c",
    shots: ["Ph8AAeSwMA9pqU2o", "4tsAAOSw5VRmhRrO"],
  },
  "more-products": {
    line: "Everything else in the catalogue, from audio to cosmetics.",
    tint: "#ebe7e1",
    tone: "#5d574f",
    shots: ["5REAAeSwK3xq1qCj", "Z2AAAeSwVTRozq9v"],
  },
};

const FALLBACK_TINTS = ["#efe6da", "#e8ece4", "#ece5ea", "#e4e8ee"];

/** Art direction for a department; unknown departments get a neutral tint and their own catalogue image. */
export function categoryArt(slug: string, image?: string | null, i = 0): CategoryArt & { images: string[]; photo?: string } {
  const a = ART[slug];
  const images = a ? a.shots.map((id) => EBAY(id, 960)) : [hires(image) ?? ""].filter(Boolean);
  if (!images.length && image) images.push(hires(image)!);
  return {
    line: a?.line ?? "Browse every product in this category across all five catalogues.",
    tint: a?.tint ?? FALLBACK_TINTS[i % FALLBACK_TINTS.length],
    tone: a?.tone ?? "#5d574f",
    shots: a?.shots ?? [],
    images,
    photo: PHOTO.categories[slug],
  };
}

/** Flag-like accent colours for each market, used on country cards (no national emblems). */
/** Short market codes for badges (the catalogue keys mix codes and names). */
export const MARKET_CODE: Record<string, string> = { uk: "UK", usa: "US", canada: "CA", germany: "DE", australia: "AU" };

export const MARKET: Record<string, string> = {
  uk: "#20365f",
  usa: "#2b3f6b",
  canada: "#8c2f2f",
  germany: "#3a3a3a",
  australia: "#1f5a52",
};
