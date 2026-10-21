/** Автономный режим: данные в localStorage этого браузера (файл, открытый с диска). */
import type { Store } from "./core";
import type { DB } from "./db";
import { seedDatabase } from "./seed";

export const STORAGE_KEY = "umvd-portal-db-v1";
export const SESSION_KEY = "umvd-portal-session";

let cache: DB | null = null;

function read(): DB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed?.schemaVersion === 1 && Array.isArray(parsed.users)) return parsed;
    }
  } catch {
    /* хранилище недоступно или повреждено — создаём заново */
  }
  const fresh = seedDatabase();
  write(fresh);
  return fresh;
}
function write(db: DB) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    throw new Error("Недостаточно места в хранилище браузера. Удалите загруженные фоны или сделайте копию данных и сброс. " + String(e));
  }
}

export const localStore: Store = {
  kind: "local",
  async load() {
    cache ??= read();
    return structuredClone(cache);
  },
  async save(db) {
    write(db);
    cache = db;
  },
  async putAsset(_key, dataUrl) {
    return dataUrl; // в автономном режиме картинка хранится прямо в данных
  },
  async deleteAsset() {},
};

/** Перечитать данные (их изменили в другой вкладке). */
export function reloadLocal() {
  cache = null;
}
