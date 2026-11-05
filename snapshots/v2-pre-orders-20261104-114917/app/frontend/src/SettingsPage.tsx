import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { MoneyInput } from "./catalogue/Inspector";
import { money, num, plural, when } from "./format";
import * as I from "./icons";
import { useApp } from "./store";
import type { Country, Status } from "./types";
import { Button, cx, Dialog, Field, Segmented, Spinner, StatusDot, useToast } from "./ui";

interface PolicyItem {
  id?: number;
  title: string;
  body: string;
  generated: string | null;
}
interface PolicySection {
  heading: string;
  items: PolicyItem[];
}
interface SettingsData {
  settings: Record<string, string>;
  countries: (Country & { how_to_order: string[] })[];
  statuses: Status[];
  policies: Record<string, PolicySection[]>;
}

const TABS = [
  { value: "general", label: "General" },
  { value: "countries", label: "Countries" },
  { value: "policies", label: "Policies" },
  { value: "statuses", label: "Statuses" },
  { value: "backups", label: "Backups" },
  { value: "about", label: "About" },
];

export default function SettingsPage({ tab = "general" }: { tab?: string }) {
  const app = useApp();
  const [data, setData] = useState<SettingsData | null>(null);
  const load = useCallback(() => api<SettingsData>("/api/settings").then(setData), []);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  return (
    <div className="page scroll-page">
      <div className="narrow">
        <header className="page-head">
          <h1>Settings</h1>
          <Segmented value={tab} onChange={(t) => app.go({ view: "settings", tab: t })} options={TABS} />
        </header>
        {!data ? (
          <Spinner />
        ) : tab === "general" ? (
          <General data={data} onSaved={load} />
        ) : tab === "countries" ? (
          <Countries data={data} onSaved={load} />
        ) : tab === "policies" ? (
          <Policies data={data} onSaved={load} />
        ) : tab === "statuses" ? (
          <Statuses data={data} onSaved={load} />
        ) : tab === "backups" ? (
          <Backups />
        ) : (
          <About />
        )}
      </div>
    </div>
  );
}

function General({ data, onSaved }: { data: SettingsData; onSaved: () => void }) {
  const app = useApp();
  const toast = useToast();
  const [s, setS] = useState(data.settings);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(data.settings);
  const fields: [string, string, string?][] = [
    ["company", "Company name"],
    ["whatsapp_display", "WhatsApp number as shown"],
    ["whatsapp_link", "WhatsApp link", "Opened when customers tap the number"],
    ["email", "Email"],
    ["email_link", "Email link", "Usually mailto: followed by the address"],
    ["cover_note", "Cover note", "Shown at the bottom of the cover sheet"],
    ["policy_intro", "Policies introduction"],
  ];
  const save = async () => {
    setError(null);
    try {
      await api("/api/settings", { method: "PUT", body: s });
      onSaved();
      app.refreshMeta();
      toast({ text: "Settings saved. They apply to the next export." });
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <section className="group">
      <div className="group-head">
        <h2>Catalogue branding and contact</h2>
      </div>
      <p className="group-note">Printed on the cover and policies of every customer catalogue.</p>
      <div className="form-stack">
        {fields.map(([k, label, hint]) => (
          <Field key={k} label={label} hint={hint}>
            {k === "cover_note" || k === "policy_intro" ? (
              <textarea className="input" rows={2} value={s[k] ?? ""} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
            ) : (
              <input className="input" value={s[k] ?? ""} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
            )}
          </Field>
        ))}
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="group-foot">
        <Button variant="plain" disabled={!dirty} onClick={() => setS(data.settings)}>
          Revert
        </Button>
        <Button variant="primary" disabled={!dirty} onClick={save}>
          Save
        </Button>
      </div>
    </section>
  );
}

function Countries({ data, onSaved }: { data: SettingsData; onSaved: () => void }) {
  const [key, setKey] = useState(data.countries[0].key);
  const c = data.countries.find((x) => x.key === key)!;
  return (
    <>
      <Segmented value={key} onChange={setKey} options={data.countries.map((x) => ({ value: x.key, label: x.key }))} size="sm" />
      <CountryForm key={key} c={c} onSaved={onSaved} />
      <PricingRule key={`rule-${key}`} c={c} onSaved={onSaved} />
    </>
  );
}

function CountryForm({ c, onSaved }: { c: SettingsData["countries"][number]; onSaved: () => void }) {
  const toast = useToast();
  const [stock, setStock] = useState(c.stock_text);
  const [currency, setCurrency] = useState(c.currency_text);
  const [steps, setSteps] = useState(c.how_to_order);
  const [error, setError] = useState<string | null>(null);
  const dirty = stock !== c.stock_text || currency !== c.currency_text || JSON.stringify(steps) !== JSON.stringify(c.how_to_order);
  const save = async () => {
    setError(null);
    try {
      await api(`/api/countries/${c.key}`, { method: "PUT", body: { stock_text: stock, currency_text: currency, how_to_order: steps } });
      onSaved();
      toast({ text: `${c.name} cover saved` });
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <section className="group">
      <div className="group-head">
        <h2>{c.name} cover</h2>
      </div>
      <div className="form-stack">
        <Field label="Stock line">
          <input className="input" value={stock} onChange={(e) => setStock(e.target.value)} />
        </Field>
        <Field label="Currency line">
          <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </Field>
        <Field label="How to order" hint="{sheet} is replaced by the products sheet name, e.g. UK Products">
          <ol className="steps">
            {steps.map((st, i) => (
              <li key={i}>
                <textarea className="input" rows={2} value={st} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))} />
              </li>
            ))}
          </ol>
        </Field>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="group-foot">
        <Button variant="plain" disabled={!dirty} onClick={() => (setStock(c.stock_text), setCurrency(c.currency_text), setSteps(c.how_to_order))}>
          Revert
        </Button>
        <Button variant="primary" disabled={!dirty} onClick={save}>
          Save
        </Button>
      </div>
    </section>
  );
}

function PricingRule({ c, onSaved }: { c: Country; onSaved: () => void }) {
  const app = useApp();
  const toast = useToast();
  const [markup, setMarkup] = useState(String(c.markup_bp / 100));
  const [minMargin, setMinMargin] = useState<number | null>(c.min_margin_minor);
  const [preview, setPreview] = useState<{ changes: number } | null>(null);
  const markupBp = Math.round(Number(markup) * 100);
  const valid = Number.isFinite(markupBp) && markupBp >= 0 && markupBp <= 10000 && minMargin !== null;
  const changed = markupBp !== c.markup_bp || minMargin !== c.min_margin_minor;
  const check = async () => {
    try {
      setPreview(await api(`/api/countries/${c.key}/rule-preview`, { body: { markup_bp: markupBp, min_margin_minor: minMargin } }));
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };
  const apply = async () => {
    try {
      const res = await api<{ changed: number }>(`/api/countries/${c.key}/rule`, { body: { markup_bp: markupBp, min_margin_minor: minMargin } });
      setPreview(null);
      onSaved();
      app.refreshMeta();
      toast({ text: `Pricing rule saved. ${plural(res.changed, "price")} recalculated.` });
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };
  return (
    <section className="group">
      <div className="group-head">
        <h2>{c.name} pricing rule</h2>
      </div>
      <p className="group-note">
        Customer price is the higher of cost plus the markup and cost plus the minimum margin, rounded half up to the cent. Products with an override or an imported price that differs are not changed.
      </p>
      <div className="grid-2 narrow-grid">
        <Field label="Markup">
          <div className="money-input">
            <input aria-label="Markup percent" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} />
            <span className="money-symbol">%</span>
          </div>
        </Field>
        <Field label="Minimum margin">
          <MoneyInput symbol={c.symbol} label="Minimum margin" value={minMargin} onChange={setMinMargin} />
        </Field>
      </div>
      <div className="group-foot">
        <span className="muted">Example: cost {money(2000, c.symbol)} gives {valid ? money(Math.max(Math.floor((2000 * (10000 + markupBp) + 5000) / 10000), 2000 + (minMargin ?? 0)), c.symbol) : ""}</span>
        <div className="spacer" />
        <Button variant="primary" disabled={!valid || !changed} onClick={check}>
          Review change
        </Button>
      </div>
      {preview && (
        <Dialog
          title="Change the pricing rule?"
          onClose={() => setPreview(null)}
          width={440}
          footer={
            <>
              <Button variant="plain" onClick={() => setPreview(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={apply}>
                Change {num(preview.changes)} prices
              </Button>
            </>
          }
        >
          <p>
            {num(preview.changes)} {c.name} prices that follow the rule will change. A backup is taken first, and every change is recorded in each product's history.
          </p>
        </Dialog>
      )}
    </section>
  );
}

function Policies({ data, onSaved }: { data: SettingsData; onSaved: () => void }) {
  const [key, setKey] = useState(data.countries[0].key);
  return (
    <>
      <Segmented value={key} onChange={setKey} options={data.countries.map((x) => ({ value: x.key, label: x.key }))} size="sm" />
      <PolicyEditor key={key} country={key} sections={data.policies[key] ?? []} onSaved={onSaved} />
    </>
  );
}

function PolicyEditor({ country, sections, onSaved }: { country: string; sections: PolicySection[]; onSaved: () => void }) {
  const toast = useToast();
  const [secs, setSecs] = useState(sections);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(secs) !== JSON.stringify(sections);
  const upd = (si: number, ii: number, patch: Partial<PolicyItem>) => setSecs(secs.map((s, a) => (a !== si ? s : { ...s, items: s.items.map((it, b) => (b === ii ? { ...it, ...patch } : it)) })));
  const save = async () => {
    setError(null);
    try {
      await api(`/api/policies/${country}`, { method: "PUT", body: { sections: secs } });
      onSaved();
      toast({ text: `${country} policies saved` });
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <section className="group">
      <div className="group-head">
        <h2>{country} notes and policies</h2>
      </div>
      {secs.map((s, si) => (
        <div key={si} className="policy-section">
          <input className="input policy-heading" value={s.heading} onChange={(e) => setSecs(secs.map((x, a) => (a === si ? { ...x, heading: e.target.value } : x)))} aria-label="Section heading" />
          {s.items.map((it, ii) => (
            <div key={ii} className="policy-item">
              <input className="input" value={it.title} onChange={(e) => upd(si, ii, { title: e.target.value })} aria-label="Policy title" />
              {it.generated === "status_meanings" ? (
                <div className="policy-generated muted">Written automatically from the statuses used in the catalogue. Edit the wording under Statuses.</div>
              ) : (
                <textarea className="input" rows={3} value={it.body} onChange={(e) => upd(si, ii, { body: e.target.value })} aria-label={`${it.title} text`} />
              )}
              <button className="icon-btn" aria-label={`Remove ${it.title}`} onClick={() => setSecs(secs.map((x, a) => (a === si ? { ...x, items: x.items.filter((_, b) => b !== ii) } : x)))}>
                <I.Close size={12} />
              </button>
            </div>
          ))}
          <button className="link-btn" onClick={() => setSecs(secs.map((x, a) => (a === si ? { ...x, items: [...x.items, { title: "New policy", body: "", generated: null }] } : x)))}>
            Add policy
          </button>
        </div>
      ))}
      {error && <div className="form-error">{error}</div>}
      <div className="group-foot">
        <Button variant="plain" disabled={!dirty} onClick={() => setSecs(sections)}>
          Revert
        </Button>
        <Button variant="primary" disabled={!dirty} onClick={save}>
          Save
        </Button>
      </div>
    </section>
  );
}

function Statuses({ data, onSaved }: { data: SettingsData; onSaved: () => void }) {
  const toast = useToast();
  const [defs, setDefs] = useState<Record<string, string>>(Object.fromEntries(data.statuses.map((s) => [s.name, s.definition])));
  const save = async (name: string) => {
    try {
      await api(`/api/statuses/${encodeURIComponent(name)}`, { method: "PUT", body: { definition: defs[name] } });
      onSaved();
      toast({ text: `${name} saved` });
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };
  return (
    <section className="group">
      <div className="group-head">
        <h2>Status meanings</h2>
      </div>
      <p className="group-note">Each catalogue's policies list only the statuses its products use, in this order.</p>
      <div className="rows">
        {data.statuses.map((s) => (
          <div key={s.name} className="row row-top">
            <div className="status-name">
              <StatusDot availability={s.availability} /> {s.name}
            </div>
            <textarea className="input" rows={2} value={defs[s.name]} onChange={(e) => setDefs({ ...defs, [s.name]: e.target.value })} aria-label={`${s.name} meaning`} />
            <Button size="sm" variant="plain" disabled={defs[s.name] === s.definition} onClick={() => save(s.name)}>
              Save
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Backups() {
  const app = useApp();
  const toast = useToast();
  const [list, setList] = useState<{ backups: { name: string; at: string; reason: string; bytes: number }[]; folder: string } | null>(null);
  const [restore, setRestore] = useState<string | null>(null);
  const load = useCallback(() => api("/api/backups").then(setList), []);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  const now = async () => {
    try {
      await api("/api/backups", { method: "POST" });
      load();
      toast({ text: "Backup saved" });
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };
  const doRestore = async () => {
    try {
      const res = await api<{ safety_backup: string }>("/api/backups/restore", { body: { name: restore } });
      setRestore(null);
      toast({ text: `Restored. Your previous data was kept as ${res.safety_backup}.` });
      load();
      app.refreshMeta();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };
  const REASONS: Record<string, string> = { daily: "Daily", manual: "Manual", import: "After import", "pre-restore": "Before a restore", "pre-update": "Before an update sheet", "pre-reprice": "Before a pricing change", "pre-migration": "Before an upgrade" };
  return (
    <section className="group">
      <div className="group-head">
        <h2>Backups</h2>
        <div className="row-gap">
          <Button size="sm" variant="plain" icon={<I.Folder size={13} />} onClick={() => api("/api/system/open", { body: { target: "backups" } })}>
            Open folder
          </Button>
          <Button size="sm" variant="primary" onClick={now}>
            Back up now
          </Button>
        </div>
      </div>
      <p className="group-note">
        A backup is taken every day while Ravisn is open, and before any import, restore or pricing change. Kept: everything from the last 14 days, then one a week for 8 weeks, then one a month for a year. Copy the backups folder to a USB drive now and then, in case this computer fails.
      </p>
      {!list ? (
        <Spinner />
      ) : (
        <div className="rows">
          {list.backups.map((b) => (
            <div key={b.name} className="row row-compact">
              <div className="row-main">
                <div className="row-title">{when(b.at)}</div>
                <div className="row-sub">
                  {REASONS[b.reason] ?? b.reason} · {(b.bytes / 1048576).toFixed(1)} MB
                </div>
              </div>
              <Button size="sm" variant="plain" onClick={() => setRestore(b.name)}>
                Restore
              </Button>
            </div>
          ))}
        </div>
      )}
      {restore && (
        <Dialog
          title="Restore this backup?"
          onClose={() => setRestore(null)}
          width={440}
          footer={
            <>
              <Button variant="plain" onClick={() => setRestore(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={doRestore}>
                Restore
              </Button>
            </>
          }
        >
          <p>All products, suppliers and settings go back to how they were at that time. Your current data is backed up first, so this can be reversed.</p>
        </Dialog>
      )}
    </section>
  );
}

function About() {
  const app = useApp();
  const [r, setR] = useState<any>(null);
  useEffect(() => {
    api("/api/import/report").then(setR).catch(() => {});
  }, []);
  if (!r) return <Spinner />;
  const rep = r.report;
  return (
    <>
      <section className="group">
        <div className="group-head">
          <h2>Import verification</h2>
        </div>
        <p className="group-note">Imported {when(r.finished_at)} from {r.source_dir}. The original workbooks were copied first and never opened for writing; their fingerprints were checked before and after.</p>
        <div className="rows">
          {rep.checks.map((c: any) => (
            <div key={c.name} className="row row-compact">
              <span className={cx("check-mark", c.ok ? "ok" : "bad")}>{c.ok ? <I.Check size={13} /> : <I.Alert size={13} />}</span>
              <div className="row-main">
                <div className="row-title">{c.name}</div>
                <div className="row-sub">{c.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="group">
        <div className="group-head">
          <h2>By country</h2>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Country</th>
              <th className="right">Codes</th>
              <th className="right">Rule prices</th>
              <th className="right">Tiered</th>
              <th className="right">Exceptions</th>
              <th className="right">No cost</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(rep.countries).map(([k, c]: [string, any]) => (
              <tr key={k}>
                <td>{app.country(k)?.name ?? k}</td>
                <td className="right num">{num(c.imported)}</td>
                <td className="right num">{num(c.rule_priced)}</td>
                <td className="right num">{num(c.tiered)}</td>
                <td className="right num">{num(c.exceptions)}</td>
                <td className="right num">{num(c.no_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="group">
        <div className="group-head">
          <h2>Original files</h2>
        </div>
        <div className="rows">
          {r.files.map((f: any) => (
            <div key={f.name} className="row row-compact">
              <div className="row-main">
                <div className="row-title mono-file">{f.name}</div>
                <div className="row-sub mono">SHA-256 {f.sha256.slice(0, 16)}…</div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="group">
        <div className="group-head">
          <h2>About</h2>
        </div>
        <div className="rows">
          <div className="row row-compact">
            <div className="row-main">
              <div className="row-title">Data folder</div>
              <div className="row-sub mono">{app.meta!.data_dir}</div>
            </div>
            <Button size="sm" variant="plain" icon={<I.Folder size={13} />} onClick={() => api("/api/system/open", { body: { target: "data" } })}>
              Open
            </Button>
          </div>
          <div className="row row-compact">
            <div className="row-main">
              <div className="row-title">Quit Ravisn</div>
              <div className="row-sub">Stops the local server. Open it again from the desktop shortcut.</div>
            </div>
            <Button size="sm" variant="plain" icon={<I.Power size={13} />} onClick={() => api("/api/system/quit", { method: "POST" })}>
              Quit
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
