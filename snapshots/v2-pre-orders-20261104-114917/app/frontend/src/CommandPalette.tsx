import { useEffect, useRef, useState } from "react";
import { api, qs } from "./api";
import { money } from "./format";
import * as I from "./icons";
import { useApp } from "./store";
import { cx, StatusDot } from "./ui";

interface Hit {
  id: number;
  code: string;
  country: string;
  name: string;
  variant: string | null;
  status: string;
  price_minor: number | null;
  symbol: string;
  archived: boolean;
  supplier?: string | null;
}

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const { go, showPrivate, status } = useApp();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      api<Hit[]>("/api/search" + qs({ q, private: showPrivate }))
        .then((h) => live && (setHits(h), setSel(0)))
        .catch(() => {});
    }, 90);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, showPrivate]);

  const open = (h: Hit) => {
    go({ view: "catalogue", country: h.country, id: h.id });
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && hits[sel]) open(hits[sel]);
  };

  return (
    <div className="overlay overlay-top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Search all catalogues">
        <div className="palette-input">
          <I.Search size={17} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={showPrivate ? "Code, product, item ID, SKU or supplier" : "Code or product name"} aria-label="Search" />
          <kbd>Esc</kbd>
        </div>
        {hits.length > 0 && (
          <div className="palette-results" role="listbox">
            {hits.map((h, i) => (
              <button key={h.id} role="option" aria-selected={i === sel} className={cx("palette-row", i === sel && "sel")} onMouseEnter={() => setSel(i)} onClick={() => open(h)}>
                <span className="mono palette-code">{h.code}</span>
                <span className="palette-name">
                  {h.name}
                  {h.variant && <span className="muted">, {h.variant}</span>}
                  {h.archived && <span className="tag">Archived</span>}
                </span>
                {showPrivate && h.supplier && <span className="palette-supplier private-ink">{h.supplier}</span>}
                <span className="palette-status">
                  <StatusDot availability={status(h.status)?.availability} />
                </span>
                <span className="palette-price num">{money(h.price_minor, h.symbol)}</span>
              </button>
            ))}
          </div>
        )}
        {q.trim() && hits.length === 0 && <div className="palette-empty">No matches</div>}
      </div>
    </div>
  );
}
