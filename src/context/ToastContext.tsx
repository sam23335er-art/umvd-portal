import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { ApiError } from "../lib/api";

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
type Ctx = { success: (t: string) => void; error: (e: unknown) => void; info: (t: string) => void };

const ToastContext = createContext<Ctx | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++seq;
    setItems((x) => [...x.slice(-3), { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "error" ? 7000 : 4000);
  }, []);
  const ctx: Ctx = {
    success: (t) => push("success", t),
    info: (t) => push("info", t),
    error: (e) => push("error", e instanceof ApiError || e instanceof Error ? e.message : String(e)),
  };
  const icon = { success: CheckCircle2, error: TriangleAlert, info: Info };
  const tone = { success: "text-ok", error: "text-bad", info: "text-info" };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => {
          const Icon = icon[t.kind];
          return (
            <div key={t.id} className="panel pointer-events-auto flex items-start gap-3 px-4 py-3 shadow-pop" style={{ animation: "toast-in .2s ease-out" }}>
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone[t.kind]}`} />
              <p className="flex-1 text-sm text-ink">{t.text}</p>
              <button className="text-muted hover:text-ink" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))} aria-label="Закрыть">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast вне ToastProvider");
  return ctx;
}
