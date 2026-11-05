import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as I from "./icons";
import type { Availability } from "./types";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "plain" | "danger"; size?: "sm" | "md"; icon?: ReactNode };
export function Button({ variant = "secondary", size = "md", icon, className, children, ...rest }: BtnProps) {
  return (
    <button className={cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)} {...rest}>
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export function Field({ label, hint, error, children, inline }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; inline?: boolean }) {
  const id = useId();
  return (
    <div className={cx("field", inline && "field-inline")}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="field-control" id={id}>
        {children}
      </div>
      {error ? <div className="field-error">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className={cx("segmented", size === "sm" && "segmented-sm")} role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} title={o.title} className={cx("segment", o.value === value && "on")} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={cx("switch", checked && "on")} onClick={() => onChange(!checked)}>
      <span className="switch-knob" />
    </button>
  );
}

export function StatusDot({ availability }: { availability: Availability | undefined }) {
  return <span className={cx("dot", availability && `dot-${availability}`)} />;
}

export function SeverityIcon({ severity, size = 14 }: { severity: "blocker" | "warning" | "info"; size?: number }) {
  if (severity === "info") return <I.Info size={size} className="sev-info" />;
  return <I.Alert size={size} className={severity === "blocker" ? "sev-blocker" : "sev-warning"} />;
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

export function Dialog({ title, children, onClose, footer, width = 520 }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, textarea, select, button.btn-primary")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} style={{ width }} ref={ref}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <I.Close />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- toasts */

interface Toast {
  id: number;
  text: string;
  tone?: "error" | "default";
  action?: { label: string; run: () => void };
}
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.tone === "error" ? 8000 : t.action ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx("toast", t.tone === "error" && "toast-error")}>
            <span>{t.text}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.run();
                  setToasts((ts) => ts.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------------------------------------------------------- popover menu */

export function Menu({ label, children, align = "left", active }: { label: ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right"; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className={cx("filter-btn", (open || active) && "on")} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label}
        <I.ChevronDown size={12} />
      </button>
      {open && <div className={cx("menu", align === "right" && "menu-right")}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function MenuItem({ children, onClick, checked, disabled }: { children: ReactNode; onClick: () => void; checked?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className="menu-item" onClick={onClick} disabled={disabled}>
      <span className="menu-check">{checked && <I.Check size={13} />}</span>
      {children}
    </button>
  );
}
