import { useCallback, useEffect, useRef, useState } from "react";
import { api, qs } from "../api";
import { minorToInput, money, parseMoney, qtyText, rulePrice, when } from "../format";
import * as I from "../icons";
import { useApp } from "../store";
import type { Country, ItemDetail, ItemIssue, ItemRow, QtyBasis, Tier } from "../types";
import { Button, cx, Dialog, Field, Segmented, SeverityIcon, Spinner, StatusDot, useToast } from "../ui";
import Photos from "./Photos";

const PRIVATE_KEYS = new Set(["supplier_id", "cost_minor", "cost_tiers", "item_ref", "supplier_sku", "source_tab", "source_row", "source_link", "note"]);
const LABELS: Record<string, string> = {
  name: "Name", variant: "Variant", category: "Category", status: "Status", qty: "Quantity", qty_basis: "Quantity basis", qty_confirmed_at: "Confirmed",
  price_minor: "Price", price_mode: "Price mode", price_note: "Price reason", price_tiers: "Price tiers", link: "Link", link_label: "Link text",
  more_link: "More link", more_link_label: "More link text", archived: "Archived", supplier_id: "Supplier", cost_minor: "Cost", cost_tiers: "Cost tiers",
  item_ref: "Item ID", supplier_sku: "Supplier SKU", source_tab: "Source tab", source_row: "Source row", source_link: "Supplier listing", note: "Note", code: "Code",
};
const MODE_LABEL = { rule: "Pricing rule", imported: "Imported price", override: "Override" } as const;

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function MoneyInput({ value, onChange, symbol, label, disabled }: { value: number | null; onChange: (v: number | null) => void; symbol: string; label: string; disabled?: boolean }) {
  const [text, setText] = useState(minorToInput(value));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(minorToInput(value));
  }, [value]);
  return (
    <div className={cx("money-input", bad && "invalid", disabled && "disabled")}>
      <span className="money-symbol">{symbol}</span>
      <input
        aria-label={label}
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          if (!bad) setText(minorToInput(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const p = parseMoney(e.target.value);
          if (p === undefined) setBad(true);
          else {
            setBad(false);
            onChange(p);
          }
        }}
      />
    </div>
  );
}

function IntInput({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [bad, setBad] = useState(false);
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  return (
    <input
      aria-label={label}
      className={cx("input", bad && "invalid")}
      inputMode="numeric"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/,/g, "").trim();
        setText(e.target.value);
        if (t === "") (setBad(false), onChange(null));
        else if (/^\d+$/.test(t)) (setBad(false), onChange(Number(t)));
        else setBad(true);
      }}
    />
  );
}

export default function Inspector({ itemId, country, onClose, onSaved }: { itemId: number; country: Country; onClose: () => void; onSaved: (row: Partial<ItemRow> & { id: number }) => void }) {
  const app = useApp();
  const toast = useToast();
  const [d, setD] = useState<ItemDetail | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const sym = country.symbol;

  const load = useCallback(async () => {
    try {
      setD(await api<ItemDetail>(`/api/items/${itemId}` + qs({ private: app.showPrivate })));
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  }, [itemId, app.showPrivate, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const base = (k: string) => (PRIVATE_KEYS.has(k) ? (d?.private as any)?.[k] : (d as any)?.[k]);
  const v = (k: string) => (k in draft ? draft[k] : base(k));
  const set = (k: string, val: unknown) =>
    setDraft((dr) => {
      const n = { ...dr };
      if (same(base(k), val)) delete n[k];
      else n[k] = val;
      return n;
    });
  const dirty = Object.keys(draft).length > 0;

  const save = useCallback(async () => {
    if (!d || !dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ audit_id: number | null; item: ItemDetail }>(`/api/items/${d.id}` + qs({ private: app.showPrivate }), { method: "PATCH", body: { patch: draft } });
      setD(res.item);
      setDraft({});
      onSaved({ id: res.item.id, name: res.item.name, variant: res.item.variant, status: res.item.status, qty: res.item.qty, qty_basis: res.item.qty_basis, price_minor: res.item.price_minor, price_tiers: res.item.price_tiers });
      if (res.audit_id) {
        const auditId = res.audit_id;
        toast({
          text: `Saved ${res.item.code}`,
          action: {
            label: "Undo",
            run: async () => {
              try {
                await api(`/api/audit/${auditId}/undo`, { method: "POST" });
                await load();
                onSaved({ id: res.item.id });
                toast({ text: "Change undone" });
              } catch (e: any) {
                toast({ text: e.message, tone: "error" });
              }
            },
          },
        });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }, [d, dirty, saving, draft, app.showPrivate, onSaved, toast, load]);

  const requestClose = useCallback(() => (dirty ? setConfirmDiscard(true) : onClose()), [dirty, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      } else if (e.key === "Escape" && !document.querySelector(".overlay")) {
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, requestClose]);

  if (!d) {
    return (
      <aside className="inspector">
        <div className="center-fill">
          <Spinner />
        </div>
      </aside>
    );
  }

  const p = d.private;
  const status = app.status(v("status"));
  const mode: ItemDetail["price_mode"] = v("price_mode");
  const cost: number | null = p ? v("cost_minor") : null;
  const costTiers: Tier[] = (p ? v("cost_tiers") : []) ?? [];
  const priceTiers: Tier[] = v("price_tiers") ?? [];
  const tiered = priceTiers.length > 0 || costTiers.length > 0;
  const rule = cost !== null && cost !== undefined ? rulePrice(cost, country.markup_bp, country.min_margin_minor) : null;
  const shownPrice: number | null = mode === "rule" && rule !== null && !tiered ? rule : v("price_minor");
  const shownTiers: Tier[] =
    mode === "rule" && costTiers.length ? costTiers.map((t) => ({ label: t.label, price_minor: rulePrice(t.cost_minor ?? 0, country.markup_bp, country.min_margin_minor) })) : priceTiers;
  const margin = shownPrice !== null && cost !== null && cost !== undefined ? shownPrice - cost : null;
  const product = v("variant") ? `${v("name")}, ${v("variant")}` : v("name");

  const setTier = (key: "cost_tiers" | "price_tiers", i: number, patch: Partial<Tier>) => {
    const list: Tier[] = [...(key === "cost_tiers" ? costTiers : priceTiers)];
    list[i] = { ...list[i], ...patch };
    set(key, list);
  };

  return (
    <aside className="inspector" aria-label={`Product ${d.code}`}>
      <div className="insp-head">
        <div>
          <div className="insp-code mono">
            {d.ref ?? d.code}
            <span className="muted"> · legacy {d.code}</span>
            {d.archived && <span className="tag">Archived</span>}
          </div>
          <h2 className="insp-title">{v("name")}</h2>
        </div>
        <button className="icon-btn" onClick={requestClose} aria-label="Close">
          <I.Close />
        </button>
      </div>

      <div className="insp-body">
        <section className="preview" aria-label="Customer view">
          <div className="preview-label">Customer sees</div>
          <div className="preview-row">
            <span className="mono preview-code">{d.ref ?? d.code}</span>
            <span className="preview-name">{product}</span>
          </div>
          <div className="preview-meta">
            <span className="num">{shownTiers.length ? shownTiers.map((t) => `${t.label} ${money(t.price_minor, sym)}`).join("  ·  ") : money(shownPrice, sym)}</span>
            <span className="cell-status">
              <StatusDot availability={status?.availability} />
              {v("status")}
            </span>
            <span className="num">{qtyText(v("qty"), v("qty_basis"))}</span>
            {d.export_link && (
              <a href={d.export_link} target="_blank" rel="noreferrer noopener" className="preview-link">
                {v("link_label") || "View listing"}
              </a>
            )}
          </div>
        </section>

        {d.issues.length > 0 && <IssueList issues={d.issues} onChange={() => (load(), onSaved({ id: d.id }))} />}

        <section className="insp-section">
          <Field label="Product name">
            <textarea className="input" rows={2} value={v("name") ?? ""} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label="Variant or size" hint="Shown after the name, e.g. 100 ml">
              <input className="input" value={v("variant") ?? ""} onChange={(e) => set("variant", e.target.value || null)} />
            </Field>
            <Field label="Category">
              <input className="input" list="insp-categories" value={v("category") ?? ""} onChange={(e) => set("category", e.target.value)} />
              <datalist id="insp-categories">
                {country.categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>
        </section>

        <section className="insp-section">
          <h3>Stock</h3>
          <div className="grid-2">
            <Field label="Status">
              <div className="select-wrap">
                <StatusDot availability={status?.availability} />
                <select className="input" value={v("status")} onChange={(e) => set("status", e.target.value)}>
                  {app.meta!.statuses.map((s) => (
                    <option key={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="Quantity">
              <IntInput label="Quantity" value={v("qty")} onChange={(q) => set("qty", q)} />
            </Field>
          </div>
          <Field
            label="Quantity basis"
            hint={
              v("qty_basis") === "minimum"
                ? "Customers see this as a minimum, with +"
                : v("qty_basis") === "confirmed"
                  ? d.qty_confirmed_at && !("qty_basis" in draft) && !("qty" in draft)
                    ? `Confirmed ${when(d.qty_confirmed_at)}`
                    : "Confirmed when you save"
                  : "Latest figure, not confirmed"
            }
          >
            <Segmented<QtyBasis>
              value={v("qty_basis")}
              onChange={(b) => set("qty_basis", b)}
              options={[
                { value: "reported", label: "Reported" },
                { value: "minimum", label: "Minimum" },
                { value: "confirmed", label: "Confirmed" },
              ]}
            />
          </Field>
        </section>

        <section className="insp-section">
          <div className="section-head">
            <h3>Price</h3>
            <span className={cx("mode-badge", `mode-${mode}`)}>{MODE_LABEL[mode]}</span>
          </div>
          {!tiered && <div className="price-big num">{money(shownPrice, sym) || <span className="muted">No price</span>}</div>}
          {p && !tiered && cost !== null && cost !== undefined && (
            <div className="rule-line">
              Cost {money(cost, sym)} · rule gives {money(rule, sym)}
              {rule === cost + country.min_margin_minor && rule !== Math.floor((cost * (10000 + country.markup_bp) + 5000) / 10000) ? " (minimum margin)" : ` (+${country.markup_bp / 100}%)`}
              {margin !== null && <span className={cx("rule-margin", margin < country.min_margin_minor && "negative")}> · margin {money(margin, sym)}</span>}
            </div>
          )}
          {mode === "imported" && (
            <div className="callout">
              {cost === null || cost === undefined ? (
                <span>{p ? "No cost is recorded, so this imported price can't be checked against the rule." : "This price was imported. Show private data to compare it with the cost."}</span>
              ) : rule !== null && rule !== v("price_minor") && !tiered ? (
                <span>
                  The imported price {money(v("price_minor"), sym)} differs from the rule ({money(rule, sym)}). It is kept until you decide.
                </span>
              ) : (
                <span>Imported price.</span>
              )}
              <div className="callout-actions">
                {p && (cost !== null && cost !== undefined ? true : costTiers.length > 0) && (
                  <Button size="sm" onClick={() => set("price_mode", "rule")}>
                    Use pricing rule
                  </Button>
                )}
                <Button size="sm" variant="plain" onClick={() => (set("price_mode", "override"), set("price_minor", v("price_minor")))}>
                  Keep as override
                </Button>
              </div>
            </div>
          )}
          {mode === "rule" && (
            <div className="row-actions">
              <Button size="sm" variant="plain" onClick={() => (set("price_mode", "override"), !tiered && set("price_minor", shownPrice))}>
                Override price
              </Button>
            </div>
          )}
          {mode === "override" && (
            <>
              {!tiered && (
                <Field label="Price">
                  <MoneyInput symbol={sym} label="Price" value={v("price_minor")} onChange={(m) => set("price_minor", m)} />
                </Field>
              )}
              <Field label="Reason for the override" hint="Required. Recorded in the history.">
                <input className="input" value={v("price_note") ?? ""} onChange={(e) => set("price_note", e.target.value)} placeholder="e.g. agreed bulk rate" />
              </Field>
              {p && (cost !== null && cost !== undefined || costTiers.length > 0) && (
                <div className="row-actions">
                  <Button size="sm" variant="plain" onClick={() => set("price_mode", "rule")}>
                    Use pricing rule instead
                  </Button>
                </div>
              )}
            </>
          )}
          {tiered && (
            <div className="tiers">
              <div className={cx("tier-row tier-head", p && "with-cost")}>
                <span>Tier</span>
                {p && <span>Cost</span>}
                <span>Price</span>
                <span />
              </div>
              {(p && costTiers.length ? costTiers : shownTiers).map((t, i) => (
                <div key={i} className={cx("tier-row", p && "with-cost")}>
                  <input
                    className="input"
                    aria-label="Tier name"
                    value={t.label}
                    onChange={(e) => {
                      if (costTiers.length) setTier("cost_tiers", i, { label: e.target.value });
                      if (priceTiers.length) setTier("price_tiers", i, { label: e.target.value });
                    }}
                  />
                  {p && <MoneyInput symbol={sym} label={`${t.label} cost`} value={costTiers[i]?.cost_minor ?? null} onChange={(m) => setTier("cost_tiers", i, { cost_minor: m ?? 0 })} />}
                  {mode === "override" ? (
                    <MoneyInput symbol={sym} label={`${t.label} price`} value={priceTiers[i]?.price_minor ?? null} onChange={(m) => setTier("price_tiers", i, { price_minor: m ?? 0 })} />
                  ) : (
                    <span className="num tier-price">{money(shownTiers[i]?.price_minor ?? null, sym)}</span>
                  )}
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${t.label}`}
                    onClick={() => {
                      if (costTiers.length) set("cost_tiers", costTiers.filter((_, j) => j !== i));
                      if (priceTiers.length) set("price_tiers", priceTiers.filter((_, j) => j !== i));
                    }}
                  >
                    <I.Close size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="insp-section">
          <h3>Listing</h3>
          <Field label="Reference link" hint={d.export_link && d.export_link !== d.link && !("link" in draft) ? "Tracking and seller details are removed in customer exports" : undefined}>
            <div className="input-with-btn">
              <input className="input" value={v("link") ?? ""} onChange={(e) => set("link", e.target.value || null)} placeholder="https://" />
              {v("link") && (
                <a className="icon-btn" href={v("link")} target="_blank" rel="noreferrer noopener" aria-label="Open link">
                  <I.External size={14} />
                </a>
              )}
            </div>
          </Field>
          <Field label="Link text">
            <input className="input" list="link-labels" value={v("link_label") ?? ""} onChange={(e) => set("link_label", e.target.value || null)} />
            <datalist id="link-labels">
              <option value="View on eBay" />
              <option value="View on Amazon" />
              <option value="View listing" />
            </datalist>
          </Field>
          {(d.more_link || "more_link" in draft || country.key === "UK") && (
            <div className="grid-2">
              <Field label="More links">
                <input className="input" value={v("more_link") ?? ""} onChange={(e) => set("more_link", e.target.value || null)} placeholder="https://" />
              </Field>
              <Field label="Text">
                <input className="input" list="link-labels" value={v("more_link_label") ?? ""} onChange={(e) => set("more_link_label", e.target.value || null)} />
              </Field>
            </div>
          )}
        </section>

        <Photos itemId={d.id} />

        {p ? (
          <section className="insp-section private-section" aria-label="Private supplier details">
            <div className="section-head">
              <h3>
                <I.Lock size={13} /> Private
              </h3>
              <span className="private-note">Never exported to customers</span>
            </div>
            <Field label="Supplier">
              <select className="input" value={v("supplier_id") ?? ""} onChange={(e) => set("supplier_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">Not mapped</option>
                {app.meta!.suppliers?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            {p.supplier && !("supplier_id" in draft) && (
              <div className="contact-line">
                {p.supplier_phone ? <span className="mono">{p.supplier_phone}</span> : <span className="muted">No phone recorded</span>}
                {p.supplier_whatsapp && (
                  <a className="btn btn-plain btn-sm" href={p.supplier_whatsapp} target="_blank" rel="noreferrer noopener">
                    <I.Chat size={13} />
                    <span>WhatsApp</span>
                  </a>
                )}
                <a className="link-btn" href={`#/suppliers/${p.supplier_id}`}>
                  Supplier details
                </a>
              </div>
            )}
            {!tiered && (
              <Field label="Cost" hint={mode === "rule" && "cost_minor" in draft && rule !== null ? `New price ${money(rule, sym)}` : undefined}>
                <MoneyInput symbol={sym} label="Cost" value={v("cost_minor")} onChange={(m) => set("cost_minor", m)} />
              </Field>
            )}
            <div className="grid-2">
              <Field label="Item ID">
                <input className="input mono" value={v("item_ref") ?? ""} onChange={(e) => set("item_ref", e.target.value || null)} />
              </Field>
              <Field label="Supplier SKU">
                <input className="input mono" value={v("supplier_sku") ?? ""} onChange={(e) => set("supplier_sku", e.target.value || null)} />
              </Field>
              <Field label="Source tab">
                <input className="input" value={v("source_tab") ?? ""} onChange={(e) => set("source_tab", e.target.value || null)} />
              </Field>
              <Field label="Source row">
                <IntInput label="Source row" value={v("source_row")} onChange={(n) => set("source_row", n)} />
              </Field>
            </div>
            <Field label="Supplier listing">
              <div className="input-with-btn">
                <input className="input" value={v("source_link") ?? ""} onChange={(e) => set("source_link", e.target.value || null)} placeholder="https://" />
                {v("source_link") && (
                  <a className="icon-btn" href={v("source_link")} target="_blank" rel="noreferrer noopener" aria-label="Open supplier listing">
                    <I.External size={14} />
                  </a>
                )}
              </div>
            </Field>
            <Field label="Note">
              <textarea className="input" rows={2} value={v("note") ?? ""} onChange={(e) => set("note", e.target.value || null)} />
            </Field>
            {p.source_data && (
              <details className="disclosure">
                <summary>Supplier sheet row</summary>
                <dl className="kv">
                  {Object.entries(p.source_data).map(([k, val]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{String(val)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </section>
        ) : (
          <section className="insp-section private-hidden">
            <I.Lock size={13} /> Supplier, cost and contact details are hidden.
          </section>
        )}

        {d.history.length > 0 && (
          <details className="disclosure insp-section">
            <summary>History</summary>
            <ol className="history">
              {d.history.map((h) => (
                <li key={h.id}>
                  <div className="history-when">
                    {when(h.at)}
                    {h.note && <span className="muted"> · {h.note}</span>}
                  </div>
                  {Object.entries(h.changes).map(([k, [a, b]]) => (
                    <div key={k} className="history-change">
                      <span className="muted">{LABELS[k] ?? k}</span> {fmtVal(k, a, sym, app)} → {fmtVal(k, b, sym, app)}
                    </div>
                  ))}
                </li>
              ))}
            </ol>
          </details>
        )}
        {d.original && (
          <details className="disclosure insp-section">
            <summary>As imported</summary>
            <dl className="kv">
              {Object.entries({ ...d.original.public, ...(d.original.private ?? {}) }).map(([k, val]) => (
                <div key={k}>
                  <dt>{k.replace(/_/g, " ")}</dt>
                  <dd>{val === null || val === undefined ? "" : String(val)}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </div>

      <div className="insp-foot">
        {error && <div className="form-error">{error}</div>}
        <div className="insp-foot-row">
          <Button
            variant="plain"
            size="sm"
            icon={<I.Archive size={13} />}
            onClick={async () => {
              try {
                const res = await api<{ item: ItemDetail }>(`/api/items/${d.id}` + qs({ private: app.showPrivate }), { method: "PATCH", body: { patch: { archived: !d.archived }, note: d.archived ? "Restored" : "Archived" } });
                setD(res.item);
                onSaved({ id: d.id, archived: res.item.archived });
                toast({ text: res.item.archived ? `${d.code} archived. Its code stays reserved.` : `${d.code} restored` });
              } catch (e: any) {
                toast({ text: e.message, tone: "error" });
              }
            }}
          >
            {d.archived ? "Restore" : "Archive"}
          </Button>
          <div className="spacer" />
          <Button variant="plain" disabled={!dirty || saving} onClick={() => (setDraft({}), setError(null))}>
            Revert
          </Button>
          <Button variant="primary" disabled={!dirty || saving} onClick={save}>
            {saving ? "Saving" : "Save"}
          </Button>
        </div>
      </div>

      {confirmDiscard && (
        <Dialog
          title="Discard changes?"
          onClose={() => setConfirmDiscard(false)}
          width={400}
          footer={
            <>
              <Button variant="plain" onClick={() => setConfirmDiscard(false)}>
                Keep editing
              </Button>
              <Button variant="danger" onClick={onClose}>
                Discard
              </Button>
            </>
          }
        >
          <p>Your changes to {d.code} have not been saved.</p>
        </Dialog>
      )}
    </aside>
  );
}

function fmtVal(k: string, v: unknown, sym: string, app: ReturnType<typeof useApp>): string {
  if (v === null || v === undefined || v === "") return "empty";
  if (k === "price_minor" || k === "cost_minor") return money(v as number, sym);
  if (k === "price_tiers" || k === "cost_tiers") return (v as Tier[]).map((t) => `${t.label} ${money((t.price_minor ?? t.cost_minor) as number, sym)}`).join(", ") || "none";
  if (k === "supplier_id") return app.meta?.suppliers?.find((s) => s.id === v)?.name ?? `#${v}`;
  if (k === "price_mode") return MODE_LABEL[v as keyof typeof MODE_LABEL] ?? String(v);
  if (typeof v === "boolean" || k === "archived") return v ? "yes" : "no";
  return String(v);
}

function IssueList({ issues, onChange }: { issues: ItemIssue[]; onChange: () => void }) {
  const app = useApp();
  const toast = useToast();
  const [allowing, setAllowing] = useState<ItemIssue | null>(null);
  const [note, setNote] = useState("");
  const act = async (issue: ItemIssue, action: string, n?: string) => {
    try {
      await api(`/api/review/issues/${issue.id}`, { body: { action, note: n } });
      onChange();
      app.refreshMeta();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };
  return (
    <section className="insp-issues" aria-label="Needs attention">
      {issues.map((i) => (
        <div key={i.id} className={cx("issue", `issue-${i.severity}`, i.state === "dismissed" && "issue-dismissed")}>
          <SeverityIcon severity={i.severity} />
          <div className="issue-text">
            <div className="issue-title">
              {i.title}
              {i.state === "dismissed" && <span className="tag">Dismissed</span>}
            </div>
            <div className="issue-detail">{i.private && !app.showPrivate ? "Details hidden while private data is hidden." : i.detail}</div>
          </div>
          <div className="issue-actions">
            {i.state === "dismissed" ? (
              <button className="link-btn" onClick={() => act(i, "reopen")}>
                Reopen
              </button>
            ) : i.kind.startsWith("leak_") ? (
              <button className="link-btn" onClick={() => (setAllowing(i), setNote(""))}>
                Not supplier info
              </button>
            ) : (
              <button className="link-btn" onClick={() => act(i, "dismiss")}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      ))}
      {allowing && (
        <Dialog
          title="Confirm this is not supplier information"
          onClose={() => setAllowing(null)}
          width={460}
          footer={
            <>
              <Button variant="plain" onClick={() => setAllowing(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={note.trim().length < 3} onClick={() => (act(allowing, "allow", note), setAllowing(null))}>
                Confirm
              </Button>
            </>
          }
        >
          <p className="dialog-note">{app.showPrivate ? allowing.detail : "Show private data to see what was matched."} If the match is a coincidence, such as a brand that shares a supplier's name, say why. The product will then be included in exports.</p>
          <Field label="Reason">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. this is the brand name, not the supplier" />
          </Field>
        </Dialog>
      )}
    </section>
  );
}
