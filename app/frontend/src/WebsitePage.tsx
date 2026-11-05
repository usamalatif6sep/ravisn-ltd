import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { num, when } from "./format";
import * as I from "./icons";
import { Button, cx, Dialog, Field, Segmented, Spinner, Switch, useToast } from "./ui";

interface Release {
  id: number;
  created_at: string;
  folder: string;
  state: "draft" | "approved" | "superseded" | "published";
  approved_at: string | null;
  published_at: string | null;
  published_url: string | null;
  summary: {
    countries: Record<string, { published: number; excluded: number; reasons: Record<string, number>; with_images: number; links_hidden: number }>;
    totals: { published: number; excluded: number; with_images: number; links_hidden: number };
    files: number;
    bytes: number;
    public_fields: string[];
    privacy_check: string;
  };
}
interface Website {
  releases: Release[];
  preview: { url: string; folder: string | null };
  site_built: boolean;
  publisher_installed: boolean;
  settings: { site_whatsapp_display: string; site_project: string; site_indexing: boolean };
  cloudflare_configured: boolean;
  order_service: { database_name: string; database_id: string } | null;
}

const STATE: Record<Release["state"], string> = { draft: "Draft", approved: "Approved", superseded: "Replaced", published: "Published" };

export default function WebsitePage() {
  const toast = useToast();
  const [w, setW] = useState<Website | null>(null);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState(false);
  const [deploying, setDeploying] = useState<Release | null>(null);
  const load = useCallback(() => api<Website>("/api/website").then(setW), []);
  useEffect(() => {
    load().catch((e) => toast({ text: e.message, tone: "error" }));
  }, [load, toast]);

  const build = async () => {
    setBusy(true);
    try {
      const r = await api<Release>("/api/website/releases", { method: "POST" });
      toast({ text: `Release ${r.id} built: ${num(r.summary.totals.published)} products. Check the preview, then approve it.` });
      await load();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const act = async (r: Release, what: "approve" | "preview") => {
    try {
      await api(`/api/website/releases/${r.id}/${what}`, { method: "POST" });
      toast({ text: what === "approve" ? `Release ${r.id} approved` : `Previewing release ${r.id}` });
      load();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };
  const saveSetting = async (patch: Partial<Website["settings"]>) => {
    try {
      await api("/api/website/settings", { method: "PUT", body: patch });
      load();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };

  if (!w) return <div className="page center-fill"><Spinner /></div>;
  const latest = w.releases[0];
  const live = w.releases.find((r) => r.state === "published");
  return (
    <div className="page scroll-page">
      <div className="narrow wide-narrow">
        <header className="page-head">
          <h1>Reseller website</h1>
          <p className="subtitle measure">
            The website shows only customer-approved fields: code, name, variant, category, price, status, stock, reference link and approved photos. Supplier names, contacts, costs, SKUs and notes are never included, and products held back in Review are left out.
          </p>
        </header>

        <section className="group">
          <div className="steps-row">
            <div className="step-card">
              <span className="step-n">1</span>
              <div>
                <div className="row-title">Build a release</div>
                <div className="row-sub">A snapshot of the current catalogue, checked for private information.</div>
              </div>
              <Button variant="primary" size="sm" disabled={busy || !w.site_built} onClick={build}>
                {busy ? "Building…" : "Build release"}
              </Button>
            </div>
            <div className="step-card">
              <span className="step-n">2</span>
              <div>
                <div className="row-title">Preview it</div>
                <div className="row-sub">Exactly what resellers will see, on this computer only.</div>
              </div>
              <a className={cx("btn btn-secondary btn-sm", !w.preview.folder && "disabled-link")} href={w.preview.url} target="_blank" rel="noreferrer">
                <I.External size={13} />
                <span>Open preview</span>
              </a>
            </div>
            <div className="step-card">
              <span className="step-n">3</span>
              <div>
                <div className="row-title">Approve and publish</div>
                <div className="row-sub">{live ? `Live at ${live.published_url}` : "Nothing published yet. Publishing needs your Cloudflare account."}</div>
              </div>
              <Button size="sm" onClick={() => setCreds(true)}>
                {w.cloudflare_configured ? "Cloudflare connected" : "Connect Cloudflare"}
              </Button>
            </div>
          </div>
          {!w.site_built && <p className="form-error">The website files are missing. Build app\public-site first.</p>}
        </section>

        <section className="group">
          <div className="group-head">
            <h2>Releases</h2>
          </div>
          {w.releases.length === 0 ? (
            <p className="group-note">No releases yet. Build one to preview the website.</p>
          ) : (
            <div className="rows">
              {w.releases.map((r) => (
                <div key={r.id} className={cx("row release-row", r.state === "superseded" && "row-dim")}>
                  <div className="row-main">
                    <div className="row-title">
                      Release {r.id} <span className={cx("state-badge", `state-${r.state}`)}>{STATE[r.state]}</span>
                      {w.preview.folder === r.folder && <span className="state-badge state-preview">In preview</span>}
                    </div>
                    <div className="row-sub">
                      Built {when(r.created_at)} · {num(r.summary.totals.published)} products · {num(r.summary.totals.excluded)} held back · {num(r.summary.totals.with_images)} with photos · privacy check {r.summary.privacy_check}
                      {r.published_url && ` · published ${when(r.published_at)}`}
                    </div>
                    {r === latest && (
                      <div className="release-countries">
                        {Object.entries(r.summary.countries).map(([k, c]) => (
                          <span key={k}>
                            {k}: {num(c.published)}
                            {c.excluded > 0 && <span className="muted"> (+{c.excluded} held)</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {w.preview.folder !== r.folder && r.state !== "superseded" && (
                    <Button size="sm" variant="plain" onClick={() => act(r, "preview")}>
                      Preview
                    </Button>
                  )}
                  {r.state === "draft" && (
                    <Button size="sm" onClick={() => act(r, "approve")}>
                      Approve
                    </Button>
                  )}
                  {(r.state === "approved" || r.state === "published") && (
                    <Button size="sm" variant="primary" disabled={!w.cloudflare_configured || !w.publisher_installed} onClick={() => setDeploying(r)}>
                      {r.state === "published" ? "Publish again" : "Publish"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="group">
          <div className="group-head">
            <h2>Website settings</h2>
          </div>
          <div className="rows">
            <SettingRow label="WhatsApp number shown" value={w.settings.site_whatsapp_display} onSave={(v) => saveSetting({ site_whatsapp_display: v })} />
            <SettingRow label="Cloudflare project name" hint={`Address: https://${w.settings.site_project}.pages.dev`} value={w.settings.site_project} onSave={(v) => saveSetting({ site_project: v })} />
            <div className="row">
              <div className="row-main">
                <div className="row-title">Allow search engines</div>
                <div className="row-sub">Off: only people with the link find the catalogue. Applies to the next release.</div>
              </div>
              <Switch checked={w.settings.site_indexing} onChange={(v) => saveSetting({ site_indexing: v })} label="Allow search engines" />
            </div>
          </div>
        </section>

        <OrderService w={w} onChanged={load} />
      </div>
      {creds && <CloudflareDialog configured={w.cloudflare_configured} onClose={() => setCreds(false)} onSaved={() => (setCreds(false), load())} />}
      {deploying && <DeployDialog release={deploying} project={w.settings.site_project} onClose={() => setDeploying(null)} onDone={() => (setDeploying(null), load())} />}
    </div>
  );
}

function SettingRow({ label, hint, value, onSave }: { label: string; hint?: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="row">
      <div className="row-main">
        <div className="row-title">{label}</div>
        {hint && <div className="row-sub">{hint}</div>}
      </div>
      <input className="input input-sm setting-input" value={v} onChange={(e) => setV(e.target.value)} aria-label={label} />
      <Button size="sm" variant="plain" disabled={v === value} onClick={() => onSave(v)}>
        Save
      </Button>
    </div>
  );
}

function CloudflareDialog({ configured, onClose, onSaved }: { configured: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [account, setAccount] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = async (remove = false) => {
    try {
      await api("/api/website/credentials", { method: "PUT", body: remove ? { remove: true } : { account_id: account, api_token: token } });
      toast({ text: remove ? "Cloudflare disconnected" : "Cloudflare details saved" });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Dialog
      title="Connect Cloudflare Pages"
      onClose={onClose}
      footer={
        <>
          {configured && (
            <Button variant="plain" onClick={() => save(true)}>
              Disconnect
            </Button>
          )}
          <div className="spacer" />
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!account || !token} onClick={() => save()}>
            Save
          </Button>
        </>
      }
    >
      <p className="dialog-note">
        Cloudflare Pages hosts the website for free at a pages.dev address. In your Cloudflare dashboard, copy your Account ID, and create an API token with the “Cloudflare Pages: Edit” permission. Both are stored encrypted on this computer. Saving them does not publish anything.
      </p>
      <Field label="Account ID" error={error}>
        <input className="input mono" value={account} onChange={(e) => setAccount(e.target.value)} autoComplete="off" spellCheck={false} />
      </Field>
      <Field label="API token">
        <input className="input mono" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
      </Field>
    </Dialog>
  );
}

function DeployDialog({ release, project, onClose, onDone }: { release: Release; project: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<Release>(`/api/website/releases/${release.id}/deploy`, { body: { confirm } });
      toast({ text: `Published at ${r.published_url}` });
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={`Publish release ${release.id}`}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || confirm !== project} onClick={go}>
            {busy ? "Publishing…" : "Publish to the internet"}
          </Button>
        </>
      }
    >
      <p>
        This uploads {num(release.summary.totals.published)} products ({num(release.summary.files)} files) to <strong>https://{project}.pages.dev</strong>, where anyone with the link can see them. Only these fields are included: {release.summary.public_fields.join(", ")}.
      </p>
      <Field label={`Type ${project} to confirm`} error={error}>
        <input className="input mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
    </Dialog>
  );
}

function OrderService({ w, onChanged }: { w: Website; onChanged: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<{ mode: "local" | "remote"; online_ready: boolean } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api("/api/store/mode").then(setMode).catch(() => {});
  }, [w.order_service]);
  return (
    <section className="group">
      <div className="group-head">
        <h2>Order service (orders and live chat online)</h2>
      </div>
      <p className="group-note">
        The published catalogue is static. Orders and chats need a secure database: on Cloudflare this is a D1 database used only by the storefront Worker in each
        release. It holds what resellers send (orders, delivery details, chats). Your catalogue database, supplier records and costs never leave this computer.
      </p>
      <div className="rows">
        <div className="row">
          <div className="row-main">
            <div className="row-title">{w.order_service ? `Set up: ${w.order_service.database_name}` : "Not set up yet"}</div>
            <div className="row-sub">
              {w.order_service
                ? "Publishing includes the order service. Your admin token and the Worker secrets are stored encrypted on this computer."
                : "Needed before publishing. Creates a free D1 database in your Cloudflare account and sets two secrets. Nothing is published by this step."}
            </div>
          </div>
          {!w.order_service && (
            <Button size="sm" disabled={!w.cloudflare_configured || !w.publisher_installed} onClick={() => setOpen(true)}>
              Set up order service
            </Button>
          )}
        </div>
        <div className="row">
          <div className="row-main">
            <div className="row-title">Manage orders and chats from</div>
            <div className="row-sub">This computer while you test locally; the online order service once the website is published.</div>
          </div>
          {mode && (
            <Segmented
              size="sm"
              value={mode.mode}
              onChange={async (v) => {
                try {
                  setMode({ ...mode, ...(await api("/api/store/mode", { method: "PUT", body: { mode: v } })) });
                } catch (e: any) {
                  toast({ text: e.message, tone: "error" });
                }
              }}
              options={[
                { value: "local", label: "This computer" },
                { value: "remote", label: "Online service", title: mode.online_ready ? undefined : "Set up the order service first" },
              ]}
            />
          )}
        </div>
      </div>
      {open && (
        <Dialog
          title="Set up the order service"
          onClose={() => setOpen(false)}
          footer={
            <>
              <div className="spacer" />
              <Button variant="plain" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={busy || confirm !== w.settings.site_project}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("/api/website/order-service", { body: { confirm } });
                    toast({ text: "Order service ready. Publish a release to put it online." });
                    setOpen(false);
                    onChanged();
                  } catch (e: any) {
                    toast({ text: e.message, tone: "error" });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Setting up…" : "Create database and secrets"}
              </Button>
            </>
          }
        >
          <p>This creates, in your Cloudflare account:</p>
          <ul className="plain-list">
            <li>a D1 database named {w.settings.site_project}-orders, for orders and chats only;</li>
            <li>two secrets for the {w.settings.site_project} Pages project: one that signs resellers' order and chat links, and your private admin token.</li>
          </ul>
          <p className="muted">Cloudflare's free plan covers this. Customer details are sent only over HTTPS. Type the project name to confirm.</p>
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={w.settings.site_project} />
        </Dialog>
      )}
    </section>
  );
}