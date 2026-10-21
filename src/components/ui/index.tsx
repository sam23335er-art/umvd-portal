import { Loader2, Search, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Tone } from "../../lib/labels";

// ─────────── Бейджи ───────────
const toneClass: Record<Tone, string> = {
  neutral: "bg-muted/12 text-muted border-muted/25",
  primary: "bg-primary/12 text-primary border-primary/30",
  ok: "bg-ok/12 text-ok border-ok/30",
  warn: "bg-warn/12 text-warn border-warn/30",
  bad: "bg-bad/12 text-bad border-bad/30",
  info: "bg-info/12 text-info border-info/30",
  gold: "bg-gold/15 text-gold border-gold/35",
};
export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] font-medium leading-5 ${toneClass[tone]} ${className}`}>{children}</span>;
}
export function DictBadge({ dict, value }: { dict: Record<string, { label: string; tone: Tone }>; value: string }) {
  const d = dict[value] ?? { label: value, tone: "neutral" as Tone };
  return <Badge tone={d.tone}>{d.label}</Badge>;
}
export const DemoBadge = () => <Badge tone="gold">Демо</Badge>;

// ─────────── Панель ───────────
export function Panel({ children, className = "", title, actions, glow = true, pad = true }: {
  children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; glow?: boolean; pad?: boolean;
}) {
  return (
    <section className={`panel ${glow ? "glow" : ""} ${className}`}>
      {(title || actions) && (
        <header className="relative z-[1] flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          {typeof title === "string" ? <h2 className="h-section">{title}</h2> : title}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`relative z-[1] ${pad ? "p-4 sm:p-5" : ""}`}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} — УМВД | Кемерово RP`;
  }, [title]);
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        <h1 className="h-page">{title}</h1>
        {description && <p className="mt-1.5 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ─────────── Состояния ───────────
export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-primary ${className}`} aria-label="Загрузка" />;
}
export function Loading({ text = "Загрузка…" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted">
      <Spinner /> {text}
    </div>
  );
}
export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      {icon && <div className="mb-3 text-muted/70 [&_svg]:h-10 [&_svg]:w-10">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="rounded-panel border border-bad/30 bg-bad/8 px-4 py-6 text-center">
      <p className="font-medium text-bad">{error instanceof Error ? error.message : "Не удалось загрузить данные"}</p>
      {onRetry && <button className="btn-secondary btn-sm mt-3" onClick={onRetry}>Повторить</button>}
    </div>
  );
}

// ─────────── Поля форм ───────────
export function Field({ label, error, hint, children, required, className = "" }: {
  label: string; error?: string; hint?: string; children: (id: string) => ReactNode; required?: boolean; className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="text-bad"> *</span>}
      </label>
      {children(id)}
      {error ? <p className="mt-1 text-[12.5px] text-bad">{error}</p> : hint ? <p className="mt-1 text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };
export function TextInput({ label, error, hint, className, required, ...rest }: InputProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(id) => <input id={id} {...rest} required={required} aria-invalid={!!error} className={`input ${error ? "input-error" : ""}`} />}
    </Field>
  );
}
type AreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string };
export function TextArea({ label, error, hint, className, required, rows = 4, ...rest }: AreaProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(id) => <textarea id={id} rows={rows} {...rest} required={required} aria-invalid={!!error} className={`input resize-y ${error ? "input-error" : ""}`} />}
    </Field>
  );
}
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; options: { value: string; label: string }[]; placeholder?: string };
export function SelectInput({ label, error, options, placeholder, className, required, ...rest }: SelectProps) {
  return (
    <Field label={label} error={error} required={required} className={className}>
      {(id) => (
        <select id={id} {...rest} required={required} className={`input ${error ? "input-error" : ""}`}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </Field>
  );
}
export function Checkbox({ label, checked, onChange, hint, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-2.5 text-sm ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-primary))]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="text-ink">{label}</span>
        {hint && <span className="block text-[12.5px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function SearchBox({ value, onChange, placeholder = "Поиск…", className = "" }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input className="input pl-9 pr-8" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
      {value && (
        <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink" onClick={() => onChange("")} aria-label="Очистить">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function FilterSelect({ value, onChange, options, all = "Все", label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; all?: string; label: string }) {
  return (
    <select className="input w-auto min-w-[150px]" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{all}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-item border border-line bg-surface2/50 p-1" role="tablist">
      {items.map((i) => (
        <button
          key={i.value}
          role="tab"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          className={`rounded-[5px] px-3 py-1.5 text-sm transition-colors ${value === i.value ? "bg-primary text-primary-fg" : "text-muted hover:text-ink"}`}
        >
          {i.label}
          {i.count !== undefined && <span className="ml-1.5 opacity-70">{i.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ─────────── Модальное окно ───────────
export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input,textarea,select,button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`panel flex max-h-[92vh] w-full flex-col rounded-b-none shadow-pop sm:rounded-b-panel ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
        style={{ animation: "pop-in .16s ease-out", background: "rgb(var(--c-surface))" }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button className="btn-ghost btn-sm -mr-2" onClick={onClose} aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

// ─────────── Подтверждение опасных действий ───────────
type ConfirmOpts = { title: string; text: ReactNode; confirm?: string; danger?: boolean };
type ConfirmCtx = (o: ConfirmOpts) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmCtx | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback<ConfirmCtx>((o) => new Promise((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title ?? ""}
        footer={
          <>
            <button className="btn-secondary" onClick={() => close(false)}>Отмена</button>
            <button className={state?.danger ? "btn-danger" : "btn-primary"} onClick={() => close(true)}>{state?.confirm ?? "Подтвердить"}</button>
          </>
        }
      >
        <div className="text-sm text-ink">{state?.text}</div>
      </Modal>
    </ConfirmContext.Provider>
  );
}
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm вне ConfirmProvider");
  return ctx;
}

// ─────────── Карточка-показатель ───────────
export function Stat({ label, value, hint, icon, tone = "primary" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "primary" | "gold" | "ok" | "warn" | "bad" }) {
  const t = { primary: "text-primary", gold: "text-gold", ok: "text-ok", warn: "text-warn", bad: "text-bad" }[tone];
  return (
    <div className="panel glow px-4 py-3.5">
      <div className="relative z-[1] flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">{label}</p>
          <p className="mt-0.5 font-serif text-[1.9rem] font-bold leading-none text-ink">{value}</p>
          {hint && <p className="mt-1.5 text-[12.5px] text-muted">{hint}</p>}
        </div>
        {icon && <div className={`${t} opacity-80 [&_svg]:h-5 [&_svg]:w-5`}>{icon}</div>}
      </div>
    </div>
  );
}

/** Таблица с горизонтальной прокруткой на узких экранах. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto sm:-mx-5"><div className="min-w-full px-4 sm:px-5">{children}</div></div>;
}

export function SortHeader({ label, field, sort, onSort }: { label: string; field: string; sort: string; onSort: (f: string) => void }) {
  const active = sort === field || sort === `${field}_asc`;
  return (
    <button className={`inline-flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""}`} onClick={() => onSort(field)}>
      {label}
      <span className="text-[10px]">{active ? (sort.endsWith("_asc") ? "▲" : "▼") : "↕"}</span>
    </button>
  );
}
