"""Product link checks and cleaning for customer exports."""

import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Query parameters that only track who shared a link. Removed from customer exports.
TRACKING_PARAMS = {
    "mkcid", "mkevt", "mkrid", "campid", "toolid", "customid", "siteid", "_trkparms", "_trksid",
    "amdata", "ssspo", "sssrc", "ssuid", "widget_ver", "ul_noapp", "ul_ref", "srcrot", "rlsatarget",
    "tag", "ref", "ref_", "linkcode", "linkid", "creative", "creativeasin", "ascsubtag", "camp",
    "content-id", "pd_rd_w", "pd_rd_wg", "pd_rd_r", "pd_rd_i", "pf_rd_p", "pf_rd_r", "pf_rd_s",
    "pf_rd_t", "pf_rd_i", "pf_rd_m", "sp_csd", "spla", "dib", "dib_tag", "qid", "sr", "crid", "sprefix",
    "keywords", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid",
    "athcpid", "athprod", "athcgid", "athznid", "athieid", "athstid", "athguid", "athwpid", "athena",
    "irgwc", "sourceid", "veh", "wmlspartner", "affiliates_ad_id", "clickid",
}

# Parameters that can identify a seller account (Amazon m/me/smid, eBay _ssn and similar).
SELLER_PARAMS = {"smid", "m", "me", "seller", "sellerid", "seller_id", "_ssn", "ssn", "_sasl", "store", "storeid"}

SELLER_PATHS = re.compile(r"/(str|usr)(/|$)", re.I)
SHORT_HOSTS = {"ebay.io", "ebay.us", "amzn.to", "amzn.eu", "a.co", "bit.ly", "tinyurl.com", "goo.gl"}
PRIVATE_HOSTS = ("drive.google.com", "docs.google.com", "wa.me", "api.whatsapp.com", "chat.whatsapp.com", "whatsapp.com")

MARKET_HOSTS = {
    "UK": ("ebay.co.uk", "amazon.co.uk"),
    "USA": ("ebay.com", "amazon.com", "walmart.com"),
    "Canada": ("ebay.ca", "amazon.ca"),
    "Germany": ("ebay.de", "amazon.de"),
    "Australia": ("ebay.com.au", "amazon.com.au"),
}
ALL_MARKET_SUFFIXES = ("ebay.", "amazon.", "walmart.")


def host_of(url: str) -> str:
    try:
        h = urlsplit(url).hostname or ""
    except ValueError:
        return ""
    return h.lower().removeprefix("www.").removeprefix("m.")


def is_valid(url: str | None) -> bool:
    if not url:
        return False
    if re.search(r"\s", url):
        return False
    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    return parts.scheme in ("http", "https") and bool(parts.hostname) and "." in parts.hostname


def clean(url: str | None) -> str | None:
    """Remove tracking and seller-identifying query parameters. Everything else is kept."""
    if not url or not is_valid(url):
        return url
    parts = urlsplit(url)
    original = parse_qsl(parts.query, keep_blank_values=True)
    query = [(k, v) for k, v in original if k.lower() not in TRACKING_PARAMS and k.lower() not in SELLER_PARAMS]
    # Amazon puts "ref=..." in the path as well: /dp/B0XXXX/ref=sr_1_1
    path = re.sub(r"/ref=[^/]*$", "", parts.path) if "amazon." in (parts.hostname or "") else parts.path
    if len(query) == len(original) and path == parts.path:
        return url
    return urlunsplit((parts.scheme, parts.netloc, path, urlencode(query), parts.fragment))


def normalise(url: str | None) -> str:
    """Key for "same page" comparisons: no scheme, www, query or trailing slash."""
    if not url:
        return ""
    u = re.sub(r"[?#].*$", "", url.strip()).rstrip("/").lower()
    return re.sub(r"^https?://(www\.|m\.)?", "", u)


def findings(url: str | None, label: str | None, country: str) -> list[tuple[str, str]]:
    """Return (kind, detail) pairs describing problems with a customer link."""
    out: list[tuple[str, str]] = []
    if not url:
        out.append(("link_missing", "No listing link"))
        return out
    if not is_valid(url):
        out.append(("link_malformed", "The link is not a valid web address"))
        return out
    host = host_of(url)
    parts = urlsplit(url)
    params = {k.lower() for k, _ in parse_qsl(parts.query, keep_blank_values=True)}
    if any(host == h or host.endswith("." + h) for h in PRIVATE_HOSTS):
        out.append(("link_private_host", f"Link goes to {host}, which can show the owner's name or contact"))
    if params & SELLER_PARAMS or SELLER_PATHS.search(parts.path):
        out.append(("link_seller_param", "Link contains a seller or store identifier (removed on export; check the page still shows the product)"))
    if params & TRACKING_PARAMS:
        out.append(("link_tracking", "Link contains sharing or tracking text (removed on export)"))
    if host in SHORT_HOSTS:
        out.append(("link_short", f"Shortened link ({host}); its destination cannot be checked offline"))
    if host.endswith("google.com") and (parts.path.startswith("/url") or parts.path.startswith("/search")):
        out.append(("link_redirect", "Google redirect or search link instead of a product page"))
    if label:
        lab = label.lower()
        if ("ebay" in lab and "ebay" not in host and host not in SHORT_HOSTS) or ("amazon" in lab and "amazon" not in host and "amzn" not in host and host != "a.co"):
            out.append(("link_label_mismatch", f"Link text says “{label}” but the link goes to {host}"))
    if any(s in host for s in ALL_MARKET_SUFFIXES) and host not in SHORT_HOSTS:
        own = MARKET_HOSTS.get(country, ())
        if not any(host == h or host.endswith("." + h) for h in own):
            out.append(("link_other_country", f"Listing is on {host}, not this country's marketplace"))
    return out
