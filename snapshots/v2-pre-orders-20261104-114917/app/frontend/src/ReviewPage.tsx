import { useCallback, useEffect, useMemo, useState } from "react";
import { api, qs } from "./api";
import { num, plural } from "./format";
import * as I from "./icons";
import { useApp } from "./store";
import type { ReviewIssue, ReviewKind, Severity } from "./types";
import { Button, cx, Dialog, Empty, Field, SeverityIcon, Spinner, useToast } from "./ui";

const GROUPS: { severity: Severity; title: string; note: string }[] = [
  { severity: "blocker", title: "Held back from exports", note: "These products are left out of customer catalogues until resolved." },
  { severity: "warning", title: "Needs a decision", note: "Exported as they are, but worth checking." },
  { severity: "info", title: "For information", note: "Handled automatically or low priority." },
];

const FIXES: Record<string, { action: string; label: string; confirm: string }> = {
  status_qty_conflict: { action: "zero_out_of_stock", label: "Set quantity to 0 for out-of-stock products", confirm: "Out-of-stock products listed here will get quantity 0. Products marked available with no quantity are not changed. Every change is recorded and can be undone one by one from the product's history." },
  name_spaces: { action: "tidy_names", label: "Remove extra spaces from these names", confirm: "Leading, trailing and double spaces are removed. Nothing else in the names changes." },
};

export default function ReviewPage({ kind }: { kind?: string }) {
  const app = useApp();
  const toast = useToast();
  const [kinds, setKinds] = useState<ReviewKind[] | null>(null);
  const [issues, setIssues] = useState<ReviewIssue[] | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [state, setState] = useState<"open" | "dismissed">("open");
  const [confirm, setConfirm] = useState<{ action: string; label: string; text: string } | null>(null);

  const loadKinds = useCallback(async () => setKinds(await api<ReviewKind[]>("/api/review")), []);
  useEffect(() => {
    loadKinds().catch((e) => toast({ text: e.message, tone: "error" }));
  }, [loadKinds, toast]);

  const active = kind ?? kinds?.find((k) => k.open > 0)?.kind;
  const meta = kinds?.find((k) => k.kind === active);

  const loadIssues = useCallback(async () => {
    if (!active) return;
    setIssues(null);
    setIssues(await api<ReviewIssue[]>("/api/review/issues" + qs({ kind: active, state, country })));
  }, [active, state, country]);
  useEffect(() => {
    loadIssues().catch((e) => toast({ text: e.message, tone: "error" }));
  }, [loadIssues, toast]);
  useEffect(() => setCountry(null), [active]);

  const refresh = async () => {
    await Promise.all([loadKinds(), loadIssues()]);
    app.refreshMeta();
  };

  const act = async (i: ReviewIssue, action: string) => {
    try {
      await api(`/api/review/issues/${i.id}`, { body: { action } });
      setIssues((list) => list && list.filter((x) => x.id !== i.id));
      loadKinds();
      app.refreshMeta();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };

  const bulk = async (action: string) => {
    try {
      const res = await api<{ changed: number }>("/api/review/bulk", { body: { kind: active, action, country } });
      toast({ text: `${plural(res.changed, "item")} updated` });
      await refresh();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };

  const hidden = meta?.private && !app.showPrivate;
  const groupsShown = useMemo(() => GROUPS.map((g) => ({ ...g, kinds: (kinds ?? []).filter((k) => k.severity === g.severity && (k.open > 0 || k.dismissed > 0)) })), [kinds]);

  if (!kinds) return <div className="page center-fill"><Spinner /></div>;
  const total = kinds.reduce((a, k) => a + k.open, 0);

  return (
    <div className="page split">
      <div className="split-list review-kinds">
        <header className="toolbar compact">
          <div className="toolbar-title">
            <h1>Review</h1>
            <div className="subtitle">{total ? `${num(total)} open items` : "Nothing open"}</div>
          </div>
        </header>
        <div className="list">
          {groupsShown.map(
            (g) =>
              g.kinds.length > 0 && (
                <div key={g.severity}>
                  <div className="list-section">{g.title}</div>
                  {g.kinds.map((k) => (
                    <a key={k.kind} href={`#/review/${k.kind}`} className={cx("list-row", k.kind === active && "active")}>
                      <SeverityIcon severity={k.severity} />
                      <div className="list-main">
                        <div className="list-title">{k.title}</div>
                      </div>
                      <div className="list-count num">{k.open ? num(k.open) : <I.Check size={12} />}</div>
                    </a>
                  ))}
                </div>
              ),
          )}
        </div>
      </div>
      <div className="split-detail">
        {!meta ? (
          <Empty title="Nothing to review" icon={<I.Check size={22} />}>All checks pass.</Empty>
        ) : (
          <div className="detail review-detail">
            <header className="detail-head">
              <div>
                <h2>{meta.title}</h2>
                <div className="subtitle measure">{meta.description}</div>
              </div>
            </header>
            <div className="review-tools">
              <div className="chips">
                <button className={cx("chip", !country && "on")} onClick={() => setCountry(null)}>
                  All · {num(meta.open)}
                </button>
                {Object.entries(meta.by_country).map(([c, n]) => (
                  <button key={c} className={cx("chip", country === c && "on")} onClick={() => setCountry(c)}>
                    {c} · {num(n)}
                  </button>
                ))}
                {meta.dismissed > 0 && (
                  <button className={cx("chip", state === "dismissed" && "on")} onClick={() => setState((s) => (s === "open" ? "dismissed" : "open"))}>
                    {state === "dismissed" ? "Show open" : `Dismissed · ${num(meta.dismissed)}`}
                  </button>
                )}
              </div>
              <div className="review-bulk">
                {FIXES[meta.kind] && state === "open" && (
                  <Button size="sm" onClick={() => setConfirm({ action: FIXES[meta.kind].action, label: FIXES[meta.kind].label, text: FIXES[meta.kind].confirm })}>
                    {FIXES[meta.kind].label}
                  </Button>
                )}
                {meta.severity !== "blocker" && state === "open" && meta.open > 0 && (
                  <Button size="sm" variant="plain" onClick={() => setConfirm({ action: "dismiss", label: "Dismiss all shown", text: `Dismiss ${country ? `the ${country} items` : "all items"} of this type? Dismissed items stay in the list under Dismissed and can be reopened.` })}>
                    Dismiss all
                  </Button>
                )}
              </div>
            </div>
            {issues === null ? (
              <div className="center-fill"><Spinner /></div>
            ) : issues.length === 0 ? (
              <Empty title={state === "open" ? "All clear" : "None dismissed"} icon={<I.Check size={22} />} />
            ) : (
              <IssueTable issues={issues} hidden={!!hidden} onAct={act} onRefresh={refresh} state={state} />
            )}
          </div>
        )}
      </div>
      {confirm && (
        <Dialog
          title={confirm.label}
          onClose={() => setConfirm(null)}
          width={460}
          footer={
            <>
              <Button variant="plain" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => (bulk(confirm.action), setConfirm(null))}>
                Continue
              </Button>
            </>
          }
        >
          <p>{confirm.text}</p>
        </Dialog>
      )}
    </div>
  );
}

function IssueTable({ issues, hidden, onAct, onRefresh, state }: { issues: ReviewIssue[]; hidden: boolean; onAct: (i: ReviewIssue, action: string) => void; onRefresh: () => void; state: string }) {
  const [limit, setLimit] = useState(300);
  const [allowing, setAllowing] = useState<ReviewIssue | null>(null);
  const [note, setNote] = useState("");
  const toast = useToast();
  const app = useApp();
  const allow = async () => {
    if (!allowing) return;
    try {
      await api(`/api/review/issues/${allowing.id}`, { body: { action: "allow", note } });
      setAllowing(null);
      onRefresh();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };
  return (
    <div className="issue-table">
      {issues.slice(0, limit).map((i) => (
        <div key={i.id} className="issue-tr">
          {i.code ? (
            <a className="mono issue-code" href={`#/c/${i.country}/${i.item_id}`}>
              {i.code}
            </a>
          ) : (
            <a className="issue-code" href={`#/suppliers/${i.supplier_id}`}>
              {hidden ? "Supplier" : i.supplier_name}
            </a>
          )}
          <div className="issue-main">
            {i.name && <div className="issue-name">{i.name}</div>}
            <div className="issue-detail">{hidden ? "Details hidden while private data is hidden." : i.detail}</div>
          </div>
          <div className="issue-actions">
            {state === "dismissed" ? (
              <button className="link-btn" onClick={() => onAct(i, "reopen")}>
                Reopen
              </button>
            ) : i.kind.startsWith("leak_") ? (
              <button className="link-btn" onClick={() => (setAllowing(i), setNote(""))}>
                Not supplier info
              </button>
            ) : (
              <button className="link-btn" onClick={() => onAct(i, "dismiss")}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      ))}
      {issues.length > limit && (
        <div className="more-row">
          <Button size="sm" variant="plain" onClick={() => setLimit((l) => l + 500)}>
            Show more ({num(issues.length - limit)} remaining)
          </Button>
        </div>
      )}
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
              <Button variant="primary" disabled={note.trim().length < 3} onClick={allow}>
                Confirm
              </Button>
            </>
          }
        >
          <p className="dialog-note">{app.showPrivate ? allowing.detail : "Show private data to see what was matched."} If the match is a coincidence, such as a brand that shares a supplier's name, say why. The product will then be included in exports. Otherwise, edit the product instead.</p>
          <Field label="Reason">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. this is the brand name, not the supplier" />
          </Field>
        </Dialog>
      )}
    </div>
  );
}
