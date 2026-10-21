/**
 * Клиент API портала. Режим выбирается автоматически:
 *  • «server» — сайт открыт с Vercel: запросы идут на /api, данные общие для всех;
 *  • «local»  — файл открыт с диска или сервер недоступен: всё работает в этом браузере.
 * Страницы портала не зависят от режима.
 */
import { handle, HttpError, localStore, SESSION_KEY } from "../local";

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string> = {}, public code?: string) {
    super(message);
  }
}

export type Mode = "server" | "local";
export const CHANGE_EVENT = "umvd:data-changed";

let modePromise: Promise<Mode> | null = null;
/** Есть ли рядом серверная часть портала (Vercel-функция /api). */
export function getMode(): Promise<Mode> {
  modePromise ??= (async () => {
    if (!location.protocol.startsWith("http")) return "local";
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      const j = await r.json();
      return j?.app === "umvd-portal" ? "server" : "local";
    } catch {
      return "local";
    }
  })();
  return modePromise;
}

const token = {
  get: () => { try { return localStorage.getItem(SESSION_KEY); } catch { return null; } },
  set: (v: string | null) => { try { v ? localStorage.setItem(SESSION_KEY, v) : localStorage.removeItem(SESSION_KEY); } catch { /* приватный режим */ } },
};

/** Картинка из формы → сжатый data URL (до maxSide пикселей), чтобы не гонять большие файлы. */
async function fileToDataUrl(file: File, maxSide: number): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new ApiError(400, "Допустимы только изображения PNG, JPEG или WebP");
  if (file.size > 15 * 1024 * 1024) throw new ApiError(400, "Файл больше 15 МБ");
  const bmp = await createImageBitmap(file).catch(() => { throw new ApiError(400, "Не удалось прочитать изображение"); });
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(maxSide <= 512 ? "image/png" : "image/jpeg", 0.82);
}

type Options = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal };

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET");
  let body = opts.body;
  if (opts.form) {
    const file = opts.form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Файл не выбран");
    body = { dataUrl: await fileToDataUrl(file, path.includes("/logo") ? 256 : 1920) };
  }
  const mode = await getMode();
  let data: unknown;
  let session: string | null | undefined;
  try {
    if (mode === "server") {
      let res: Response;
      try {
        const t = token.get();
        res = await fetch(`/api${path}`, {
          method,
          headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: opts.signal,
          cache: "no-store",
        });
      } catch {
        throw new ApiError(0, "Нет связи с сервером. Проверьте интернет и повторите.");
      }
      const s = res.headers.get("x-umvd-session");
      if (s) session = s === "clear" ? null : s;
      const json = (await res.json().catch(() => ({}))) as { error?: string; details?: { fields?: Record<string, string>; code?: string } };
      if (session !== undefined) token.set(session);
      if (!res.ok) throw new ApiError(res.status, json.error ?? `Ошибка ${res.status}`, json.details?.fields ?? {}, json.details?.code);
      data = json;
    } else {
      try {
        const r = await handle({ method, url: `/api${path}`, body, token: token.get(), userAgent: navigator.userAgent, ip: "этот браузер" }, localStore);
        data = r.data;
        session = r.session;
      } catch (e) {
        if (e instanceof HttpError) {
          if (e.commit) window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { settings: false } }));
          throw new ApiError(e.status, e.message, e.details?.fields ?? {}, e.details?.code);
        }
        console.error(e);
        throw new ApiError(500, e instanceof Error ? e.message : "Внутренняя ошибка");
      }
      if (session !== undefined) token.set(session);
    }
  } catch (e) {
    if (e instanceof ApiError && e.code === "PASSWORD_CHANGE_REQUIRED") window.dispatchEvent(new CustomEvent("umvd:password-change-required"));
    throw e;
  }
  if (method !== "GET") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { settings: /^\/admin\/(settings|data)/.test(path) } }));
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T = { ok: true; id?: string }>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body });
export const patch = <T = { ok: true }>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const put = <T = { ok: true }>(path: string, body: unknown) => api<T>(path, { method: "PUT", body });
export const del = <T = { ok: true }>(path: string) => api<T>(path, { method: "DELETE" });

export const qs = (params: Record<string, string | number | undefined | null | false>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
};
