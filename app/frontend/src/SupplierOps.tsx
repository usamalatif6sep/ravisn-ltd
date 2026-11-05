import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { day, money, num, when } from "./format";
import * as I from "./icons";
import { useApp } from "./store";
import { Button, cx, Dialog, Field, Spinner, useToast } from "./ui";

/* ------------------------------------------------------------------ fulfilment facts */

interface Fulfilment {
  stock_update_frequency: string | null;
  last_stock_verified_at: string | null;
  countries_served: string | null;
  dispatch_cutoff: string | null;
  cutoff_timezone: string | null;
  shipping_methods: string | null;
  carriers: string | null;
  label_arrangements: string | null;
  tracking_arrangements: string | null;
  dispatch_estimate: string | null;
  notes: string | null;
  verified: boolean;
  verified_at: string | null;
  updated_at: string | null;
  public_fields: string[];
  customer_view: Record<string, string> | null;
}
const F_FIELDS: { key: keyof Fulfilment; label: string; hint?: string; area?: boolean }[] = [
  { key: "stock_update_frequency", label: "Stock update frequency", hint: "e.g. Weekly on Mondays" },
  { key: "last_stock_verified_at", label: "Stock last verified", hint: "YYYY-MM-DD" },
  { key: "countries_served", label: "Countries served" },
  { key: "dispatch_cutoff", label: "Dispatch cut-off", hint: "e.g. 2:00 PM" },
  { key: "cutoff_timezone", label: "Cut-off timezone", hint: "e.g. UK time" },
  { key: "dispatch_estimate", label: "Dispatch estimate", hint: "e.g. 1 to 2 working days after confirmation" },
  { key: "shipping_methods", label: "Shipping methods", area: true },
  { key: "carriers", label: "Carriers" },
  { key: "label_arrangements", label: "Label arrangements", area: true, hint: "How resellers' labels are handled. No addresses." },
  { key: "tracking_arrangements", label: "Tracking arrangements", area: true },
  { key: "notes", label: "Private notes", area: true, hint: "Never published" },
];

export function FulfilmentPanel({ supplierId }: { supplierId: number }) {
  const toast = useToast();
  const [f, setF] = useState<Fulfilment | null>(null);
  const [draft, setDraft] = useState<Partial<Fulfilment>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Fulfilment>(`/api/suppliers/${supplierId}/fulfilment`).then(setF, (e) => setError(e.message));
  }, [supplierId]);
  if (!f) return <section className="ops-card">{error ? <div className="form-error">{error}</div> : <Spinner />}</section>;
  const v = (k: keyof Fulfilment) => ((k in draft ? (draft as any)[k] : f[k]) ?? "") as string;
  const dirty = Object.keys(draft).length > 0;
  const save = async (extra: Record<string, unknown> = {}) => {
    setError(null);
    try {
      const next = await api<Fulfilment>(`/api/suppliers/${supplierId}/fulfilment`, { method: "PUT", body: { ...draft, ...extra } });
      setF(next);
      setDraft({});
      toast({ text: extra.verified === true ? "Verified. These facts will appear on product pages at the next publish." : next.verified ? "Saved" : "Saved. Customer-facing facts are not shown until verified." });
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <section className="ops-card">
      <div className="ops-head">
        <div>
          <h3>Fulfilment information</h3>
          <div className="subtitle">
            {f.verified ? (
              <span className="ops-ok">
                <I.Check size={12} /> Customer-facing facts verified {day(f.verified_at)}
              </span>
            ) : (
              <span className="ops-warn">Awaiting verification. Nothing here is shown to customers.</span>
            )}
          </div>
        </div>
        {f.verified ? (
          <Button size="sm" variant="plain" onClick={() => save({ verified: false })}>
            Withdraw verification
          </Button>
        ) : (
          <Button size="sm" icon={<I.Check size={13} />} disabled={dirty} onClick={() => save({ verified: true })}>
            Mark verified
          </Button>
        )}
      </div>
      <p className="muted small">
        Fields marked <span className="ops-tag">Customer-facing</span> appear on this supplier's product pages only once verified, and never with the supplier's name, address or contact
        details. Editing one withdraws the verification.
      </p>
      <div className="form-grid">
        {F_FIELDS.map((x) => (
          <Field key={x.key} label={x.label} hint={<>{f.public_fields.includes(x.key) && <span className="ops-tag">Customer-facing</span>} {x.hint}</>}>
            {x.area ? (
              <textarea className="input" rows={2} value={v(x.key)} onChange={(e) => setDraft((d) => ({ ...d, [x.key]: e.target.value }))} />
            ) : (
              <input className="input" value={v(x.key)} onChange={(e) => setDraft((d) => ({ ...d, [x.key]: e.target.value }))} />
            )}
          </Field>
        ))}
      </div>
      {f.customer_view && (
        <div className="ops-preview">
          <div className="preview-label">Customers see</div>
          {Object.entries(f.customer_view).map(([k, val]) => (
            <div key={k}>
              <span className="muted">{k.replace(/_/g, " ")}:</span> {val}
            </div>
          ))}
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
      <div className="detail-foot">
        <Button variant="plain" disabled={!dirty} onClick={() => setDraft({})}>
          Revert
        </Button>
        <Button variant="primary" disabled={!dirty} onClick={() => save()}>
          Save fulfilment
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ stock updates */

interface URow {
  row: number;
  sku: string | null;
  ref: string | null;
  ravisn: string | null;
  name: string | null;
  variant: string | null;
  category: string | null;
  qty: number | null;
  cost_minor: number | null;
  state: "matched" | "unchanged" | "new" | "ambiguous" | "duplicate" | "invalid" | "other_supplier" | "archived";
  item_id: number | null;
  code: string | null;
  item_ref_code: string | null;
  current_name?: string;
  changes: Record<string, [any, any]>;
  price: { mode: string; old: number | null; rule: number; action: string } | null;
  notes: string[];
}
interface Update {
  id: number;
  supplier: { id: number; name: string };
  country: string;
  source: string;
  created_at: string;
  status: "preview" | "applied" | "discarded";
  applied_at: string | null;
  summary: Record<string, any>;
  result: { updated: number; repriced: number; created: { row: number; ref: string; code: string }[]; flagged: number; marked_out: number; skipped: { row: number | null; code: string; reason: string }[]; backup: string } | null;
  rows: URow[];
  removed: { item_id: number; code: string; ref: string | null; name: string; status: string; qty: number | null }[];
}
const STATE_LABEL: Record<URow["state"], string> = {
  matched: "Will update",
  unchanged: "No change",
  new: "New product",
  ambiguous: "Matches several",
  duplicate: "Repeated row",
  invalid: "No identifier",
  other_supplier: "Other supplier",
  archived: "Archived",
};

export function StockUpdates({ supplierId, supplierName }: { supplierId: number; supplierName: string }) {
  const app = useApp();
  const toast = useToast();
  const [list, setList] = useState<Update[] | null>(null);
  const [country, setCountry] = useState(app.meta!.countries[0]?.key ?? "UK");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Update | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const load = () => api<Update[]>(`/api/suppliers/${supplierId}/stock-updates`).then(setList, () => setList([]));
  useEffect(() => {
    load();
  }, [supplierId]);

  const upload = async (f: File) => {
    const form = new FormData();
    form.append("file", f);
    form.append("country", country);
    setBusy(true);
    try {
      setOpen(await api<Update>(`/api/suppliers/${supplierId}/stock-updates`, { form }));
      load();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };
  const fromSheet = async () => {
    setBusy(true);
    try {
      setOpen(await api<Update>(`/api/suppliers/${supplierId}/stock-updates`, { body: { url, country } }));
      setUrl("");
      load();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ops-card">
      <div className="ops-head">
        <div>
          <h3>Stock updates</h3>
          <div className="subtitle">Upload {supplierName}'s latest stock list. You see every change before anything is saved.</div>
        </div>
      </div>
      <div className="ops-upload">
        <label className="ops-field">
          <span>Catalogue</span>
          <select className="input input-sm" value={country} onChange={(e) => setCountry(e.target.value)}>
            {app.meta!.countries.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" icon={<I.Upload size={13} />} disabled={busy} onClick={() => file.current?.click()}>
          Excel or CSV file
        </Button>
        <input ref={file} type="file" hidden accept=".xlsx,.xlsm,.csv,.tsv,.txt" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <span className="muted small">or</span>
        <input className="input input-sm ops-url" placeholder="Google Sheets link shared with “Anyone with the link”" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button size="sm" disabled={busy || !url.trim()} onClick={fromSheet}>
          Read sheet
        </Button>
        {busy && <Spinner />}
      </div>
      <p className="muted small">
        Rows are matched by the supplier's SKU, item reference (such as ASIN) or Ravisn reference, never by name. Original workbooks are not touched. A backup is taken before
        changes are applied.
      </p>
      {list && list.length > 0 && (
        <table className="ops-table">
          <thead>
            <tr>
              <th>Received</th>
              <th>Catalogue</th>
              <th>Source</th>
              <th className="right">Updates</th>
              <th className="right">New</th>
              <th className="right">Missing</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="ops-click" onClick={() => api<Update>(`/api/stock-updates/${u.id}`).then(setOpen)}>
                <td>{when(u.created_at)}</td>
                <td>{u.country}</td>
                <td className="muted">{u.source}</td>
                <td className="right num">{num(u.summary.matched)}</td>
                <td className="right num">{num(u.summary.new)}</td>
                <td className="right num">{num(u.summary.removed)}</td>
                <td>
                  <span className={cx("om-pill", u.status === "applied" ? "om-good" : u.status === "preview" ? "om-warn" : "om-dim")}>{u.status === "preview" ? "Preview" : u.status === "applied" ? "Applied" : "Discarded"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && (
        <UpdateReview
          u={open}
          onClose={() => setOpen(null)}
          onDone={(u) => {
            setOpen(u);
            load();
            app.refreshMeta();
          }}
        />
      )}
    </section>
  );
}

function UpdateReview({ u, onClose, onDone }: { u: Update; onClose: () => void; onDone: (u: Update) => void }) {
  const toast = useToast();
  const app = useApp();
  const sym = app.meta!.countries.find((c) => c.key === u.country)?.symbol ?? "";
  const [tab, setTab] = useState<"changes" | "new" | "missing" | "other">("changes");
  const [create, setCreate] = useState<number[]>([]);
  const [category, setCategory] = useState("");
  const [reprice, setReprice] = useState(true);
  const [removed, setRemoved] = useState<"flag" | "out_of_stock">("flag");
  const [busy, setBusy] = useState(false);
  const preview = u.status === "preview";
  const changes = u.rows.filter((r) => r.state === "matched");
  const fresh = u.rows.filter((r) => r.state === "new");
  const other = u.rows.filter((r) => !["matched", "new"].includes(r.state));
  const m = (v: number | null | undefined) => (v === null || v === undefined ? "none" : money(v, sym));
  const fmt = (k: string, v: any) => (k === "cost_minor" ? m(v) : v === null ? "none" : String(v));

  const run = async (path: "apply" | "discard") => {
    setBusy(true);
    try {
      const next = await api<Update>(`/api/stock-updates/${u.id}/${path}`, { body: path === "apply" ? { create, category, reprice_imported: reprice, removed } : {} });
      toast({ text: path === "apply" ? `Applied: ${next.result?.updated ?? 0} updated, ${next.result?.created.length ?? 0} created, ${next.result?.flagged ?? 0} flagged` : "Preview discarded" });
      onDone(next);
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={`Stock update · ${u.supplier.name} · ${u.country}`}
      onClose={onClose}
      width={980}
      footer={
        preview ? (
          <>
            <Button variant="plain" disabled={busy} onClick={() => run("discard")}>
              Discard
            </Button>
            <div className="spacer" />
            <Button variant="plain" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" disabled={busy || (create.length > 0 && !category.trim() && fresh.some((r) => create.includes(r.row) && !r.category))} onClick={() => run("apply")}>
              Apply {num(changes.length)} updates{create.length ? `, create ${create.length}` : ""}
            </Button>
          </>
        ) : (
          <>
            <div className="spacer" />
            <Button variant="primary" onClick={onClose}>
              Close
            </Button>
          </>
        )
      }
    >
      <div className="ops-summary">
        <span>
          <strong>{num(u.summary.rows)}</strong> rows read from {u.source} (header on row {u.summary.header_row})
        </span>
        <span className="muted">Columns used: {Object.entries(u.summary.columns as Record<string, string>).map(([k, h]) => `${h} → ${k}`).join(", ")}</span>
      </div>
      {u.result && (
        <div className="ops-result">
          Applied {when(u.applied_at)}: {num(u.result.updated)} products updated ({num(u.result.repriced)} repriced by the pricing rule), {u.result.created.length} created
          {u.result.created.length > 0 && ` (${u.result.created.map((c) => c.ref).join(", ")})`}, {num(u.result.flagged)} flagged as missing
          {u.result.marked_out ? `, ${num(u.result.marked_out)} marked out of stock` : ""}. Backup {u.result.backup}.
          {u.result.skipped.length > 0 && (
            <ul>
              {u.result.skipped.map((s, i) => (
                <li key={i}>
                  {s.row ? `Row ${s.row}` : s.code}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="ops-tabs" role="tablist">
        {(
          [
            ["changes", `Updates (${changes.length})`],
            ["new", `New products (${fresh.length})`],
            ["missing", `Missing from list (${u.removed.length})`],
            ["other", `Not used (${other.length})`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={cx(tab === k && "on")} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="ops-scroll">
        {tab === "changes" && (
          <>
            {preview && u.summary.price_imported > 0 && (
              <label className="om-check">
                <input type="checkbox" checked={reprice} onChange={(e) => setReprice(e.target.checked)} />
                <span>Recalculate {num(u.summary.price_imported)} imported prices with the pricing rule when their cost changes. Prices you set by hand are always kept.</span>
              </label>
            )}
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Product</th>
                  <th>Changes</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((r) => (
                  <tr key={r.row}>
                    <td className="num">{r.row}</td>
                    <td>
                      <div className="mono">{r.item_ref_code ?? r.code}</div>
                      <div className="muted small">{r.current_name}</div>
                    </td>
                    <td>
                      {Object.entries(r.changes).map(([k, [a, b]]) => (
                        <div key={k}>
                          {k === "cost_minor" ? "Cost" : k === "qty" ? "Quantity" : "Status"}: <span className="muted">{fmt(k, a)}</span> → <strong>{fmt(k, b)}</strong>
                        </div>
                      ))}
                      {r.notes.map((n) => (
                        <div key={n} className="muted small">
                          {n}
                        </div>
                      ))}
                    </td>
                    <td>
                      {r.price ? (
                        r.price.action === "kept" ? (
                          <span className="ops-warn">Kept {m(r.price.old)} (set by hand)</span>
                        ) : r.price.action === "recalculate_if_chosen" && !reprice ? (
                          <span className="muted">Kept {m(r.price.old)}</span>
                        ) : (
                          <>
                            <span className="muted">{m(r.price.old)}</span> → <strong>{m(r.price.rule)}</strong>
                          </>
                        )
                      ) : (
                        <span className="muted">Unchanged</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {tab === "new" && (
          <>
            <p className="muted small">
              New products are created only if you tick them. Each gets a new permanent Ravisn reference; existing references never change. Check names for supplier details
              before publishing.
            </p>
            {preview && fresh.length > 0 && (
              <div className="ops-upload">
                <Button size="sm" variant="plain" onClick={() => setCreate(fresh.filter((r) => r.cost_minor !== null && r.name).map((r) => r.row))}>
                  Tick all with a name and cost
                </Button>
                <Button size="sm" variant="plain" onClick={() => setCreate([])}>
                  Untick all
                </Button>
                <input className="input input-sm" placeholder="Category for rows without one" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} />
              </div>
            )}
            <table className="ops-table">
              <thead>
                <tr>
                  <th />
                  <th>Row</th>
                  <th>Identifier</th>
                  <th>Name</th>
                  <th className="right">Qty</th>
                  <th className="right">Cost</th>
                  <th className="right">Rule price</th>
                </tr>
              </thead>
              <tbody>
                {fresh.map((r) => {
                  const ok = r.cost_minor !== null && !!r.name;
                  return (
                    <tr key={r.row} className={cx(!ok && "muted")}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={!preview || !ok}
                          checked={create.includes(r.row)}
                          onChange={(e) => setCreate((c) => (e.target.checked ? [...c, r.row] : c.filter((x) => x !== r.row)))}
                          aria-label={`Create row ${r.row}`}
                        />
                      </td>
                      <td className="num">{r.row}</td>
                      <td className="mono">{r.sku ?? r.ref}</td>
                      <td>
                        {r.name ?? <span className="muted">No name</span>}
                        {r.variant && <span className="muted">, {r.variant}</span>}
                        {r.notes.map((n) => (
                          <div key={n} className="muted small">
                            {n}
                          </div>
                        ))}
                      </td>
                      <td className="right num">{r.qty ?? ""}</td>
                      <td className="right num">{r.cost_minor !== null ? m(r.cost_minor) : ""}</td>
                      <td className="right num">{r.price ? m(r.price.rule) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
        {tab === "missing" && (
          <>
            <p className="muted small">These products of this supplier are not in the list. They are never deleted. Each is flagged in its history for you to check.</p>
            {preview && (
              <div className="ops-upload">
                <label className="om-check">
                  <input type="radio" checked={removed === "flag"} onChange={() => setRemoved("flag")} />
                  <span>Flag only</span>
                </label>
                <label className="om-check">
                  <input type="radio" checked={removed === "out_of_stock"} onChange={() => setRemoved("out_of_stock")} />
                  <span>Flag and mark out of stock</span>
                </label>
              </div>
            )}
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Product</th>
                  <th>Status</th>
                  <th className="right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {u.removed.map((r) => (
                  <tr key={r.item_id}>
                    <td className="mono">
                      <a href={`#/c/${u.country}/${r.item_id}`}>{r.ref ?? r.code}</a>
                    </td>
                    <td>{r.name}</td>
                    <td>{r.status}</td>
                    <td className="right num">{r.qty ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {tab === "other" && (
          <table className="ops-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>Identifier</th>
                <th>Result</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {other.map((r) => (
                <tr key={r.row}>
                  <td className="num">{r.row}</td>
                  <td className="mono">{r.item_ref_code ?? r.sku ?? r.ref ?? r.ravisn ?? ""}</td>
                  <td>{STATE_LABEL[r.state]}</td>
                  <td className="muted small">{r.notes.join(" ") || (r.state === "unchanged" ? "Same quantity and cost as now" : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  );
}
