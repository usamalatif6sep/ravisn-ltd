import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { num, plural, when } from "./format";
import * as I from "./icons";
import { useApp } from "./store";
import type { Precheck } from "./types";
import { Button, cx, Dialog, Spinner, useToast } from "./ui";

interface ExportRecord {
  id: number;
  at: string;
  kind: string;
  country: string | null;
  path: string;
  file: string;
  rows: number;
  excluded: number;
  exists: boolean;
}

interface StockPreview {
  token: string;
  file: string;
  changes: { item_id: number; code: string; name: string; patch: Record<string, unknown>; before: Record<string, unknown> }[];
  errors: { row: number; code: string; message: string }[];
  unknown_codes: string[];
}

async function openFile(path: string, reveal = false) {
  await api("/api/system/open", { body: { target: "file", path, reveal } });
}

export default function ExportsPage() {
  const app = useApp();
  const toast = useToast();
  const [checks, setChecks] = useState<Record<string, Precheck | "loading">>({});
  const [history, setHistory] = useState<ExportRecord[]>([]);
  const [confirm, setConfirm] = useState<Precheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<StockPreview | null>(null);
  const [stockCountry, setStockCountry] = useState("UK");
  const fileInput = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(() => api<ExportRecord[]>("/api/exports").then(setHistory).catch(() => {}), []);

  const check = useCallback(async (key: string) => {
    setChecks((c) => ({ ...c, [key]: "loading" }));
    try {
      const pc = await api<Precheck>(`/api/exports/check?country=${key}`);
      setChecks((c) => ({ ...c, [key]: pc }));
      return pc;
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
      setChecks((c) => {
        const n = { ...c };
        delete n[key];
        return n;
      });
    }
  }, [toast]);

  useEffect(() => {
    loadHistory();
    (async () => {
      for (const c of app.meta!.countries) await check(c.key);
    })();
  }, [app.meta, check, loadHistory]);

  const doExport = async (country: string, exclude: boolean) => {
    setBusy(country);
    try {
      const res = await api<{ path: string; file: string; rows: number; excluded: number }>("/api/exports/catalogue", { body: { country, exclude_blocked: exclude } });
      toast({ text: `Saved ${res.file}: ${plural(res.rows, "product")}`, action: { label: "Open", run: () => openFile(res.path) } });
      setConfirm(null);
      loadHistory();
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409 && e.payload?.precheck) setConfirm(e.payload.precheck);
      else toast({ text: e.message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const start = async (country: string) => {
    const pc = await check(country);
    if (!pc) return;
    if (pc.blocked.length || pc.global_leaks.length) setConfirm(pc);
    else doExport(country, false);
  };

  const privateExport = async (kind: "master" | "stock") => {
    setBusy(kind);
    try {
      const res =
        kind === "master"
          ? await api<{ path: string; file: string; rows: number }>("/api/exports/private-master", { method: "POST" })
          : await api<{ path: string; file: string; rows: number }>("/api/exports/stock-sheet", { body: { country: stockCountry } });
      toast({ text: `Saved ${res.file}`, action: { label: "Open", run: () => openFile(res.path) } });
      loadHistory();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      setPreview(await api<StockPreview>("/api/imports/stock-sheet", { form }));
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };

  const apply = async () => {
    if (!preview) return;
    try {
      const res = await api<{ applied: number; failed: { code: string; message: string }[] }>(`/api/imports/stock-sheet/${preview.token}/apply`, { method: "POST" });
      toast({ text: `${plural(res.applied, "product")} updated${res.failed.length ? `, ${res.failed.length} could not be changed` : ""}` });
      setPreview(null);
      app.refreshMeta();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };

  return (
    <div className="page scroll-page">
      <div className="narrow">
        <header className="page-head">
          <h1>Exports</h1>
          <p className="subtitle measure">
            Customer catalogues are built only from customer-facing fields. Every file is checked cell by cell for supplier names, phone numbers, emails and SKUs before it is saved.
          </p>
        </header>

        <section className="group">
          <div className="group-head">
            <h2>Customer catalogues</h2>
            <Button size="sm" variant="plain" icon={<I.Folder size={13} />} onClick={() => api("/api/system/open", { body: { target: "customer" } })}>
              Open folder
            </Button>
          </div>
          <div className="rows">
            {app.meta!.countries.map((c) => {
              const pc = checks[c.key];
              const last = history.find((h) => h.kind === "customer" && h.country === c.key);
              return (
                <div key={c.key} className="row">
                  <div className="row-main">
                    <div className="row-title">{c.name}</div>
                    <div className="row-sub">
                      {pc === undefined || pc === "loading" ? (
                        <span className="muted">Checking…</span>
                      ) : (
                        <>
                          {plural(pc.exportable, "product")} ready
                          {pc.blocked.length > 0 && <span className="warn-text"> · {num(pc.blocked.length)} held back</span>}
                          {pc.global_leaks.length > 0 && <span className="danger-text"> · supplier information in cover or policy text</span>}
                        </>
                      )}
                      {last && <span className="muted"> · last exported {when(last.at)}</span>}
                    </div>
                  </div>
                  {last?.exists && (
                    <Button size="sm" variant="plain" onClick={() => openFile(last.path)}>
                      Open last
                    </Button>
                  )}
                  <Button size="sm" variant="primary" disabled={busy !== null || pc === "loading"} onClick={() => start(c.key)}>
                    {busy === c.key ? "Exporting" : "Export"}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="group private-group">
          <div className="group-head">
            <h2>
              <I.Lock size={14} /> Private files
            </h2>
            <Button size="sm" variant="plain" icon={<I.Folder size={13} />} onClick={() => api("/api/system/open", { body: { target: "private" } })}>
              Open folder
            </Button>
          </div>
          <p className="group-note">Contain suppliers, costs and contacts. Saved separately, named PRIVATE, and never sent to customers.</p>
          <div className="rows">
            <div className="row">
              <div className="row-main">
                <div className="row-title">Supplier master</div>
                <div className="row-sub">Every product with its supplier, cost, margin and source, plus the supplier list.</div>
              </div>
              <Button size="sm" disabled={busy !== null || !app.showPrivate} onClick={() => privateExport("master")}>
                Export
              </Button>
            </div>
            <div className="row">
              <div className="row-main">
                <div className="row-title">Stock and price update sheet</div>
                <div className="row-sub">Edit status, quantity, cost or price in Excel, then import it here. You see every change before it is applied.</div>
              </div>
              <select className="input input-sm" value={stockCountry} onChange={(e) => setStockCountry(e.target.value)} aria-label="Country">
                {app.meta!.countries.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.key}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={busy !== null || !app.showPrivate} onClick={() => privateExport("stock")}>
                Export
              </Button>
              <Button size="sm" icon={<I.Download size={13} />} disabled={!app.showPrivate} onClick={() => fileInput.current?.click()}>
                Import
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) upload(f);
                }}
              />
            </div>
          </div>
          {!app.showPrivate && <p className="group-note">Turn on Private data to use these.</p>}
        </section>

        {history.length > 0 && (
          <section className="group">
            <div className="group-head">
              <h2>Recent files</h2>
            </div>
            <div className="rows">
              {history.slice(0, 12).map((h) => (
                <div key={h.id} className={cx("row row-compact", !h.exists && "row-dim")}>
                  <div className="row-main">
                    <div className="row-title mono-file">{h.file}</div>
                    <div className="row-sub">
                      {when(h.at)} · {plural(h.rows, "row")}
                      {h.excluded > 0 && ` · ${num(h.excluded)} held back`}
                      {!h.exists && " · file moved or deleted"}
                    </div>
                  </div>
                  {h.exists && (
                    <>
                      <Button size="sm" variant="plain" onClick={() => openFile(h.path, true)}>
                        Show in folder
                      </Button>
                      <Button size="sm" variant="plain" onClick={() => openFile(h.path)}>
                        Open
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {confirm && <ExportConfirm pc={confirm} busy={busy === confirm.country} onClose={() => setConfirm(null)} onExport={() => doExport(confirm.country, true)} />}
      {preview && <StockPreviewDialog preview={preview} onClose={() => setPreview(null)} onApply={apply} />}
    </div>
  );
}

function ExportConfirm({ pc, busy, onClose, onExport }: { pc: Precheck; busy: boolean; onClose: () => void; onExport: () => void }) {
  const app = useApp();
  const reasons: Record<string, number> = {};
  pc.blocked.forEach((b) => b.reasons.forEach((r) => (reasons[r] = (reasons[r] ?? 0) + 1)));
  const name = app.country(pc.country)?.name ?? pc.country;
  return (
    <Dialog
      title={`Export ${name}`}
      onClose={onClose}
      width={540}
      footer={
        pc.global_leaks.length ? (
          <>
            <Button variant="plain" onClick={onClose}>
              Close
            </Button>
            <a className="btn btn-primary" href="#/settings/general" onClick={onClose}>
              <span>Open settings</span>
            </a>
          </>
        ) : (
          <>
            <Button variant="plain" onClick={onClose}>
              Cancel
            </Button>
            <a className="btn btn-secondary" href={`#/review`} onClick={onClose}>
              <span>Review first</span>
            </a>
            <Button variant="primary" disabled={busy} onClick={onExport}>
              {busy ? "Exporting" : `Export ${num(pc.exportable)} products`}
            </Button>
          </>
        )
      }
    >
      {pc.global_leaks.length ? (
        <>
          <p>Supplier information was found in text that appears in every catalogue, so this export cannot run:</p>
          <ul className="plain-list">
            {pc.global_leaks.map((g, i) => (
              <li key={i}>
                {g.where}: {app.showPrivate ? g.found : "supplier information"}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p>
            {num(pc.exportable)} of {num(pc.total)} products are ready. {plural(pc.blocked.length, "product is", "products are")} held back and will be left out of this file:
          </p>
          <ul className="plain-list">
            {Object.entries(reasons).map(([r, n]) => (
              <li key={r}>
                <span className="num">{num(n)}</span> {r.toLowerCase()}
              </li>
            ))}
          </ul>
          <p className="dialog-note">Fix them in Review to include them next time. Supplier details are never written to the file.</p>
        </>
      )}
    </Dialog>
  );
}

const PATCH_LABEL: Record<string, string> = { status: "Status", qty: "Qty", qty_basis: "Qty basis", cost_minor: "Cost", price_minor: "Price override" };

function StockPreviewDialog({ preview, onClose, onApply }: { preview: StockPreview; onClose: () => void; onApply: () => void }) {
  const [busy, setBusy] = useState(false);
  const fmt = (k: string, v: unknown) => (v === null || v === undefined ? "empty" : k.endsWith("_minor") ? ((v as number) / 100).toFixed(2) : String(v));
  return (
    <Dialog
      title={`Update from ${preview.file}`}
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || preview.errors.length > 0 || preview.changes.length === 0} onClick={() => (setBusy(true), onApply())}>
            {preview.changes.length ? `Apply ${plural(preview.changes.length, "change")}` : "Nothing to apply"}
          </Button>
        </>
      }
    >
      {preview.errors.length > 0 && (
        <div className="callout callout-danger">
          Fix these rows in the sheet and import it again:
          <ul className="plain-list">
            {preview.errors.slice(0, 20).map((e) => (
              <li key={e.row}>
                Row {e.row} ({e.code}): {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.unknown_codes.length > 0 && <p className="dialog-note">Ignored {plural(preview.unknown_codes.length, "unknown code")}: {preview.unknown_codes.slice(0, 8).join(", ")}</p>}
      {preview.changes.length === 0 ? (
        <p>The sheet matches what is already saved.</p>
      ) : (
        <div className="change-list">
          {preview.changes.slice(0, 400).map((c) => (
            <div key={c.item_id} className="change-row">
              <span className="mono">{c.code}</span>
              <span className="change-name">{c.name}</span>
              <span className="change-fields">
                {Object.entries(c.patch)
                  .filter(([k]) => k !== "price_note" && k !== "price_mode")
                  .map(([k, v]) => (
                    <span key={k}>
                      {PATCH_LABEL[k] ?? k}: {fmt(k, c.before[k])} → {fmt(k, v)}
                    </span>
                  ))}
              </span>
            </div>
          ))}
          {preview.changes.length > 400 && <div className="muted">and {num(preview.changes.length - 400)} more</div>}
        </div>
      )}
      <p className="dialog-note">A backup is taken before anything is applied.</p>
      {busy && <Spinner />}
    </Dialog>
  );
}
