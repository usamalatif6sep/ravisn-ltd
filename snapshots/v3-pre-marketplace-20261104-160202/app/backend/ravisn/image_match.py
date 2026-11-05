"""Deciding whether another eBay listing shows the SAME product as ours.

Title similarity alone never makes a match. A candidate must agree on every attribute our product states:
brand, model numbers, size (ml/oz/g, with oz-ml conversion), count and pack quantity, colour, men's or women's
version, fragrance concentration and flanker words. Anything that signals a different item (tester, sample, set,
refill, a different size or variant) rejects it. Results are graded high or medium; nothing is ever approved
automatically.
"""

import re

NOISE = {
    "new", "brand", "sealed", "authentic", "genuine", "original", "100", "free", "fast", "shipping", "ship", "uk", "us", "usa",
    "seller", "stock", "in", "box", "nib", "bnib", "bnwt", "the", "and", "for", "with", "by", "of", "a", "an", "to", "from",
    "&", "-", "+", "|", "/", "x", "men", "women", "mens", "womens", "man", "woman", "unisex", "everyone", "him", "her", "spray",
    "edition", "fragrance", "fragrances", "pour", "homme", "femme", "ladies", "lady", "boxed", "rare", "genuine",
}
COLOURS = {"black", "white", "red", "blue", "green", "pink", "purple", "yellow", "orange", "gold", "silver", "grey", "gray", "brown",
           "beige", "cream", "navy", "teal", "lilac", "lavender", "rose", "clear", "glitter", "matte", "mint", "coral", "ivory"}
FLANKERS = {"intense", "elixir", "absolu", "absolute", "extreme", "sport", "noir", "nuit", "night", "prive", "privé", "fraiche",
            "fresh", "pride", "ultra", "leau", "l'eau", "collector", "platinum", "legend", "reserve", "oud", "aqua"}
# phrase in the listing -> word our name must contain for it to be the same version
FLANKER_PHRASES = {"le parfum": "le parfum", "parfum intense": "intense", "eau intense": "intense", "eau fraiche": "fraiche",
                   "pour femme": "femme", "pour homme": "homme"}
CONCENTRATION_WORDS = {"eau", "de", "parfum", "toilette", "cologne", "edp", "edt", "edc", "extrait", "perfume"}
DIFFERENT_ITEM = {
    "tester": "tester", "testers": "tester", "sample": "sample", "samples": "sample", "decant": "decant", "vial": "vial", "vials": "vial",
    "mini": "miniature", "miniature": "miniature", "travel": "travel size", "refill": "refill", "empty": "empty bottle", "replica": "replica",
    "inspired": "inspired-by item", "dupe": "dupe", "clone": "clone", "used": "used", "damaged": "damaged", "unboxed": "unboxed",
    "set": "set", "giftset": "gift set", "geschenkset": "gift set", "coffret": "gift set", "bundle": "bundle", "lot": "lot", "kit": "kit",
    "case": "case", "pack": "multi-pack", "probe": "sample", "proben": "sample", "abfullung": "decant", "abgefullt": "decant",
}
# A listing that adds one of these words is a different line of the product (Nutrafol Women's Balance, Acqua di Gio Profondo)
VARIANT_WORDS = {"balance", "postpartum", "profondo", "profumo", "plus", "max", "pro", "advanced", "extra", "kids", "junior", "baby",
                 "toddler", "lite", "light", "zero", "senior", "forte", "complete", "premium", "deluxe", "xl", "xxl", "jumbo", "ultimate",
                 "ultime", "supreme", "sensitive", "unscented"}
SINGLE_LETTER_NOISE = {"a", "e", "x", "s", "n", "o", "i", "l", "t", "m", "c"}
# Words sellers add that say nothing about which product it is (English and German listings)
FILLER = {
    "natural", "vaporisateur", "vapo", "zerstauber", "regular", "size", "full", "bottle", "perfume", "parfum", "cologne", "authentic",
    "genuine", "original", "sealed", "item", "items", "post", "postage", "delivery", "dispatch", "au", "ca", "de", "eu", "gb",
    "herren", "damen", "duft", "neu", "ovp", "originalverpackt", "versiegelt", "folie", "rrp", "exp", "expiry", "batch", "piece",
    "pieces", "supplement", "supplements", "dietary", "month", "supply", "day", "days", "ages", "age", "refillable", "rechargeable",
    "mist", "sale", "deal", "best", "price", "official", "retail", "packaging", "packed", "wrapped", "cellophane", "value", "gift",
    "boxes", "bnwt", "nwt", "nib", "bnib", "free", "shipping", "fast", "uk", "us", "usa", "seller", "stock", "brand", "new",
    "women", "men", "ladies", "unisex", "everyone", "him", "her", "homme", "femme", "pour", "spray", "edition", "fragrance",
}
TOOL_ONLY = ("body only", "bare tool", "tool only", "unit only", "skin only", "no battery")
MALE = {"men", "mens", "man", "homme", "boys"}
FEMALE = {"women", "womens", "woman", "femme", "ladies", "lady", "girls"}
BOTH = {"unisex", "everyone"}
# Brands that listings often shorten: what our name may say -> what a listing may say instead
BRAND_ALIASES = {
    "christian dior": ("dior",), "giorgio armani": ("armani",), "yves saint laurent": ("ysl", "saint laurent"),
    "jean paul gaultier": ("gaultier", "jpg"), "paco rabanne": ("rabanne",), "thierry mugler": ("mugler",),
    "carolina herrera": ("herrera",), "maison francis kurkdjian": ("kurkdjian", "mfk"), "dolce gabbana": ("dolce", "d&g"),
    "calvin klein": ("calvin klein", "ck"), "tiffany co": ("tiffany",), "ralph lauren": ("ralph lauren", "polo"),
    "hugo boss": ("boss",), "maison alhambra": ("alhambra",),
}
QUERY_BRAND = {"christian dior": "dior", "giorgio armani": "armani", "yves saint laurent": "saint laurent", "jean paul gaultier": "gaultier",
               "paco rabanne": "rabanne", "thierry mugler": "mugler", "carolina herrera": "herrera", "maison francis kurkdjian": "kurkdjian",
               "dolce gabbana": "dolce gabbana", "tiffany co": "tiffany"}
CONCENTRATION = [("edp", r"\beau de parfum\b|\bedp\b"), ("edt", r"\beau de toilette\b|\bedt\b"),
                 ("cologne", r"\beau de cologne\b|\bedc\b|\bcologne\b"), ("parfum", r"\bextrait\b|(?<!de )\bparfum\b|\bperfume oil\b")]
UNIT = {"fl oz": "oz", "floz": "oz", "fl.oz": "oz", "oz": "oz", "ml": "ml", "l": "l", "ltr": "l", "litre": "l", "liter": "l",
        "g": "g", "gm": "g", "gr": "g", "grams": "g", "kg": "kg", "mg": "mg", "mcg": "mcg", "lb": "lb", "lbs": "lb",
        "ct": "count", "count": "count", "capsules": "count", "capsule": "count", "caps": "count", "tablets": "count", "tablet": "count",
        "tabs": "count", "softgels": "count", "softgel": "count", "gummies": "count", "pcs": "count", "pieces": "count", "piece": "count",
        "sachets": "count", "servings": "servings", "doses": "count", "dose": "count", "applications": "count", "pipettes": "count",
        "pods": "count", "wipes": "count", "sheets": "count", "pairs": "count", "rolls": "count", "sticks": "count", "pouches": "count",
        "packets": "count", "chews": "count", "lozenges": "count", "strips": "count", "patches": "count", "ampoules": "count"}
SIZE_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(fl\.?\s*oz|floz|oz|ml|ltr|litre|liter|l|grams|gm|gr|g|kg|mg|mcg|lbs|lb|ct|count|capsules?|caps|"
                     r"tablets?|tabs|softgels?|gummies|pcs|pieces?|sachets|servings|doses?|applications|pipettes|pods|wipes|sheets|pairs|"
                     r"rolls|sticks|pouches|packets|chews|lozenges|strips|patches|ampoules)(?![a-z])", re.I)
PACK_RE = re.compile(r"(?:pack of|set of|lot of|bundle of|case of|box of|x)\s*(\d{1,2})\b"
                     r"|\b(\d{1,2})\s*[- ]?(?:packs?|pk|pcs set|piece set|bottles?|boxes|tubs?|jars?|units)\b"
                     r"|\b(\d{1,2})\s*x\s+(?=[a-z])"  # "2 x Purina …" (but not "30 x 1g")
                     r"|^\W*\((\d{1,2})\)\s", re.I)  # "(3) Fisico …"
EAU_LINE_RE = re.compile(r"\beau (?!de\b|du\b|des\b|d')([a-z]+)")  # Eau Sauvage, Eau Tendre: product lines, not EDP/EDT
SEGMENT_RE = re.compile(r"\s+[-–—|~:]+\s+|\s*[,;]\s+|\s+\(|\)\s*|\s+/\s+|\s[-–—]$")


def norm(text: str) -> str:
    t = (text or "").lower().replace("’", "'").replace("‘", "'").replace("é", "e").replace("è", "e").replace("ü", "u").replace("ä", "a").replace("ö", "o")
    t = re.sub(r"'s\b", "s", t)  # men's -> mens
    t = re.sub(r"\s*&\s*", " & ", t)
    return re.sub(r"\s+", " ", t)


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+(?:[.'][a-z0-9]+)*", norm(text))


def sizes(text: str) -> dict[str, list[float]]:
    out: dict[str, list[float]] = {}
    for value, unit in SIZE_RE.findall(norm(text)):
        u = UNIT.get(re.sub(r"\s+", " ", unit.lower()).replace(". ", ".").rstrip("s") if unit.lower() not in UNIT else unit.lower(),
                     UNIT.get(unit.lower(), unit.lower()))
        v = float(value.replace(",", "."))
        if u == "l":
            u, v = "ml", v * 1000
        if u == "kg":
            u, v = "g", v * 1000
        out.setdefault(u, []).append(v)
    return out


def packs(text: str) -> set[int]:
    found = set()
    for groups in PACK_RE.findall(norm(text)):
        n = int(next(g for g in groups if g))
        if 1 < n <= 48:
            found.add(n)
    return found


def concentration(text: str) -> str | None:
    t = norm(text)
    for name, rx in CONCENTRATION:
        if re.search(rx, t):
            return name
    return None


def concentrations(text: str) -> set[str]:
    t = norm(text)
    return {name for name, rx in CONCENTRATION if re.search(rx, t)}


def gender(word_set: set[str]) -> set[str]:
    if word_set & BOTH:
        return {"m", "f"}
    return ({"m"} if word_set & MALE else set()) | ({"f"} if word_set & FEMALE else set())


def _size_tokens(text: str) -> set[str]:
    return {re.sub(r"\s+", "", m.group(0).lower()) for m in SIZE_RE.finditer(norm(text))}


def significant(text: str) -> list[str]:
    """Our product's meaningful words, without sizes and noise."""
    size_parts = set()
    for m in SIZE_RE.finditer(norm(text)):
        size_parts.update(words(m.group(0)))
    out = []
    for w in words(text):
        if w in NOISE or w in size_parts or (len(w) < 2 and (w in SINGLE_LETTER_NOISE or w.isdigit())):
            continue
        if re.fullmatch(r"\d+(\.\d+)?", w):
            continue
        out.append(w)
    return out


def core(text: str) -> str:
    """The identifying start of a name: Amazon-style names add benefits after a dash or comma ("… 60 Caps – Energy,
    Health & Support"); those words are not expected in other listings' titles."""
    out = ""
    for part in SEGMENT_RE.split(norm(text)):
        out = f"{out} {part}".strip()
        if len([w for w in significant(out) if w not in CONCENTRATION_WORDS]) >= 3:
            break
    return out


def model_tokens(text: str) -> set[str]:
    """Words mixing letters and digits (model numbers like H2.0, B6, 4K), excluding sizes."""
    st = _size_tokens(text)
    return {w for w in words(text) if re.search(r"[a-z]", w) and re.search(r"\d", w) and w not in st and not SIZE_RE.fullmatch(w)}


def brand_of(text: str) -> tuple[str, tuple[str, ...]]:
    """(brand as our name writes it, other ways a listing may write it)."""
    t = norm(text).replace(" & ", " ").replace(".", "")
    for brand, aliases in BRAND_ALIASES.items():
        if re.search(rf"\b{brand}\b", t):
            return brand, aliases
    m = re.search(r"\bby ([a-z0-9']+)", t)
    if m and m.group(1) not in NOISE and m.group(1) not in CONCENTRATION_WORDS:
        return m.group(1), ()
    sig = significant(text)
    return (sig[0] if sig else ""), ()


def _same_size(ours: dict[str, list[float]], theirs: dict[str, list[float]]) -> tuple[bool, str]:
    """Every size we state must be present in theirs (oz and ml are converted)."""
    def has(unit, value):
        # 100 ml is sold as 3.3 oz and as 3.4 oz, so ounces get the same tolerance as the conversion
        if any(abs(v - value) <= max(0.01, value * (0.045 if unit == "oz" else 0.01)) for v in theirs.get(unit, [])):
            return True
        if unit == "oz":
            return any(abs(v - value * 29.5735) <= value * 29.5735 * 0.045 for v in theirs.get("ml", []))
        if unit == "ml":
            return any(abs(v * 29.5735 - value) <= value * 0.045 for v in theirs.get("oz", []))
        return False

    for unit, values in ours.items():
        if unit == "servings":
            continue
        for value in values:
            if not has(unit, value):
                if not theirs:
                    return False, "size not stated in the listing"
                return False, f"different size ({value:g} {unit} needed)"
    return True, ""


def evaluate(product_name: str, listing_title: str, is_group: bool = False) -> dict:
    """Compare one listing with our product. Returns {'ok', 'confidence', 'coverage', 'reasons', 'matched'}."""
    ours, theirs = norm(product_name), norm(listing_title)
    our_words, their_words = significant(ours), set(words(theirs))
    reasons, matched = [], []

    if not our_words:
        return {"ok": False, "confidence": None, "coverage": 0.0, "reasons": ["product name too short to match safely"], "matched": []}
    brand, aliases = brand_of(ours)
    flat = theirs.replace(" & ", " ").replace(".", "")
    if not any(re.search(rf"\b{re.escape(b)}\b", flat) for b in (brand, *aliases) if b):
        reasons.append(f"brand “{brand}” missing")
    else:
        matched.append("brand")

    models = model_tokens(ours)
    missing_models = [m for m in models if m not in their_words and m.replace(".", "") not in theirs.replace(".", "")]
    if missing_models:
        reasons.append("model " + ", ".join(sorted(missing_models)) + " missing")
    elif models:
        matched.append("model " + ", ".join(sorted(models)))

    our_sizes, their_sizes = sizes(ours), sizes(theirs)
    if our_sizes:
        ok, why = _same_size(our_sizes, their_sizes)
        if ok:
            matched.append("size")
        else:
            reasons.append(why)

    our_packs, their_packs = packs(ours), packs(theirs)
    if their_packs - our_packs:
        reasons.append(f"multi-pack of {', '.join(str(n) for n in sorted(their_packs - our_packs))}")
    if our_packs - their_packs:
        reasons.append(f"pack of {', '.join(str(n) for n in sorted(our_packs - their_packs))} not confirmed")

    our_conc, their_conc = concentration(ours), concentration(theirs)
    soft = []
    if our_conc and their_conc and our_conc != their_conc:
        if {our_conc, their_conc} == {"edp", "parfum"}:
            soft.append(f"listing says {their_conc.upper()}, ours says {our_conc.upper()}")
        else:
            reasons.append(f"{their_conc.upper()} instead of {our_conc.upper()}")
    elif our_conc and their_conc:
        matched.append(our_conc.upper())
    for phrase, needed in FLANKER_PHRASES.items():
        if phrase in theirs and needed not in ours:
            reasons.append(f"different version (“{phrase}”)")
    our_eau, their_eau = set(EAU_LINE_RE.findall(ours)), set(EAU_LINE_RE.findall(theirs))
    for x in sorted(their_eau - our_eau):
        reasons.append(f"different version (“eau {x}”)")
    for x in sorted(our_eau - their_eau):
        reasons.append(f"version “eau {x}” missing")

    our_set = set(words(ours))
    for w in sorted((their_words & FLANKERS) - our_set):
        reasons.append(f"different version (“{w}”)")
    for w in sorted(their_words - FLANKERS):
        hidden = [f for f in FLANKERS if len(f) >= 4 and f in w and f not in ours]
        if hidden:  # Extraintense, Midnight
            reasons.append(f"different version (“{w}”)")
    for w in sorted((our_set & FLANKERS) - their_words):
        reasons.append(f"version word “{w}” missing")

    our_g, their_g = gender(our_set), gender(their_words)
    if our_g and their_g and not (our_g & their_g):
        reasons.append("for women, ours is for men" if "f" in their_g else "for men, ours is for women")
    elif our_g and their_g:
        matched.append("men's/women's")

    our_colours, their_colours = our_set & COLOURS, their_words & COLOURS
    if our_colours - their_colours:
        reasons.append("colour " + ", ".join(sorted(our_colours - their_colours)) + " missing")
    elif our_colours:
        matched.append("colour")
    if their_colours - our_colours and our_colours:
        reasons.append("extra colour " + ", ".join(sorted(their_colours - our_colours)))

    for w, label in DIFFERENT_ITEM.items():
        if w in their_words and w not in our_set:
            if w == "pack" and not (their_packs - our_packs):
                continue
            reasons.append(f"listing is a {label}")
            break
    for w in sorted((their_words & VARIANT_WORDS) - our_set):
        reasons.append(f"different version (“{w}”)")
    if not our_sizes and (any(v <= 7.5 for v in their_sizes.get("ml", [])) or any(v <= 0.25 for v in their_sizes.get("oz", []))):
        reasons.append("listing is a sample or travel size")

    # The name match uses the identifying start of our name, without the brand and EDP/EDT wording (checked above).
    brand_words = set(words(brand))
    name_words = [w for w in significant(core(ours)) if w not in CONCENTRATION_WORDS and w not in brand_words][:8]
    if name_words:
        present = sum(1 for w in name_words if w in their_words or w.rstrip("s") in their_words or (w + "s") in their_words)
        coverage = round(present / len(name_words), 3)
    else:
        coverage = 0.0
        reasons.append("our product name is only the brand, so the exact product cannot be confirmed")
    if name_words and coverage < 0.6:
        reasons.append(f"only {coverage:.0%} of the product name matches")

    if reasons:
        return {"ok": False, "confidence": None, "coverage": coverage, "reasons": list(dict.fromkeys(reasons)), "matched": matched}
    unconfirmed = list(soft)
    if not our_sizes:
        unconfirmed.append("our product name gives no size")
    if our_conc and not their_conc:
        unconfirmed.append("listing does not state EDP/EDT")
    if their_conc and not our_conc:
        unconfirmed.append(f"listing says {their_conc.upper()}, our product name does not say which strength")
    their_concs = concentrations(theirs)
    if len(their_concs) > 1 and their_concs - concentrations(ours):
        unconfirmed.append(f"listing names more than one strength ({', '.join(sorted(c.upper() for c in their_concs))})")
    if not our_colours and their_colours and (their_sizes.get("oz") or "tumbler" in theirs or "bottle" in theirs or "cup" in theirs):
        unconfirmed.append("colour not stated by us")
    if any(t in theirs and t not in ours for t in TOOL_ONLY):
        unconfirmed.append("listing may be the tool only, without battery or charger")
    extra = _extra_words(ours, our_set, theirs, brand, aliases)
    if extra:
        unconfirmed.append(f"listing title also says “{' '.join(extra[:4])}”: check it is the same version")
    if is_group:
        unconfirmed.append("listing with several options: check the photo shows this one")
    if coverage < 1:
        missing = [w for w in name_words if not (w in their_words or w.rstrip("s") in their_words or (w + "s") in their_words)]
        unconfirmed.append(f"listing title lacks “{' '.join(missing[:4])}” from our name: check it is not another version")
    # High confidence needs every identifying word of our name, a confirmed size or model number, and nothing unexplained.
    high = not unconfirmed and (bool(our_sizes) or bool(models))
    return {"ok": True, "confidence": "high" if high else "medium", "coverage": coverage, "reasons": unconfirmed, "matched": matched}


def _extra_words(ours: str, our_set: set[str], theirs: str, brand: str, aliases: tuple[str, ...]) -> list[str]:
    """Words in the listing title that our name does not explain (a product line such as "Goddess" or "Talisman")."""
    known = our_set | set(words(brand)) | {w for a in aliases for w in words(a)}
    out = []
    for w in significant(theirs):
        if re.search(r"\d", w) or w in CONCENTRATION_WORDS:
            continue  # sizes, model and batch codes, EANs; EDP/EDT is compared separately
        stem = w.rstrip("s")
        if w in known or stem in known or w + "s" in known or w in FILLER or stem in FILLER or (len(w) >= 4 and w in ours):
            continue
        if w not in out:
            out.append(w)
    return out


def query_for(product_name: str, n_words: int = 4, with_size: bool = False) -> str:
    """An eBay search phrase from the identifying start of the name: brand (in its short form) and key words plus model
    numbers, optionally the size. eBay only returns listings containing every word, so noise is left out."""
    flat = core(product_name).replace(" & ", " ").replace("co.", "co")
    for brand, short in QUERY_BRAND.items():
        flat = re.sub(rf"\b{brand}\b", short, flat)
    keep = [w for w in significant(flat) if w not in CONCENTRATION_WORDS][:n_words]
    size_part = ""
    if with_size:
        s = sizes(product_name)
        for unit in ("ml", "g", "oz"):
            if s.get(unit):
                size_part = f"{s[unit][0]:g}{unit}"
                break
        else:
            if s.get("count"):
                size_part = f"{s['count'][0]:g}"
    models = [w for w in model_tokens(product_name) if w not in keep]
    q = " ".join(keep + models[:2] + ([size_part] if size_part else []))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 .']", " ", q)).strip()[:120]


def fallback_query(product_name: str, had_results: bool) -> str | None:
    """A second search when the first gave no acceptable listing: fewer words if eBay found nothing at all, or the
    same words plus the size if it found only other products."""
    first = query_for(product_name)
    second = query_for(product_name, 4, with_size=True) if had_results else query_for(product_name, 2)
    return second if second and second != first else None
