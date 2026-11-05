import * as I from "./icons";
import { num } from "./format";
import { href, useApp, type Route } from "./store";
import { cx, Switch } from "./ui";

function NavItem({ to, icon, label, count, active, tone }: { to: Route; icon?: React.ReactNode; label: string; count?: React.ReactNode; active: boolean; tone?: "blocker" }) {
  return (
    <a href={href(to)} className={cx("nav-item", active && "active")} aria-current={active ? "page" : undefined}>
      {icon && <span className="nav-icon">{icon}</span>}
      <span className="nav-label">{label}</span>
      {count !== undefined && <span className={cx("nav-count", tone === "blocker" && "nav-count-alert")}>{count}</span>}
    </a>
  );
}

export default function Sidebar({ onSearch }: { onSearch: () => void }) {
  const { meta, route, showPrivate, setShowPrivate } = useApp();
  if (!meta) return null;
  const blockers = meta.review.blocker ?? 0;
  const open = (meta.review.blocker ?? 0) + (meta.review.warning ?? 0);
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand">
        <span className="brand-name">{meta.settings.company?.replace(/ Ltd$/, "") || "Ravisn"}</span>
        <span className="brand-sub">Ltd</span>
      </div>
      <button className="search-trigger" onClick={onSearch}>
        <I.Search size={14} />
        <span>Search</span>
        <kbd>Ctrl K</kbd>
      </button>

      <div className="nav-section">Catalogues</div>
      {meta.countries.map((c) => (
        <NavItem key={c.key} to={{ view: "catalogue", country: c.key }} label={c.name} count={num(c.count)} active={route.view === "catalogue" && route.country === c.key} />
      ))}

      <div className="nav-section">Manage</div>
      <NavItem to={{ view: "suppliers" }} icon={<I.People size={15} />} label="Suppliers" active={route.view === "suppliers"} count={showPrivate ? undefined : <I.Lock size={12} />} />
      <NavItem to={{ view: "review" }} icon={<I.Inbox size={15} />} label="Review" active={route.view === "review"} count={blockers ? num(blockers) : open ? num(open) : undefined} tone={blockers ? "blocker" : undefined} />
      <NavItem to={{ view: "exports" }} icon={<I.Upload size={15} />} label="Exports" active={route.view === "exports"} />

      <div className="sidebar-foot">
        <NavItem to={{ view: "settings" }} icon={<I.Gear size={15} />} label="Settings" active={route.view === "settings"} />
        <div className="private-toggle" title="Hide supplier names, costs and contacts, for example while sharing your screen">
          <span className="nav-icon">{showPrivate ? <I.Unlock size={15} /> : <I.Lock size={15} />}</span>
          <span className="nav-label">Private data</span>
          <Switch checked={showPrivate} onChange={setShowPrivate} label="Show private data" />
        </div>
        <div className="local-note">
          <I.Shield size={12} /> Local only · {meta.version}
        </div>
      </div>
    </nav>
  );
}
