import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../ui";

export interface Column<T> {
  key: string;
  label: ReactNode;
  width: string;
  align?: "right" | "center";
  sortable?: boolean;
  className?: string;
  render: (row: T) => ReactNode;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => number;
  activeId?: number;
  onActivate: (row: T) => void;
  rowClass?: (row: T) => string | undefined;
  sort?: { key: string; dir: 1 | -1 };
  onSort?: (key: string) => void;
  rowHeight?: number;
  empty?: ReactNode;
  onSpace?: (row: T) => void;
}

export default function VirtualTable<T>({ rows, columns, rowKey, activeId, onActivate, rowClass, sort, onSort, rowHeight = 40, empty, onSpace }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(800);
  const template = columns.map((c) => c.width).join(" ");
  const HEADER = 34;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Keep the active row visible when it changes (keyboard, search or deep link).
  useEffect(() => {
    const el = ref.current;
    if (!el || activeId === undefined) return;
    const idx = rows.findIndex((r) => rowKey(r) === activeId);
    if (idx < 0) return;
    const top = idx * rowHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowHeight > el.scrollTop + el.clientHeight - HEADER) el.scrollTop = top + rowHeight - el.clientHeight + HEADER;
  }, [activeId, rows, rowKey, rowHeight]);

  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - 10);
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / rowHeight) + 10);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!rows.length || (e.target as HTMLElement).tagName === "INPUT") return;
    const idx = Math.max(0, rows.findIndex((r) => rowKey(r) === activeId));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? Math.min(rows.length - 1, activeId === undefined ? 0 : idx + 1) : Math.max(0, idx - 1);
      onActivate(rows[next]);
    } else if (e.key === " " && onSpace && activeId !== undefined) {
      e.preventDefault();
      onSpace(rows[idx]);
    }
  };

  return (
    <div className="vtable" ref={ref} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} tabIndex={0} onKeyDown={onKeyDown} role="grid" aria-rowcount={rows.length}>
      <div className="vt-head" style={{ gridTemplateColumns: template }} role="row">
        {columns.map((c) => (
          <div
            key={c.key}
            role="columnheader"
            className={cx("vt-th", c.align === "right" && "right", c.align === "center" && "center", c.sortable && "sortable", c.className)}
            onClick={() => c.sortable && onSort?.(c.key)}
            aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
          >
            {c.label}
            {sort?.key === c.key && <span className="sort-arrow">{sort.dir === 1 ? "↑" : "↓"}</span>}
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="vt-empty">{empty}</div>
      ) : (
        <div style={{ height: rows.length * rowHeight, position: "relative" }}>
          {rows.slice(first, last).map((row, i) => {
            const id = rowKey(row);
            return (
              <div
                key={id}
                role="row"
                className={cx("vt-row", id === activeId && "active", rowClass?.(row))}
                style={{ gridTemplateColumns: template, top: (first + i) * rowHeight, height: rowHeight }}
                onClick={() => onActivate(row)}
              >
                {columns.map((c) => (
                  <div key={c.key} role="gridcell" className={cx("vt-td", c.align === "right" && "right", c.align === "center" && "center", c.className)}>
                    {c.render(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
