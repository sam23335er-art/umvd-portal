/**
 * Хранилище на сервере: Postgres (Neon / Vercel Postgres / Supabase — любой).
 * Все данные портала — одна JSON-строка с номером ревизии (защита от одновременной записи),
 * картинки — отдельная таблица, чтобы не грузить их на каждый запрос.
 */
import pg from "pg";
import { hashPassword, seedDatabase, StoreConflict, type Store } from "../src/local/routes";
import type { DB } from "../src/local/db";

let pool: pg.Pool | null = null;
let ready: Promise<void> | null = null;

export function dbUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
}

function getPool() {
  if (!pool) {
    const url = dbUrl();
    const local = /localhost|127\.0\.0\.1/.test(url);
    pool = new pg.Pool({ connectionString: url, max: 3, ssl: local ? false : { rejectUnauthorized: false }, idleTimeoutMillis: 10_000 });
  }
  return pool;
}

async function init() {
  const p = getPool();
  await p.query(`CREATE TABLE IF NOT EXISTS umvd_store (id int PRIMARY KEY, rev int NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  await p.query(`CREATE TABLE IF NOT EXISTS umvd_assets (key text PRIMARY KEY, mime text NOT NULL, data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  const { rowCount } = await p.query(`SELECT 1 FROM umvd_store WHERE id = 1`);
  if (!rowCount) {
    // Первый запуск: создаём портал. Пароль владельца можно задать переменной OWNER_PASSWORD.
    const seed = seedDatabase(process.env.OWNER_PASSWORD ? await hashPassword(process.env.OWNER_PASSWORD) : undefined);
    await p.query(`INSERT INTO umvd_store (id, rev, data) VALUES (1, 1, $1) ON CONFLICT (id) DO NOTHING`, [JSON.stringify(seed)]);
  }
}

export function createPgStore(): Store {
  ready ??= init().catch((e) => {
    ready = null;
    throw e;
  });
  let rev = 0;
  return {
    kind: "server",
    async load() {
      await ready;
      const { rows } = await getPool().query(`SELECT rev, data FROM umvd_store WHERE id = 1`);
      rev = rows[0].rev;
      return rows[0].data as DB;
    },
    async save(db) {
      const r = await getPool().query(`UPDATE umvd_store SET data = $1, rev = rev + 1, updated_at = now() WHERE id = 1 AND rev = $2`, [JSON.stringify(db), rev]);
      if (r.rowCount === 0) throw new StoreConflict();
      rev += 1;
    },
    async putAsset(key, dataUrl) {
      const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
      if (!m) throw new Error("Некорректное изображение");
      const safe = key.replace(/[^a-z0-9-]/gi, "");
      await getPool().query(`INSERT INTO umvd_assets (key, mime, data) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET mime = $2, data = $3`, [safe, m[1], Buffer.from(m[2], "base64")]);
      return `/api/assets/${safe}`;
    },
    async deleteAsset(url) {
      if (!url?.startsWith("/api/assets/")) return;
      await getPool().query(`DELETE FROM umvd_assets WHERE key = $1`, [url.slice("/api/assets/".length)]);
    },
  };
}

export async function getAsset(key: string) {
  await (ready ??= init());
  const { rows } = await getPool().query(`SELECT mime, data FROM umvd_assets WHERE key = $1`, [key.replace(/[^a-z0-9-]/gi, "")]);
  return rows[0] as { mime: string; data: Buffer } | undefined;
}
