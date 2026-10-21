/**
 * Ядро API портала: маршрутизация, контекст запроса, права, аудит.
 * Один и тот же код работает в двух местах:
 *  • на сервере Vercel (api/index.js) — данные в Postgres, общие для всех;
 *  • в браузере (файл с диска) — данные в localStorage этого браузера.
 * Где хранить данные, решает переданный Store.
 */
import { z } from "zod";
import { now, uid, type DB, type Role, type User } from "./db";
import { ALL_PERMISSIONS, type Permission } from "./permissions";

export class HttpError extends Error {
  /** commit = true: сохранить изменения (записи журналов), несмотря на ошибку. */
  commit = false;
  constructor(public status: number, message: string, public details?: { fields?: Record<string, string>; code?: string }) {
    super(message);
  }
}
/** Ошибка, при которой записи журнала (отказ, неудачный вход) всё равно сохраняются. */
export const logged = (e: HttpError) => ((e.commit = true), e);
export const badRequest = (m: string, fields?: Record<string, string>) => new HttpError(400, m, fields ? { fields } : undefined);
export const unauthorized = (m = "Требуется вход в систему") => new HttpError(401, m);
export const forbidden = (m = "Недостаточно прав для этой операции") => new HttpError(403, m);
export const notFound = (m = "Запись не найдена") => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);

/** Хранилище данных. Реализации: localStore (браузер) и pgStore (сервер). */
export interface Store {
  /** "local" — данные в браузере, "server" — общая база на сервере. */
  kind: "local" | "server";
  load(): Promise<DB>;
  /** Сохранить; бросает StoreConflict, если данные успели изменить параллельно. */
  save(db: DB): Promise<void>;
  /** Сохранить картинку (data URL) и вернуть адрес, по которому её показывать. */
  putAsset(key: string, dataUrl: string): Promise<string>;
  deleteAsset(url: string | null | undefined): Promise<void>;
}
export class StoreConflict extends Error {}

export type Request = { method: string; url: string; body?: unknown; token?: string | null; userAgent?: string; ip?: string };
export type Response = { data: unknown; session?: string | null };

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
export const hashToken = sha256;
export function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, (ch) => ({ "+": "-", "/": "_", "=": "" })[ch]!);
}

export type AuthUser = {
  id: string; login: string; nickname: string; role: Role; mustChangePassword: boolean; perms: Set<Permission>;
  employeeId: string | null; divisionId: string | null; sessionId: string;
};

export type Ctx = {
  db: DB;
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  user: AuthUser | null;
  store: Store;
  userAgent: string;
  ip: string;
  /** Установить новую сессию (токен) или null — завершить текущую у клиента. */
  session?: string | null;
};

type Handler = (c: Ctx) => unknown | Promise<unknown>;
const routes: { method: string; re: RegExp; keys: string[]; handler: Handler }[] = [];

export function route(method: string, pattern: string, handler: Handler) {
  const keys: string[] = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_m, k) => (keys.push(k), "([^/]+)")) + "$");
  routes.push({ method, re, keys, handler });
}

// ── Права ──
export function rolePermissions(db: DB, role: Role): Set<Permission> {
  if (role === "OWNER") return new Set(ALL_PERMISSIONS);
  return new Set(db.rolePermissions.filter((r) => r.role === role).map((r) => r.permission as Permission));
}
export function effectivePermissions(db: DB, userId: string, role: Role): Set<Permission> {
  const p = rolePermissions(db, role);
  if (role === "OWNER") return p;
  for (const g of db.userPermissions) if (g.userId === userId) p.add(g.permission as Permission);
  return p;
}

async function loadUser(db: DB, token: string | null | undefined): Promise<AuthUser | null> {
  if (!token || token.length < 20) return null;
  const h = await sha256(token);
  const s = db.sessions.find((x) => x.tokenHash === h);
  if (!s || s.revokedAt || s.expiresAt < now()) return null;
  const u = db.users.find((x) => x.id === s.userId);
  if (!u || u.status !== "ACTIVE") return null;
  const emp = db.employees.find((e) => e.userId === u.id);
  return { id: u.id, login: u.login, nickname: u.nickname, role: u.role, mustChangePassword: u.mustChangePassword, perms: effectivePermissions(db, u.id, u.role), employeeId: emp?.id ?? null, divisionId: emp?.divisionId ?? null, sessionId: s.id };
}

export function me(c: Ctx): AuthUser {
  if (!c.user) throw unauthorized();
  return c.user;
}
export function need(c: Ctx, ...perms: Permission[]) {
  const u = me(c);
  if (!perms.every((p) => u.perms.has(p))) throw forbidden();
  return u;
}
export function needAny(c: Ctx, ...perms: Permission[]) {
  const u = me(c);
  if (!perms.some((p) => u.perms.has(p))) throw forbidden();
  return u;
}
export const can = (c: Ctx, p: Permission) => !!c.user?.perms.has(p);
export const divisionScope = (u: AuthUser) => (u.role === "DIV_HEAD" ? u.divisionId ?? "__none__" : null);

// ── Журналы ──
export function audit(db: DB, actor: Pick<AuthUser, "id" | "nickname"> | null, action: string, entity: string, entityId: string | null, summary: string, opts: { critical?: boolean; meta?: unknown } = {}) {
  db.audit.unshift({ id: uid(), actorId: actor?.id ?? null, actorName: actor?.nickname ?? "Система", action, entity, entityId, summary, critical: !!opts.critical, meta: opts.meta, createdAt: now() });
  if (db.audit.length > 5000) db.audit.length = 5000;
}
export function notify(db: DB, userId: string, title: string, body: string, link?: string) {
  db.notifications.unshift({ id: uid(), userId, title, body, link: link ?? null, read: false, createdAt: now() });
}

// ── Валидация ──
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const i of r.error.issues) fields[i.path.join(".") || "_"] ??= i.message;
    throw badRequest("Проверьте правильность заполнения полей", fields);
  }
  return r.data;
}
export const q = (c: Ctx, k: string) => {
  const v = c.query.get(k);
  return v && v.trim() ? v.trim().slice(0, 100) : undefined;
};
export const has = (text: string | null | undefined, needle: string) => (text ?? "").toLowerCase().includes(needle.toLowerCase());
export const byDateDesc = <T>(key: keyof T) => (a: T, b: T) => String(b[key] ?? "").localeCompare(String(a[key] ?? ""));
export const byDateAsc = <T>(key: keyof T) => (a: T, b: T) => String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
export const findUser = (db: DB, id: string | null | undefined): User | undefined => (id ? db.users.find((u) => u.id === id) : undefined);

/** Подчистка разрастающихся журналов и старых сессий перед сохранением. */
function compact(db: DB) {
  if (db.loginAttempts.length > 2000) db.loginAttempts.length = 2000;
  if (db.notifications.length > 5000) db.notifications.length = 5000;
  const old = new Date(Date.now() - 7 * 86400_000).toISOString();
  db.sessions = db.sessions.filter((s) => !(s.revokedAt && s.revokedAt < old) && s.expiresAt > old);
}

/**
 * Выполнение запроса. Изменяющие запросы работают как транзакция: при ошибке
 * изменения не сохраняются (кроме записей журнала при отказе в доступе).
 * Если данные параллельно изменил другой пользователь — запрос повторяется.
 */
export async function handle(req: Request, store: Store): Promise<Response> {
  const u = new URL(req.url, "http://local");
  const path = u.pathname.replace(/^\/api/, "");
  const found = routes.find((r) => r.method === req.method && r.re.test(path));
  if (!found) throw new HttpError(404, "Метод API не найден");
  const m = path.match(found.re)!;
  const params: Record<string, string> = {};
  found.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
  const mutating = req.method !== "GET";

  for (let attempt = 0; ; attempt++) {
    const db = await store.load();
    const c: Ctx = { db, method: req.method, path, params, query: u.searchParams, body: req.body, user: await loadUser(db, req.token), store, userAgent: (req.userAgent ?? "").slice(0, 250), ip: req.ip ?? "—" };
    if (c.user?.mustChangePassword && !path.startsWith("/auth") && !path.startsWith("/public")) {
      throw new HttpError(403, "Необходимо сменить первоначальный пароль", { code: "PASSWORD_CHANGE_REQUIRED" });
    }
    try {
      let result: unknown;
      try {
        result = await found.handler(c);
      } catch (e) {
        if (mutating && e instanceof HttpError && e.commit) {
          compact(db);
          await store.save(db); // сохраняем только записи журнала, сделанные до отказа
        }
        throw e;
      }
      if (mutating) {
        compact(db);
        await store.save(db);
      }
      return { data: result === undefined ? { ok: true } : JSON.parse(JSON.stringify(result)), session: c.session };
    } catch (e) {
      if (e instanceof StoreConflict && attempt < 10) {
        await new Promise((r) => setTimeout(r, 15 + Math.random() * 60 * (attempt + 1))); // случайная пауза перед повтором
        continue;
      }
      if (e instanceof StoreConflict) throw new HttpError(409, "Данные одновременно изменил другой пользователь. Повторите действие.");
      throw e;
    }
  }
}
