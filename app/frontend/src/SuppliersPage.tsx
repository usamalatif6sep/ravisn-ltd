import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { day, num, plural } from "./format";
import * as I from "./icons";
import { useApp } from "./store";
import { FulfilmentPanel, StockUpdates } from "./SupplierOps";
import type { Supplier } from "./types";
import { Button, cx, Dialog, Empty, Field, SeverityIcon, Spinner, Switch, useToast } from "./ui";

const FIELDS: { key: keyof Supplier; label: string; hint?: string; area?: boolean; mono?: boolean }[] = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone / WhatsApp", hint: "International format, e.g. +92 300 1234567", mono: true },
  { key: "whatsapp_link", label: "WhatsApp link", hint: "Filled in from the phone number if left empty", mono: true },
  { key: "other_numbers", label: "Other numbers", mono: true },
  { key: "emails", label: "Email", hint: "Separate several with commas" },
  { key: "whatsapp_groups", label: "WhatsApp groups", area: true },
  { key: "shown_in_sheet", label: "Shown in their sheet as" },
  { key: "note", label: "Note", area: true },
];

export default function SuppliersPage({ id }: { id?: number }) {
  const app = useApp();
  const toast = useToast();
  const [list, setList] = useState<Supplier[] | null>(null);
  const [unmapped, setUnmapped] = useState<Record<string, number>>({});
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ suppliers: Supplier[]; unmapped: Record<string, number> }>("/api/suppliers");
    setList(res.suppliers);
    setUnmapped(res.unmapped);
  }, []);

  useEffect(() => {
    if (app.showPrivate) load().catch((e) => toast({ text: e.message, tone: "error" }));
  }, [app.showPrivate, load, toast]);

  if (!app.showPrivate) {
    return (
      <div className="page">
        <Empty title="Private data is hidden" icon={<I.Lock size={22} />}>
          Supplier names, contacts and costs are hidden. Turn on Private data in the sidebar to manage suppliers.
          <div style={{ marginTop: 16 }}>
            <Switch checked={false} onChange={app.setShowPrivate} label="Show private data" />
          </div>
        </Empty>
      </div>
    );
  }
  if (!list) return <div className="page center-fill"><Spinner /></div>;
  const current = list.find((s) => s.id === id) ?? null;
  const unmappedTotal = Object.values(unmapped).reduce((a, b) => a + b, 0);

  return (
    <div className="page split">
      <div className="split-list">
        <header className="toolbar compact">
          <div className="toolbar-title">
            <h1>Suppliers</h1>
            <div className="subtitle">
              {plural(list.length, "supplier")} · {list.filter((s) => s.verified_at).length} verified
              {unmappedTotal > 0 && ` · ${num(unmappedTotal)} codes without a supplier`}
            </div>
          </div>
          <Button size="sm" icon={<I.Plus size={13} />} onClick={() => setCreating(true)}>
            Add
          </Button>
        </header>
        <div className="list" role="list">
          {list.map((s) => (
            <a key={s.id} role="listitem" href={`#/suppliers/${s.id}`} className={cx("list-row", s.id === id && "active")}>
              <div className="list-main">
                <div className="list-title">
                  {s.name}
                  {s.verified_at ? <I.Check size={12} className="verified" /> : null}
                </div>
                <div className="list-sub mono">{s.phone || <span className="muted">No phone</span>}</div>
              </div>
              <div className="list-count num">{num(s.total)}</div>
            </a>
          ))}
        </div>
      </div>
      <div className="split-detail">
        {current ? (
          <SupplierDetail key={current.id} supplier={current} onSaved={load} />
        ) : (
          <Empty title="Choose a supplier">Contacts, verification and the products each supplier provides.</Empty>
        )}
      </div>
      {creating && (
        <NewSupplier
          onClose={() => setCreating(false)}
          onCreated={(sid) => {
            setCreating(false);
            load();
            app.refreshMeta();
            app.go({ view: "suppliers", id: sid });
          }}
        />
      )}
    </div>
  );
}

function SupplierDetail({ supplier, onSaved }: { supplier: Supplier; onSaved: () => void }) {
  const app = useApp();
  const toast = useToast();
  const [draft, setDraft] = useState<Partial<Supplier>>({});
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState<{ issues: { id: number; title: string; severity: "blocker" | "warning" | "info"; detail: string }[] } | null>(null);
  const v = (k: keyof Supplier) => (k in draft ? (draft as any)[k] : supplier[k]) ?? "";
  const dirty = Object.keys(draft).length > 0;

  useEffect(() => {
    api(`/api/suppliers/${supplier.id}`).then(setExtra).catch(() => {});
  }, [supplier]);

  const save = async () => {
    setError(null);
    try {
      await api(`/api/suppliers/${supplier.id}`, { method: "PATCH", body: draft });
      setDraft({});
      onSaved();
      app.refreshMeta();
      toast({ text: `${v("name")} saved${"phone" in draft || "emails" in draft ? ". Contact changed, so verification was cleared." : ""}` });
    } catch (e: any) {
      setError(e.message);
    }
  };
  const verify = async (verified: boolean) => {
    try {
      await api(`/api/suppliers/${supplier.id}/verify`, { body: { verified } });
      onSaved();
      app.refreshMeta();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };

  return (
    <div className="detail">
      <header className="detail-head">
        <div>
          <h2>{supplier.name}</h2>
          <div className="subtitle">{supplier.verified_at ? `Contact verified ${day(supplier.verified_at)}` : "Contact not yet verified"}</div>
        </div>
        <div className="detail-actions">
          {supplier.whatsapp_link && (
            <a className="btn btn-secondary" href={supplier.whatsapp_link} target="_blank" rel="noreferrer noopener">
              <I.Chat size={14} />
              <span>WhatsApp</span>
            </a>
          )}
          {supplier.verified_at ? (
            <Button variant="plain" onClick={() => verify(false)}>
              Clear verification
            </Button>
          ) : (
            <Button onClick={() => verify(true)} icon={<I.Check size={14} />} disabled={dirty}>
              Mark contact verified
            </Button>
          )}
        </div>
      </header>
      {extra && extra.issues.length > 0 && (
        <div className="insp-issues">
          {extra.issues.map((i) => (
            <div key={i.id} className={cx("issue", `issue-${i.severity}`)}>
              <SeverityIcon severity={i.severity} />
              <div className="issue-text">
                <div className="issue-title">{i.title}</div>
                <div className="issue-detail">{i.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="counts-row">
        {app.meta!.countries.map((c) => (
          <a key={c.key} className="count-cell" href={`#/c/${c.key}`}>
            <span className="count-num num">{num(supplier.counts[c.key] ?? 0)}</span>
            <span className="count-label">{c.key}</span>
          </a>
        ))}
      </div>
      <div className="form-grid">
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            {f.area ? (
              <textarea className="input" rows={2} value={v(f.key)} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
            ) : (
              <input className={cx("input", f.mono && "mono")} value={v(f.key)} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
            )}
          </Field>
        ))}
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="detail-foot">
        <Button variant="plain" disabled={!dirty} onClick={() => setDraft({})}>
          Revert
        </Button>
        <Button variant="primary" disabled={!dirty} onClick={save}>
          Save
        </Button>
      </div>
      <StockUpdates supplierId={supplier.id} supplierName={supplier.name} />
      <FulfilmentPanel supplierId={supplier.id} />
    </div>
  );
}

function NewSupplier({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    try {
      const s = await api<{ id: number }>("/api/suppliers", { body: { name, phone: phone || null } });
      onCreated(s.id);
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Dialog
      title="Add supplier"
      onClose={onClose}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={submit}>
            Add supplier
          </Button>
        </>
      }
    >
      <Field label="Name" error={error}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Phone / WhatsApp" hint="International format, e.g. +92 300 1234567">
        <input className="input mono" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
    </Dialog>
  );
}
