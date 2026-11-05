import { useCallback, useEffect, useMemo, useState } from "react";
import { api, qs } from "../api";
import { money, num, plural, qtyText } from "../format";
import * as I from "../icons";
import { useApp } from "../store";
import type { ItemRow } from "../types";
import { Button, cx, Dialog, Field, Menu, MenuItem, Spinner, StatusDot, useToast } from "../ui";
import Inspector from "./Inspector";
import VirtualTable, { type Column } from "./VirtualTable";

type Attention = "all" | "blocker" | "warning" | "clear";

export default function CataloguePage({ country, itemId }: { country: string; itemId?: number }) {
  const app = useApp();
  const toast = useToast();
  const c = app.country(country);
  const [rows, setRows] = useState<ItemRow[] | null>(null);
  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<string | null>(null);
  const [supplier, setSupplier] = useState<number | "none" | null>(null);
  const [attention, setAttention] = useState<Attention>("all");
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "code", dir: 1 });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const data = await api<ItemRow[]>("/api/items" + qs({ country, private: app.showPrivate, archived }));
    setRows(data);
  }, [country, app.showPrivate, archived]);

  useEffect(() => {
    load().catch((e) => toast({ text: e.message, tone: "error" }));
  }, [load, toast]);

  useEffect(() => {
    if (!app.showPrivate) setSupplier(null);
  }, [app.showPrivate]);

  const statusOf = (name: string) => app.status(name)?.availability;

  const filtered = useMemo(() => {
    if (!rows) return [];
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const out = rows.filter((r) => {
      if (statuses.size && !statuses.has(r.status)) return false;
      if (category && r.category !== category) return false;
      if (supplier === "none" && r.supplier_id) return false;
      if (typeof supplier === "number" && r.supplier_id !== supplier) return false;
      if (attention === "blocker" && !r.issues.blocker) return false;
      if (attention === "warning" && !r.issues.warning) return false;
      if (attention === "clear" && (r.issues.blocker || r.issues.warning)) return false;
      if (words.length) {
        const hay = `${r.code} ${r.name} ${r.variant ?? ""} ${r.category} ${app.showPrivate ? `${r.supplier ?? ""} ${r.item_ref ?? ""} ${r.supplier_sku ?? ""}` : ""}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const key = sort.key;
    const val = (r: ItemRow): string | number => {
      switch (key) {
        case "code":
          return r.seq;
        case "name":
          return r.name.toLowerCase();
        case "category":
          return r.category;
        case "price":
          return r.price_minor ?? r.price_tiers[0]?.price_minor ?? -1;
        case "status":
          return app.status(r.status)?.sort ?? 99;
        case "qty":
          return r.qty ?? -1;
        case "supplier":
          return (r.supplier ?? "~").toLowerCase();
        case "cost":
          return r.cost_minor ?? -1;
        case "margin":
          return r.cost_minor != null && r.price_minor != null ? r.price_minor - r.cost_minor : -1e9;
        case "issues":
          return -(r.issues.blocker * 1000 + r.issues.warning);
        default:
          return r.seq;
      }
    };
    return out.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : a.seq - b.seq) * sort.dir;
    });
  }, [rows, q, statuses, category, supplier, attention, sort, app]);

  const open = (r: ItemRow) => app.go({ view: "catalogue", country, id: r.id }, itemId !== undefined);
  const close = () => app.go({ view: "catalogue", country });
  const toggleSel = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const sym = c?.symbol ?? "";
  // With the inspector open the table keeps only the columns needed to pick a product.
  const compact = itemId !== undefined;
  const columns: Column<ItemRow>[] = [
    {
      key: "sel",
      label: (
        <input
          type="checkbox"
          aria-label="Select all shown"
          checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
          onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((r) => r.id)) : new Set())}
        />
      ),
      width: "34px",
      align: "center",
      render: (r) => <input type="checkbox" aria-label={`Select ${r.code}`} checked={selected.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSel(r.id)} />,
    },
    {
      key: "issues",
      label: "",
      width: "18px",
      sortable: true,
      align: "center",
      render: (r) => (r.issues.blocker ? <span className="flag flag-blocker" title="Held back from exports" /> : r.issues.warning ? <span className="flag flag-warning" title="Needs a decision" /> : null),
    },
    { key: "code", label: "Code", width: compact ? "84px" : "92px", sortable: true, className: "mono", render: (r) => r.code },
    {
      key: "name",
      label: "Product",
      width: compact ? "minmax(150px, 1fr)" : "minmax(240px, 1fr)",
      sortable: true,
      render: (r) => (
        <span className="cell-name" title={r.name}>
          {r.name}
          {r.variant && <span className="muted">, {r.variant}</span>}
          {r.archived && <span className="tag">Archived</span>}
        </span>
      ),
    },
    ...(compact ? [] : [{ key: "category", label: "Category", width: "128px", sortable: true, className: "muted", render: (r: ItemRow) => r.category }]),
    {
      key: "price",
      label: "Price",
      width: compact ? "92px" : "110px",
      sortable: true,
      align: "right",
      className: "num",
      render: (r) =>
        r.price_tiers.length ? (
          <span title={r.price_tiers.map((t) => `${t.label} ${money(t.price_minor, sym)}`).join("\n")}>
            {money(r.price_tiers[0].price_minor, sym)}
            <span className="muted"> +{r.price_tiers.length - 1}</span>
          </span>
        ) : (
          money(r.price_minor, sym)
        ),
    },
    {
      key: "status",
      label: "Status",
      width: compact ? "150px" : "182px",
      sortable: true,
      render: (r) => (
        <span className="cell-status">
          <StatusDot availability={statusOf(r.status)} />
          {r.status}
        </span>
      ),
    },
    {
      key: "qty",
      label: "Qty",
      width: compact ? "60px" : "76px",
      sortable: true,
      align: "right",
      className: "num",
      render: (r) => (
        <span title={r.qty_basis === "minimum" ? "At least this many" : r.qty_basis === "confirmed" ? "Confirmed" : "Reported, not confirmed"} className={cx(r.qty === 0 && "muted")}>
          {qtyText(r.qty, r.qty_basis)}
          {r.qty_basis === "confirmed" && <I.Check size={11} className="qty-check" />}
        </span>
      ),
    },
  ];
  if (app.showPrivate && !compact) {
    columns.push(
      { key: "supplier", label: "Supplier", width: "136px", sortable: true, className: "private-col", render: (r) => r.supplier ?? <span className="muted">Not mapped</span> },
      {
        key: "cost",
        label: "Cost",
        width: "94px",
        sortable: true,
        align: "right",
        className: "num private-col",
        render: (r) => (r.cost_tiers?.length ? <span>{money(r.cost_tiers[0].cost_minor, sym)}<span className="muted"> +{r.cost_tiers.length - 1}</span></span> : money(r.cost_minor, sym)),
      },
      {
        key: "margin",
        label: "Margin",
        width: "84px",
        sortable: true,
        align: "right",
        className: "num private-col",
        render: (r) => {
          if (r.cost_minor == null || r.price_minor == null) return null;
          const m = r.price_minor - r.cost_minor;
          return <span className={cx(m < (c?.min_margin_minor ?? 100) && "negative")}>{money(m, sym)}</span>;
        },
      },
    );
  }
  columns.push({
    key: "link",
    label: "",
    width: "36px",
    align: "center",
    render: (r) =>
      r.link ? (
        <a className="row-link" href={r.link} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} title="Open listing" aria-label={`Open listing for ${r.code}`}>
          <I.External size={13} />
        </a>
      ) : null,
  });

  const filtersActive = q || statuses.size || category || supplier !== null || attention !== "all" || archived;
  const clearFilters = () => {
    setQ("");
    setStatuses(new Set());
    setCategory(null);
    setSupplier(null);
    setAttention("all");
    setArchived(false);
  };

  const bulk = async (patch: Record<string, unknown>, note: string) => {
    try {
      const res = await api<{ changed: number }>("/api/items/bulk", { body: { ids: [...selected], patch, note } });
      toast({ text: `${plural(res.changed, "product")} updated` });
      setSelected(new Set());
      await load();
      app.refreshMeta();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };

  const onSaved = (row: Partial<ItemRow> & { id: number }) => {
    setRows((rs) => rs && rs.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
    load().catch(() => {});
    app.refreshMeta();
  };

  if (!c) return null;
  return (
    <div className={cx("page catalogue", itemId !== undefined && "with-inspector")}>
      <div className="catalogue-main">
        <header className="toolbar">
          <div className="toolbar-title">
            <h1>{c.name}</h1>
            <div className="subtitle">
              {plural(c.count, "product")} · Prices in {c.currency} · {c.markup_bp / 100}% markup, minimum {money(c.min_margin_minor, c.symbol)}
            </div>
          </div>
          <div className="toolbar-actions">
            <div className="search-field">
              <I.Search size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${c.key} products`} aria-label="Filter products" />
              {q && (
                <button className="icon-btn" onClick={() => setQ("")} aria-label="Clear filter">
                  <I.Close size={12} />
                </button>
              )}
            </div>
            <Button variant="primary" icon={<I.Plus size={14} />} onClick={() => setCreating(true)}>
              New product
            </Button>
          </div>
        </header>
        <div className="filterbar">
          <Menu label={statuses.size ? `Status · ${statuses.size}` : "Status"} active={statuses.size > 0}>
            {() => (
              <>
                {app.meta!.statuses.map((s) => (
                  <MenuItem
                    key={s.name}
                    checked={statuses.has(s.name)}
                    onClick={() =>
                      setStatuses((cur) => {
                        const n = new Set(cur);
                        n.has(s.name) ? n.delete(s.name) : n.add(s.name);
                        return n;
                      })
                    }
                  >
                    <StatusDot availability={s.availability} /> {s.name}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
          <Menu label={category ?? "Category"} active={!!category}>
            {(close) => (
              <>
                <MenuItem checked={!category} onClick={() => (setCategory(null), close())}>
                  All categories
                </MenuItem>
                {c.categories.map((cat) => (
                  <MenuItem key={cat} checked={category === cat} onClick={() => (setCategory(cat), close())}>
                    {cat}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
          {app.showPrivate && (
            <Menu label={supplier === null ? "Supplier" : supplier === "none" ? "No supplier" : app.meta!.suppliers?.find((s) => s.id === supplier)?.name ?? "Supplier"} active={supplier !== null}>
              {(close) => (
                <>
                  <MenuItem checked={supplier === null} onClick={() => (setSupplier(null), close())}>
                    All suppliers
                  </MenuItem>
                  <MenuItem checked={supplier === "none"} onClick={() => (setSupplier("none"), close())}>
                    No supplier mapped
                  </MenuItem>
                  {app.meta!.suppliers?.map((s) => (
                    <MenuItem key={s.id} checked={supplier === s.id} onClick={() => (setSupplier(s.id), close())}>
                      {s.name}
                    </MenuItem>
                  ))}
                </>
              )}
            </Menu>
          )}
          <Menu label={{ all: "Attention", blocker: "Held back", warning: "Needs a decision", clear: "No open issues" }[attention]} active={attention !== "all"}>
            {(close) => (
              <>
                {(
                  [
                    ["all", "All products"],
                    ["blocker", "Held back from exports"],
                    ["warning", "Needs a decision"],
                    ["clear", "No open issues"],
                  ] as [Attention, string][]
                ).map(([k, label]) => (
                  <MenuItem key={k} checked={attention === k} onClick={() => (setAttention(k), close())}>
                    {label}
                  </MenuItem>
                ))}
                <div className="menu-sep" />
                <MenuItem checked={archived} onClick={() => setArchived((a) => !a)}>
                  Include archived
                </MenuItem>
              </>
            )}
          </Menu>
          <div className="filterbar-count">
            {rows && (filtersActive ? `${num(filtered.length)} of ${num(rows.length)}` : plural(rows.length, "product"))}
            {filtersActive ? (
              <button className="link-btn" onClick={clearFilters}>
                Clear
              </button>
            ) : null}
          </div>
        </div>
        {rows === null ? (
          <div className="center-fill">
            <Spinner />
          </div>
        ) : (
          <VirtualTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.id}
            activeId={itemId}
            onActivate={open}
            onSpace={(r) => toggleSel(r.id)}
            rowClass={(r) => cx(statusOf(r.status) === "unavailable" && "row-dim", selected.has(r.id) && "row-selected")}
            sort={sort}
            onSort={(key) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }))}
            empty={<span className="muted">No products match these filters.</span>}
          />
        )}
        {selected.size > 0 && (
          <div className="bulkbar" role="toolbar" aria-label="Bulk changes">
            <span className="bulkbar-count">{plural(selected.size, "product")} selected</span>
            <Menu label="Set status">
              {(close) => (
                <>
                  {app.meta!.statuses.map((s) => (
                    <MenuItem key={s.name} onClick={() => (close(), bulk({ status: s.name }, `Status set to ${s.name}`))}>
                      <StatusDot availability={s.availability} /> {s.name}
                    </MenuItem>
                  ))}
                </>
              )}
            </Menu>
            <Menu label="Quantity basis">
              {(close) => (
                <>
                  <MenuItem onClick={() => (close(), bulk({ qty_basis: "confirmed" }, "Quantities confirmed"))}>Confirmed</MenuItem>
                  <MenuItem onClick={() => (close(), bulk({ qty_basis: "minimum" }, "Quantities marked as minimum"))}>Minimum (shown with +)</MenuItem>
                  <MenuItem onClick={() => (close(), bulk({ qty_basis: "reported" }, "Quantities marked as reported"))}>Reported</MenuItem>
                </>
              )}
            </Menu>
            <Button size="sm" variant="plain" icon={<I.Archive size={13} />} onClick={() => bulk({ archived: !archived }, archived ? "Restored" : "Archived")}>
              {archived ? "Restore" : "Archive"}
            </Button>
            <Button size="sm" variant="plain" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}
      </div>
      {itemId !== undefined && <Inspector key={itemId} itemId={itemId} country={c} onClose={close} onSaved={onSaved} />}
      {creating && (
        <NewProductDialog
          countryKey={c.key}
          categories={c.categories}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            load().then(() => app.go({ view: "catalogue", country, id }));
            app.refreshMeta();
          }}
        />
      )}
    </div>
  );
}

function NewProductDialog({ countryKey, categories, onClose, onCreated }: { countryKey: string; categories: string[]; onClose: () => void; onCreated: (id: number) => void }) {
  const app = useApp();
  const toast = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "");
  const [status, setStatus] = useState("Available on demand");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const item = await api<{ id: number; code: string }>("/api/items" + qs({ private: app.showPrivate }), { body: { country: countryKey, name, category, status } });
      toast({ text: `${item.code} created. Add its link, quantity, supplier and cost next.` });
      onCreated(item.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="New product"
      onClose={onClose}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy || !name.trim() || !category.trim()}>
            Create product
          </Button>
        </>
      }
    >
      <p className="dialog-note">The next {countryKey} code is issued automatically and can never be reused.</p>
      <Field label="Product name" error={error}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && submit()} />
      </Field>
      <Field label="Category">
        <input className="input" list="new-categories" value={category} onChange={(e) => setCategory(e.target.value)} />
        <datalist id="new-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Status">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {app.meta!.statuses.map((s) => (
            <option key={s.name}>{s.name}</option>
          ))}
        </select>
      </Field>
    </Dialog>
  );
}
