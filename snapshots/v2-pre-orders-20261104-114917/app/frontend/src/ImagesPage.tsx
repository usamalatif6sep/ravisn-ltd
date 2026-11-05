import { useCallback, useEffect, useRef, useState } from "react";
import { api, qs } from "./api";
import { num, plural, when } from "./format";
import * as I from "./icons";
import { useApp } from "./store";
import { Button, cx, Dialog, Empty, Field, Segmented, Spinner, useToast } from "./ui";

type PhotoStatus = "has_photo" | "candidate" | "not_looked_up" | "manual_needed";
interface Row {
  total: number;
  publishable: number;
  has_photo: number;
  candidate: number;
  not_looked_up: number;
  manual_needed: number;
  publishable_with_photo: number;
}
interface Job {
  running: boolean;
  processed: number;
  total: number;
  found: number;
  verified: number;
  message: string;
  finished_at: string | null;
}
interface Coverage {
  countries: Record<string, Row>;
  totals: Row;
  manual_reasons: Record<string, number>;
  listings_to_look_up: number;
  days_needed: number;
  ebay_configured: boolean;
  ebay_calls_today: number;
  daily_cap: number;
  short_links: number;
  job: Job;
  short_job: { running: boolean; processed: number; total: number; expanded: number; message: string; finished_at: string | null };
  short_links_result: { expanded: number; refused: number; total: number; message: string } | null;
  search_pending: number;
  search_job: SearchJob;
  ebay_quota: Quota | null;
}
interface Quota {
  limit: number;
  remaining: number;
  reset: string;
  checked_at: string;
}
interface SearchJob {
  running: boolean;
  processed: number;
  total: number;
  searches: number;
  searches_total: number;
  api_calls: number;
  high: number;
  medium: number;
  no_match: number;
  no_results: number;
  errors: number;
  message: string;
  finished_at: string | null;
}
interface SearchReport {
  searched: number;
  outcomes: Record<string, number>;
  by_country: Record<string, Record<string, number>>;
  by_original: Record<string, number>;
  decisions: Record<string, number>;
  top_rejections: Record<string, number>;
  pending_products: number;
  pending_searches: number;
  pending_calls_estimate: number;
  quota: Quota | null;
}
type Confidence = "" | "high" | "medium" | "original";
interface ImageRow {
  id: number;
  item_id: number;
  code: string;
  name: string;
  variant: string | null;
  country: string;
  src: string;
  score: number | null;
  seen_title: string | null;
  note: string | null;
  confidence: "high" | "medium" | null;
  replacement: boolean;
  listing_url: string | null;
}

const OUTCOMES: { key: string; label: string }[] = [
  { key: "candidate_high", label: "High-confidence match" },
  { key: "candidate_medium", label: "Medium-confidence match" },
  { key: "no_match", label: "No exact match" },
  { key: "no_results", label: "No listings found" },
  { key: "error", label: "Failed, will retry" },
];
interface Needed {
  id: number;
  code: string;
  country: string;
  name: string;
  variant: string | null;
  photo: PhotoStatus;
  status_label: string;
  reason: string;
  link: string | null;
  publishable: boolean;
}
interface ImportResult {
  added: { file: string; code: string }[];
  to_review: { file: string; code: string }[];
  unmatched: string[];
  errors: { file: string; code?: string; message: string }[];
  message?: string;
}

const STATUS: { key: PhotoStatus; label: string; hint: string }[] = [
  { key: "has_photo", label: "Has photo", hint: "Shown on the website" },
  { key: "candidate", label: "Candidate found", hint: "Needs your quick check" },
  { key: "not_looked_up", label: "Not looked up yet", hint: "eBay lookup or replacement search pending" },
  { key: "manual_needed", label: "Manual upload needed", hint: "Amazon, other sites, short or ended links" },
];

export default function ImagesPage() {
  const app = useApp();
  const toast = useToast();
  const [cov, setCov] = useState<Coverage | null>(null);
  const [guide, setGuide] = useState(false);
  const [needFilter, setNeedFilter] = useState<{ status: PhotoStatus | ""; country: string; q: string }>({ status: "manual_needed", country: "", q: "" });

  const load = useCallback(async () => setCov(await api<Coverage>("/api/images/coverage")), []);
  useEffect(() => {
    load().catch((e) => toast({ text: e.message, tone: "error" }));
  }, [load, toast]);
  useEffect(() => {
    if (!cov?.job.running && !cov?.short_job.running && !cov?.search_job.running) return;
    const t = setInterval(() => load().catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [cov?.job.running, cov?.short_job.running, cov?.search_job.running, load]);

  const call = async (path: string, ok?: string) => {
    try {
      await api(path, { method: "POST", body: {} });
      if (ok) toast({ text: ok });
      setTimeout(load, 400);
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };

  if (!cov) return <div className="page center-fill"><Spinner /></div>;
  const t = cov.totals;
  const pct = t.total ? Math.round((t.has_photo / t.total) * 100) : 0;
  return (
    <div className="page scroll-page">
      <div className="narrow wide-narrow">
        <header className="page-head">
          <h1>Product photos</h1>
          <p className="subtitle measure">
            {num(t.has_photo)} of {num(t.total)} products ({pct}%) have a photo on the reseller website. Only photos marked verified or approved are ever published. Products without one show “Photo coming soon”.
          </p>
        </header>

        <div className="stat-row">
          {STATUS.map((s) => (
            <button key={s.key} className={cx("stat", `stat-${s.key}`, needFilter.status === s.key && "on")} onClick={() => setNeedFilter((f) => ({ ...f, status: s.key }))}>
              <span className="stat-num num">{num(t[s.key])}</span>
              <span className="stat-label">{s.label}</span>
              <span className="stat-hint">{s.hint}</span>
            </button>
          ))}
        </div>

        <section className="group">
          <table className="data-table">
            <thead>
              <tr>
                <th>Country</th>
                <th className="right">Products</th>
                {STATUS.map((s) => (
                  <th key={s.key} className="right">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(cov.countries).map(([k, c]) => (
                <tr key={k}>
                  <td>{app.country(k)?.name ?? k}</td>
                  <td className="right num">{num(c.total)}</td>
                  {STATUS.map((s) => (
                    <td key={s.key} className="right num">
                      {num(c[s.key])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="total-row">
                <td>All countries</td>
                <td className="right num">{num(t.total)}</td>
                {STATUS.map((s) => (
                  <td key={s.key} className="right num">
                    {num(t[s.key])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>

        <section className="group step-group">
          <div className="group-head">
            <h2>
              <span className="step-n">1</span> Automatic photos from eBay
            </h2>
            <div className="row-gap">
              <Button size="sm" variant={cov.ebay_configured ? "plain" : "primary"} onClick={() => setGuide(true)}>
                {cov.ebay_configured ? "eBay connected · change keys" : "Connect eBay (step by step)"}
              </Button>
              {cov.job.running ? (
                <Button size="sm" onClick={() => call("/api/images/stop", "Stopping after the current listing")}>
                  Stop
                </Button>
              ) : (
                <Button size="sm" variant={cov.ebay_configured ? "primary" : "secondary"} onClick={() => call("/api/images/run")}>
                  Look up photos
                </Button>
              )}
            </div>
          </div>
          <p className="group-note">
            Uses eBay's official API with your own free developer keys. {num(t.not_looked_up - cov.search_pending)} products are waiting, from {num(cov.listings_to_look_up)} different eBay listings
            {cov.listings_to_look_up ? `: about ${plural(cov.days_needed, "day")} at eBay's free limit (${num(cov.daily_cap)} lookups a day, ${num(cov.ebay_calls_today)} used today). Stop and continue at any time.` : "."} A photo is verified automatically only when the listing title matches the product and no other code shares the listing; the rest come to step 3.
            {!cov.ebay_configured && " Without eBay keys, Look up photos still handles reference links that are already eBay photos."}
          </p>
          {(cov.job.running || cov.job.finished_at) && (
            <div className="job-line">
              {cov.job.running && <Spinner />}
              <span>
                {num(cov.job.processed)} of {num(cov.job.total)} listings checked · {num(cov.job.found)} photos found · {num(cov.job.verified)} verified automatically
                {cov.job.message && ` · ${cov.job.message}`}
                {!cov.job.running && cov.job.finished_at && ` · ${when(cov.job.finished_at)}`}
              </span>
            </div>
          )}
          {cov.short_links > 0 && !cov.short_job.running && cov.short_links_result && cov.short_links_result.expanded === 0 && cov.short_links_result.refused > 0 ? (
            <p className="group-note">{cov.short_links_result.message}</p>
          ) : cov.short_links > 0 && (
            <div className="sub-action">
              <span>
                {plural(cov.short_links, "product uses", "products use")} a short ebay.us link. Ravisn can expand them to the full listing link (one request each, allowed by eBay's robots.txt), so photos can be looked up.
              </span>
              <Button size="sm" disabled={cov.short_job.running} onClick={() => call("/api/images/expand-short-links", "Expanding short links")}>
                {cov.short_job.running ? `Expanding ${cov.short_job.processed}/${cov.short_job.total}` : "Expand short links"}
              </Button>
            </div>
          )}
          {!cov.short_job.running && cov.short_job.message && !(cov.short_links_result && cov.short_links_result.expanded === 0) && <p className="group-note">{cov.short_job.message}</p>}
        </section>

        <SearchSection cov={cov} call={call} />

        <ReviewSection onChanged={load} />

        <UploadSection onChanged={load} />

        <NeededSection filter={needFilter} setFilter={setNeedFilter} reasons={cov.manual_reasons} />
      </div>
      {guide && <EbayGuide configured={cov.ebay_configured} onClose={() => setGuide(false)} onSaved={() => (setGuide(false), load())} />}
    </div>
  );
}

function SearchSection({ cov, call }: { cov: Coverage; call: (path: string, ok?: string) => Promise<void> }) {
  const app = useApp();
  const [report, setReport] = useState<SearchReport | null>(null);
  const [open, setOpen] = useState(false);
  const job = cov.search_job;
  useEffect(() => {
    if (job.running) return;
    api<SearchReport>("/api/images/search/report").then(setReport).catch(() => {});
  }, [job.running, job.finished_at]);
  const quota = cov.ebay_quota;
  const o = report?.outcomes ?? {};
  const d = report?.decisions ?? {};

  return (
    <section className="group step-group">
      <div className="group-head">
        <h2>
          <span className="step-n">2</span> Replacement photos for ended eBay listings
        </h2>
        <div className="row-gap">
          {job.running ? (
            <Button size="sm" onClick={() => call("/api/images/search/stop", "Stopping after the current product")}>
              Stop
            </Button>
          ) : (
            <Button size="sm" variant={cov.ebay_configured && cov.search_pending ? "primary" : "secondary"} disabled={!cov.ebay_configured || !cov.search_pending} onClick={() => call("/api/images/search/run")}>
              Find replacement photos
            </Button>
          )}
        </div>
      </div>
      <p className="group-note">
        {num(cov.search_pending)} products are waiting: their eBay listing has ended, so eBay answers “item not found”. Ravisn searches eBay's official API for another live, new listing of the same product in the same country. A listing is offered only when brand, model, size, count, colour and version all agree; testers, samples, sets, other sizes and other versions are rejected. Nothing is approved automatically: matches come to step 3 for your check.
        {report && report.pending_searches > 0 && ` About ${num(report.pending_searches)} searches left (similar products are searched once).`}
        {` ${num(cov.ebay_calls_today)} of ${num(cov.daily_cap)} eBay calls used today`}
        {quota ? `; eBay reports ${num(quota.remaining)} of ${num(quota.limit)} left.` : "."}
      </p>
      {(job.running || job.finished_at) && (
        <div className="job-line">
          {job.running && <Spinner />}
          <span>
            {num(job.processed)} of {num(job.total)} products searched · {num(job.high)} high and {num(job.medium)} medium-confidence matches · {num(job.no_match + job.no_results)} without a match · {plural(job.api_calls, "eBay call")}
            {job.message && ` · ${job.message}`}
            {!job.running && job.finished_at && ` · ${when(job.finished_at)}`}
          </span>
        </div>
      )}
      {report && report.searched > 0 && (
        <>
          <div className="outcome-row">
            {OUTCOMES.filter((x) => x.key !== "error" || o.error).map((x) => (
              <div key={x.key} className={cx("outcome", `oc-${x.key}`)}>
                <span className="num">{num(o[x.key] ?? 0)}</span>
                <span>{x.label}</span>
              </div>
            ))}
          </div>
          <p className="group-note">
            Of {num(report.searched)} products searched, your decisions so far: {num((d.approved ?? 0) + (d.verified ?? 0))} approved, {num(d.rejected ?? 0)} rejected, {num(d.needs_review ?? 0)} to check.{" "}
            <button className="link-btn" onClick={() => setOpen((v) => !v)}>
              {open ? "Hide report" : "Show report"}
            </button>
            {" · "}
            <a href="/api/admin/images/search/report.csv">Download report (CSV)</a>
          </p>
          {open && (
            <div className="search-report">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Country</th>
                    {OUTCOMES.map((x) => (
                      <th key={x.key} className="right">
                        {x.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.by_country).map(([k, c]) => (
                    <tr key={k}>
                      <td>{app.country(k)?.name ?? k}</td>
                      {OUTCOMES.map((x) => (
                        <td key={x.key} className="right num">
                          {num(c[x.key] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="report-cols">
                <div>
                  <h3>What eBay said about the original listing</h3>
                  <ul className="count-list">
                    {Object.entries(report.by_original).map(([k, n]) => (
                      <li key={k}>
                        <span>{k === "eBay error 11003" ? "eBay error 11003: item not found (ended or removed)" : k === "eBay error 11001" ? "eBay error 11001: item not found" : k === "eBay error 11002" ? "eBay error 11002: item group not found" : k}</span>
                        <span className="num">{num(n)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Why the closest listings were rejected</h3>
                  <ul className="count-list">
                    {Object.entries(report.top_rejections).map(([k, n]) => (
                      <li key={k}>
                        <span>{k}</span>
                        <span className="num">{num(n)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ReviewSection({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<"needs_review" | "verified" | "approved" | "rejected">("needs_review");
  const [conf, setConf] = useState<Confidence>("");
  const [list, setList] = useState<{ total: number; counts: Record<string, number>; images: ImageRow[] } | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const load = useCallback(
    () => api<{ total: number; counts: Record<string, number>; images: ImageRow[] }>(`/api/images?status=${tab}&limit=120${conf ? `&confidence=${conf}` : ""}`).then(setList),
    [tab, conf],
  );
  useEffect(() => {
    setSel(new Set());
    load().catch(() => {});
  }, [load]);

  const bulk = async (action: "approve" | "reject", ids: number[]) => {
    if (!ids.length) return;
    try {
      await api("/api/images/bulk", { body: { ids, action } });
      toast({ text: `${plural(ids.length, "photo")} ${action === "approve" ? "approved" : "rejected"}` });
      setSel(new Set());
      load();
      onChanged();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };
  const toggle = (id: number) => setSel((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  return (
    <section className="group step-group">
      <div className="group-head">
        <h2>
          <span className="step-n">3</span> Check photo candidates
        </h2>
        <Segmented
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: "needs_review", label: "To check" },
            { value: "verified", label: "Verified" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
          ]}
        />
      </div>
      <p className="group-note">
        Compare each photo with the product name. Correct ones go on the website; wrong ones are removed and the product moves to manual upload. Replacement photos come from another seller's eBay listing of the same product: open the listing if in doubt.
      </p>
      {list && Object.keys(list.counts ?? {}).length > 0 && (
        <div className="chips conf-chips">
          {(
            [
              ["", "All", Object.values(list.counts).reduce((a, b) => a + b, 0)],
              ["high", "High confidence", list.counts.high ?? 0],
              ["medium", "Medium confidence", list.counts.medium ?? 0],
              ["original", "From the original listing", list.counts.original ?? 0],
            ] as [Confidence, string, number][]
          )
            .filter(([k, , n]) => k === "" || n > 0)
            .map(([k, label, n]) => (
              <button key={k || "all"} className={cx("chip", conf === k && "on")} onClick={() => setConf(k)}>
                {label} · {num(n)}
              </button>
            ))}
        </div>
      )}
      {tab === "needs_review" && list && list.images.length > 0 && (
        <div className="bulk-line">
          {list.images.some((i) => i.confidence === "high") && (
            <Button size="sm" variant="plain" onClick={() => setSel(new Set(list.images.filter((i) => i.confidence === "high").map((i) => i.id)))}>
              Select high-confidence shown
            </Button>
          )}
          {list.images.some((i) => !i.replacement) && (
            <Button size="sm" variant="plain" onClick={() => setSel(new Set(list.images.filter((i) => !i.replacement && (i.score ?? 0) >= 0.8).map((i) => i.id)))}>
              Select all with 80%+ match
            </Button>
          )}
          <Button size="sm" variant="plain" onClick={() => setSel(new Set(list.images.map((i) => i.id)))}>
            Select all shown
          </Button>
          <span className="spacer" />
          <span className="muted">{sel.size} selected</span>
          <Button size="sm" variant="primary" disabled={!sel.size} onClick={() => bulk("approve", [...sel])}>
            Approve selected
          </Button>
          <Button size="sm" disabled={!sel.size} onClick={() => bulk("reject", [...sel])}>
            Reject selected
          </Button>
        </div>
      )}
      {!list ? (
        <Spinner />
      ) : list.images.length === 0 ? (
        <Empty title={tab === "needs_review" ? "Nothing to check" : "No photos here yet"} icon={<I.Photo size={22} />}>
          {tab === "needs_review" ? "Candidates from the eBay lookup and from shared SKUs appear here." : null}
        </Empty>
      ) : (
        <div className="photo-grid">
          {list.images.map((img) => (
            <div key={img.id} className={cx("photo-card", sel.has(img.id) && "selected")}>
              <button className="photo-frame" onClick={() => tab === "needs_review" && toggle(img.id)} aria-pressed={sel.has(img.id)} aria-label={`Select ${img.code}`}>
                <img src={img.src} alt="" loading="lazy" referrerPolicy="no-referrer" />
                {tab === "needs_review" && <span className="photo-check">{sel.has(img.id) && <I.Check size={13} />}</span>}
              </button>
              <div className="photo-body">
                <a className="mono muted" href={`#/c/${img.country}/${img.item_id}`}>
                  {img.code}
                </a>
                <div className="photo-name">
                  {img.name}
                  {img.variant && <span className="muted">, {img.variant}</span>}
                </div>
                {img.replacement && img.confidence && (
                  <span className={cx("conf-badge", `conf-${img.confidence}`)}>{img.confidence === "high" ? "High confidence" : "Medium confidence"} · other listing</span>
                )}
                {img.seen_title && (
                  <div className="photo-seen">
                    eBay title: {img.seen_title}
                    {img.score !== null && !img.replacement && <span className={cx("score", img.score >= 0.55 ? "score-ok" : "score-low")}> · {Math.round(img.score * 100)}% match</span>}
                  </div>
                )}
                {img.note && <div className="photo-seen">{img.replacement ? img.note.replace(/^Replacement from another eBay listing, \w+ confidence \(the original listing has ended\)\. /, "") : img.note}</div>}
                {img.listing_url && (
                  <a className="photo-seen" href={img.listing_url} target="_blank" rel="noreferrer noopener">
                    Open the eBay listing ↗
                  </a>
                )}
                <div className="photo-actions">
                  {tab !== "approved" && tab !== "verified" && (
                    <Button size="sm" variant="primary" onClick={() => bulk("approve", [img.id])}>
                      Correct
                    </Button>
                  )}
                  {tab !== "rejected" && (
                    <Button size="sm" variant="plain" onClick={() => bulk("reject", [img.id])}>
                      Wrong
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {list && list.total > list.images.length && <p className="group-note">Showing {num(list.images.length)} of {num(list.total)}. Approve or reject these to see more.</p>}
    </section>
  );
}

function UploadSection({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [ok, setOk] = useState(false);
  const [source, setSource] = useState("My own photos");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [drag, setDrag] = useState(false);

  const upload = async (files: FileList | File[]) => {
    if (!ok) {
      toast({ text: "Tick the permission box first", tone: "error" });
      return;
    }
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    form.append("rights", source);
    setBusy(true);
    try {
      setResult(await api<ImportResult>("/api/images/import", { form }));
      onChanged();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const fromInbox = async () => {
    if (!ok) {
      toast({ text: "Tick the permission box first", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      setResult(await api<ImportResult>("/api/images/import-inbox", { body: { rights: source } }));
      onChanged();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="group step-group">
      <div className="group-head">
        <h2>
          <span className="step-n">4</span> Upload photos for the rest
        </h2>
      </div>
      <p className="group-note">
        Name each photo after its product code, for example <span className="mono">UK-0012.jpg</span>, and <span className="mono">UK-0012-2.jpg</span> for a second photo. A supplier SKU or eBay item number as the file name also works. Upload many at once, or a ZIP. Photos are resized and their camera and location details removed.
      </p>
      <div className="upload-rights">
        <Field label="Where these photos come from">
          <input className="input" value={source} onChange={(e) => setSource(e.target.value)} />
        </Field>
        <label className="check-line">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          <span>I own these photos or have permission to use them on the reseller website, and each shows the product it is named after.</span>
        </label>
      </div>
      <div
        className={cx("dropzone", drag && "drag", !ok && "locked")}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
      >
        <I.Photo size={22} />
        <div>{busy ? "Uploading…" : "Drop photos or a ZIP here"}</div>
        <div className="row-gap">
          <Button size="sm" variant="primary" disabled={busy} onClick={() => input.current?.click()}>
            Choose photos
          </Button>
          <Button size="sm" disabled={busy} onClick={fromInbox}>
            Import from inbox folder
          </Button>
          <Button size="sm" variant="plain" icon={<I.Folder size={13} />} onClick={() => api("/api/system/open", { body: { target: "inbox" } })}>
            Open inbox folder
          </Button>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,.zip"
          hidden
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (files.length) upload(files);
          }}
        />
      </div>
      {result && (
        <div className="import-result">
          <strong>
            {result.message ?? `${plural(result.added.length, "photo")} added${result.to_review.length ? `, ${result.to_review.length} sent to step 3 for a check` : ""}.`}
          </strong>
          {result.unmatched.length > 0 && (
            <div>
              No product matches {plural(result.unmatched.length, "file")}: <span className="mono">{result.unmatched.slice(0, 12).join(", ")}</span>
              {result.unmatched.length > 12 && " and more"}. Rename them to the product code and try again.
            </div>
          )}
          {result.errors.length > 0 && (
            <div>
              {plural(result.errors.length, "file")} skipped:{" "}
              {result.errors.slice(0, 6).map((e) => `${e.file}${e.code ? ` (${e.code})` : ""}: ${e.message}`).join("; ")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function NeededSection({ filter, setFilter, reasons }: { filter: { status: PhotoStatus | ""; country: string; q: string }; setFilter: (f: any) => void; reasons: Record<string, number> }) {
  const app = useApp();
  const [data, setData] = useState<{ total: number; products: Needed[] } | null>(null);
  const [limit, setLimit] = useState(100);
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ total: number; products: Needed[] }>("/api/images/needed" + qs({ status: filter.status, country: filter.country, q: filter.q, limit }))
        .then(setData)
        .catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, [filter, limit]);

  return (
    <section className="group" id="needed">
      <div className="group-head">
        <h2>Products and their photo status</h2>
        <a className="btn btn-secondary btn-sm" href={"/api/admin/images/needed.csv" + qs({ status: filter.status, country: filter.country })}>
          <I.Download size={13} />
          <span>Download list (CSV)</span>
        </a>
      </div>
      {filter.status === "manual_needed" && Object.keys(reasons).length > 0 && (
        <p className="group-note">
          Why they need a manual photo: {Object.entries(reasons).map(([r, n]) => `${r} ${num(n)}`).join(" · ")}
        </p>
      )}
      <div className="needed-filters">
        <select className="input input-sm" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} aria-label="Photo status">
          <option value="">All without a photo</option>
          {STATUS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select className="input input-sm" value={filter.country} onChange={(e) => setFilter({ ...filter, country: e.target.value })} aria-label="Country">
          <option value="">All countries</option>
          {app.meta!.countries.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
        <input className="input input-sm" placeholder="Code or name" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} aria-label="Search" />
        <span className="muted">{data ? plural(data.total, "product") : ""}</span>
      </div>
      {!data ? (
        <Spinner />
      ) : (
        <div className="rows">
          {data.products.map((p) => (
            <a key={p.id} className="row row-compact needed-row" href={`#/c/${p.country}/${p.id}`}>
              <span className="mono needed-code">{p.code}</span>
              <div className="row-main">
                <div className="row-title needed-name">
                  {p.name}
                  {p.variant && <span className="muted">, {p.variant}</span>}
                  {!p.publishable && <span className="tag">Held back</span>}
                </div>
                <div className="row-sub">{p.reason}</div>
              </div>
              <span className={cx("photo-pill", `pp-${p.photo}`)}>{p.status_label}</span>
            </a>
          ))}
          {data.products.length === 0 && <div className="row muted">No products here.</div>}
        </div>
      )}
      {data && data.total > data.products.length && (
        <div className="more-row">
          <Button size="sm" variant="plain" onClick={() => setLimit((l) => l + 200)}>
            Show more ({num(data.total - data.products.length)} remaining)
          </Button>
        </div>
      )}
    </section>
  );
}

function EbayGuide({ configured, onClose, onSaved }: { configured: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (remove = false) => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/images/settings", { method: "PUT", body: remove ? { remove: true } : { client_id: id, client_secret: secret } });
      toast({ text: remove ? "eBay disconnected" : "eBay connected. Click Look up photos." });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Connect eBay for automatic photos"
      onClose={onClose}
      width={640}
      footer={
        <>
          {configured && (
            <Button variant="plain" onClick={() => save(true)} disabled={busy}>
              Disconnect
            </Button>
          )}
          <div className="spacer" />
          <Button variant="plain" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" disabled={busy || !id || !secret} onClick={() => save()}>
            {busy ? "Checking with eBay…" : "Check and save"}
          </Button>
        </>
      }
    >
      <ol className="guide">
        <li>
          Go to <span className="mono">developer.ebay.com</span> and click <b>Register</b>. This is a free eBay Developers Program account, separate from your shopping account. You can use the same email. Nobody needs your normal eBay password.
        </li>
        <li>Confirm the email eBay sends you, then sign in to developer.ebay.com.</li>
        <li>
          Open your name (top right) › <b>Application Keysets</b>. Type an application name such as <span className="mono">RavisnPhotos</span>, then under <b>Production</b> click <b>Create a keyset</b>.
        </li>
        <li>
          If eBay asks about <b>Marketplace Account Deletion</b> notifications, choose to be <b>exempt</b> and pick the reason that you do not store eBay user data. That is true: Ravisn keeps only product titles and photo links, never buyer or seller details.
        </li>
        <li>
          In the <b>Production</b> column, copy the <b>App ID (Client ID)</b> and the <b>Cert ID (Client Secret)</b>, and paste them below. Ignore the Dev ID and anything marked Sandbox.
        </li>
      </ol>
      <Field label="App ID (Client ID)" error={error}>
        <input className="input mono" value={id} onChange={(e) => setId(e.target.value)} autoComplete="off" spellCheck={false} placeholder="YourName-RavisnPh-PRD-…" />
      </Field>
      <Field label="Cert ID (Client Secret)">
        <input className="input mono" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" placeholder="PRD-…" />
      </Field>
      <p className="dialog-note">Ravisn checks the keys with eBay before saving them, then stores them encrypted for your Windows account only. They are never shown again, never put in backups or exports, and never published.</p>
    </Dialog>
  );
}
