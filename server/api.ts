/**
 * Серверная функция Vercel: все запросы /api/* портала.
 * Проверка прав выполняется здесь, на сервере, — изменить данные в обход нельзя.
 * Собирается в один файл api/index.js командой `npm run build:api`.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { handle, HttpError } from "../src/local/routes";
import { createPgStore, dbUrl, getAsset } from "./pgStore";

type Req = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };

// Простое ограничение частоты запросов входа/регистрации (на один экземпляр функции)
const hits = new Map<string, number[]>();
function rateLimited(key: string, limit: number, windowMs: number) {
  const t = Date.now();
  const arr = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
  arr.push(t);
  hits.set(key, arr);
  return arr.length > limit;
}

async function readBody(req: Req): Promise<unknown> {
  if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body || "null") : req.body;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const ch of req) {
    size += ch.length;
    if (size > 8_000_000) throw new HttpError(413, "Слишком большой запрос");
    chunks.push(ch as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

function send(res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

export default async function handler(req: Req, res: ServerResponse) {
  // Путь: из параметра перезаписи (vercel.json) или из адреса запроса
  const url = new URL(req.url ?? "/", "http://x");
  const rewritten = url.searchParams.get("__path");
  url.searchParams.delete("__path");
  const path = "/" + (rewritten ?? url.pathname.replace(/^\/api\/?/, "")).replace(/^\/+/, "");
  const method = (req.method ?? "GET").toUpperCase();

  try {
    if (path === "/health") return send(res, 200, { app: "umvd-portal", ok: true, database: Boolean(dbUrl()) });
    if (!dbUrl()) {
      return send(res, 503, { error: "База данных не подключена. В Vercel откройте проект → Storage → Create Database (Neon Postgres) → Connect, затем Redeploy." });
    }
    if (method === "GET" && path.startsWith("/assets/")) {
      const a = await getAsset(path.slice(8));
      if (!a) return send(res, 404, { error: "Файл не найден" });
      res.statusCode = 200;
      res.setHeader("Content-Type", a.mime);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.end(a.data);
    }

    const ip = String(req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "—").split(",")[0].trim();
    if (method === "POST" && (path === "/auth/login" || path === "/auth/register")) {
      if (rateLimited(`${path}:${ip}`, path === "/auth/login" ? 20 : 10, 15 * 60_000)) {
        return send(res, 429, { error: "Слишком много попыток. Повторите через 15 минут." });
      }
    }

    const body = method === "GET" ? undefined : await readBody(req);
    const auth = String(req.headers.authorization ?? "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const r = await handle({ method, url: path + (url.search || ""), body, token, userAgent: String(req.headers["user-agent"] ?? ""), ip }, createPgStore());
    const headers: Record<string, string> = {};
    if (r.session !== undefined) headers["x-umvd-session"] = r.session ?? "clear";
    return send(res, 200, r.data, headers);
  } catch (e) {
    if (e instanceof HttpError) {
      return send(res, e.status, { error: e.message, ...(e.details ? { details: e.details } : {}) });
    }
    if (e instanceof SyntaxError) return send(res, 400, { error: "Некорректный JSON в запросе" });
    console.error(e);
    const msg = String((e as Error)?.message ?? e);
    if (/ECONNREFUSED|ENOTFOUND|password authentication|does not exist/.test(msg)) {
      return send(res, 503, { error: "Нет подключения к базе данных. Проверьте подключение Neon в настройках проекта Vercel (Storage)." });
    }
    return send(res, 500, { error: "Внутренняя ошибка сервера" });
  }
}
