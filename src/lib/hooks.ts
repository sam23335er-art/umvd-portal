import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "../context/ToastContext";
import { ApiError } from "./api";

/**
 * Выполнение действия с сервером: индикатор, уведомление об успехе/ошибке,
 * ошибки по полям формы и обновление связанных данных.
 */
export function useAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  opts: { success?: string | ((r: R) => string); invalidate?: string[][]; onDone?: (r: R) => void } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      setFieldErrors({});
      try {
        const r = await fn(...args);
        if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r) : opts.success);
        for (const key of opts.invalidate ?? []) await qc.invalidateQueries({ queryKey: key });
        opts.onDone?.(r);
        return r;
      } catch (e) {
        if (e instanceof ApiError) setFieldErrors(e.fields);
        toast.error(e);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, qc, toast],
  );
  return { run, pending, fieldErrors, setFieldErrors };
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Состояние формы с типизированными полями. */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const set = <K extends keyof T>(k: K) => (e: { target: { value: string } } | T[K]) =>
    setValues((v) => ({ ...v, [k]: typeof e === "object" && e !== null && "target" in (e as object) ? (e as { target: { value: string } }).target.value : e }));
  return { values, setValues, set };
}
