/**
 * Проверка прав и тем на локальном API (раздел 30 ТЗ), без браузера.
 * Запуск: npx tsx --test tests/local.test.ts
 */
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

// ── Окружение браузера для Node ──
const store = new Map<string, string>();
Object.assign(globalThis, {
  window: Object.assign(new EventTarget(), { location: { hash: "" } }),
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) },
});
if (!(globalThis as { CustomEvent?: unknown }).CustomEvent) (globalThis as { CustomEvent: unknown }).CustomEvent = class extends Event { detail: unknown; constructor(t: string, o?: { detail?: unknown }) { super(t); this.detail = o?.detail; } };

const { handle, localStore, reloadLocal, STORAGE_KEY } = await import("../src/local/index.ts");

/** «Клиент» = отдельный пользователь со своей сессией. */
class Client {
  token: string | null = null;
  async req(method: string, path: string, body?: unknown) {
    try {
      const r = await handle({ method, url: `/api${path}`, body, token: this.token, userAgent: "test", ip: "test" }, localStore);
      if (r.session !== undefined) this.token = r.session;
      return { status: 200, data: r.data as Record<string, any> };
    } catch (e) {
      const err = e as { status?: number; message: string };
      return { status: err.status ?? 500, data: { error: err.message } as Record<string, any> };
    }
  }
  get = (p: string) => this.req("GET", p);
  post = (p: string, b: unknown = {}) => this.req("POST", p, b);
  put = (p: string, b: unknown) => this.req("PUT", p, b);
  patch = (p: string, b: unknown) => this.req("PATCH", p, b);
}

const owner = new Client();
const anon = () => new Client();
async function register(login: string) {
  const c = new Client();
  const r = await c.post("/auth/register", { login, nickname: `Nick_${login}`, password: "Passw0rd-123" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const me = (await c.get("/auth/me")).data.user;
  return { c, id: me.id as string, me };
}
const theme = async () => (await anon().get("/public/settings")).data.settings.activeTheme;

before(() => store.clear());

describe("Owner: первоначальная настройка", () => {
  test("SAMER создан при первом запуске и обязан сменить пароль", async () => {
    let r = await owner.post("/auth/login", { login: "SAMER", password: "1234samer1234", adminArea: true });
    assert.equal(r.status, 200);
    assert.equal(r.data.mustChangePassword, true);
    assert.equal((await owner.get("/admin/overview")).status, 403);
    r = await owner.post("/auth/change-password", { currentPassword: "1234samer1234", newPassword: "Owner-New-Pass-2026" });
    assert.equal(r.status, 200);
    assert.equal((await owner.get("/admin/overview")).status, 200);
  });
  test("Пароль не хранится в открытом виде", () => {
    assert.ok(!store.get(STORAGE_KEY)!.includes("1234samer1234"));
  });
});

describe("Темы оформления", () => {
  test("1–4. Owner применяет «Осень» — тема видна всем, в т.ч. в кабинете и админке", async () => {
    assert.equal((await owner.put("/admin/settings/theme", { theme: "autumn", confirm: true })).status, 200);
    assert.equal(await theme(), "autumn");
    const { c } = await register("viewer");
    assert.equal((await c.get("/public/settings")).data.settings.activeTheme, "autumn");
    assert.equal((await owner.get("/admin/settings")).data.settings.activeTheme, "autumn");
  });
  test("Недопустимая тема / без подтверждения / в обход — отклоняются", async () => {
    assert.equal((await owner.put("/admin/settings/theme", { theme: "neon", confirm: true })).status, 400);
    assert.equal((await owner.put("/admin/settings/theme", { theme: "summer" })).status, 400);
    assert.equal((await owner.patch("/admin/settings", { activeTheme: "summer" })).status, 400);
  });
  test("5. Тема сохраняется после перезагрузки страницы", async () => {
    reloadLocal();
    assert.equal(await theme(), "autumn");
  });
  test("6. Админ без design.manage не может применить тему, с правом — может", async () => {
    const a = await register("admin_nodesign");
    await owner.post(`/admin/access/users/${a.id}/admin`, { permissions: ["news.manage"], confirm: true });
    assert.equal((await a.c.put("/admin/settings/theme", { theme: "winter", confirm: true })).status, 403);
    assert.equal(await theme(), "autumn");
    const b = await register("admin_design");
    await owner.post(`/admin/access/users/${b.id}/admin`, { permissions: ["design.manage"], confirm: true });
    assert.equal((await b.c.put("/admin/settings/theme", { theme: "spring", confirm: true })).status, 200);
    await owner.put("/admin/settings/theme", { theme: "autumn", confirm: true });
  });
  test("7. Сотрудник не может изменить тему", async () => {
    const e = await register("employee_theme");
    await owner.patch(`/admin/access/users/${e.id}/role`, { role: "EMPLOYEE", confirm: true });
    assert.equal((await e.c.put("/admin/settings/theme", { theme: "winter", confirm: true })).status, 403);
    assert.equal((await e.c.patch("/admin/settings/effects", { effectsEnabled: false })).status, 403);
  });
});

describe("Администраторы", () => {
  let user: Awaited<ReturnType<typeof register>>;
  let ownerId = "";
  test("1. Регистрация даёт роль USER, передать роль нельзя", async () => {
    user = await register("plain_user");
    assert.equal(user.me.role, "USER");
    assert.equal((await anon().post("/auth/register", { login: "sneaky", nickname: "Sneaky", password: "Passw0rd-123", role: "ADMIN" })).status, 400);
    ownerId = (await owner.get("/auth/me")).data.user.id;
  });
  test("2. Пользователь не может назначить себе Admin/Owner", async () => {
    assert.equal((await user.c.post(`/admin/access/users/${user.id}/admin`, { permissions: ["admins.manage"], confirm: true })).status, 403);
    assert.equal((await user.c.patch(`/admin/access/users/${user.id}/role`, { role: "OWNER", confirm: true })).status, 403);
    assert.equal((await user.c.put(`/admin/access/roles/USER`, { permissions: ["admin.access"] })).status, 403);
    assert.equal((await user.c.get("/auth/me")).data.user.role, "USER");
  });
  test("3–5. Owner находит и назначает администратора с ограниченными правами", async () => {
    assert.equal((await owner.get("/admin/access/users?q=plain_user")).data.items.length, 1);
    assert.equal((await owner.post(`/admin/access/users/${user.id}/admin`, { permissions: ["news.manage"] })).status, 400, "без подтверждения");
    assert.equal((await owner.post(`/admin/access/users/${user.id}/admin`, { permissions: ["news.manage", "audit.view"], confirm: true })).status, 200);
    const me = (await user.c.get("/auth/me")).data.user;
    assert.equal(me.role, "ADMIN");
    assert.ok(me.permissions.includes("news.manage") && !me.permissions.includes("design.manage"));
    assert.equal((await user.c.post("/news", { title: "Тестовая новость", body: "Текст тестовой новости", category: "NEWS" })).status, 200);
    assert.equal((await user.c.get("/admin/security/sessions")).status, 403);
  });
  test("6–7. Admin без права не назначает админов и не повышает себя", async () => {
    const other = await register("other_user");
    assert.equal((await user.c.post(`/admin/access/users/${other.id}/admin`, { permissions: ["news.manage"], confirm: true })).status, 403);
    assert.equal((await user.c.patch(`/admin/access/users/${user.id}/role`, { role: "OWNER", confirm: true })).status, 403);
    assert.equal((await user.c.post(`/admin/access/users/${user.id}/admin`, { permissions: ["design.manage"], confirm: true })).status, 403);
  });
  test("29.3. Admin с admins.manage — только в пределах своих прав", async () => {
    const m = await register("admin_manager");
    await owner.post(`/admin/access/users/${m.id}/admin`, { permissions: ["admins.manage", "news.manage"], confirm: true });
    const t = await register("managed_user");
    assert.equal((await m.c.post(`/admin/access/users/${t.id}/admin`, { permissions: ["news.manage"], confirm: true })).status, 200);
    assert.equal((await m.c.post(`/admin/access/users/${t.id}/admin`, { permissions: ["design.manage"], confirm: true })).status, 403);
    assert.equal((await m.c.post(`/admin/access/users/${t.id}/admin`, { permissions: ["admins.manage"], confirm: true })).status, 403);
    assert.equal((await m.c.post(`/admin/access/users/${ownerId}/admin/revoke`, { confirm: true })).status, 403);
    assert.equal((await m.c.post(`/admin/access/users/${t.id}/admin/revoke`, { newRole: "USER", confirm: true })).status, 200);
  });
  test("Owner защищён", async () => {
    const um = await register("users_manager");
    await owner.post(`/admin/access/users/${um.id}/admin`, { permissions: ["users.manage", "security.manage"], confirm: true });
    assert.equal((await um.c.patch(`/admin/access/users/${ownerId}/role`, { role: "USER", confirm: true })).status, 403);
    assert.equal((await um.c.patch(`/admin/access/users/${ownerId}/status`, { status: "DISABLED" })).status, 403);
    assert.equal((await um.c.post(`/admin/security/users/${ownerId}/revoke-all`)).status, 403);
    assert.equal((await owner.patch(`/admin/access/users/${ownerId}/role`, { role: "USER", confirm: true })).status, 403);
    const x = await register("escalate_target");
    assert.equal((await um.c.patch(`/admin/access/users/${x.id}/role`, { role: "CHIEF", confirm: true })).status, 403);
  });
  test("8–9. Снятие прав — сессия завершена, доступ пропал", async () => {
    assert.equal((await owner.post(`/admin/access/users/${user.id}/admin/revoke`, { newRole: "USER", confirm: true })).status, 200);
    assert.equal((await user.c.get("/auth/me")).data.user, null);
    await user.c.post("/auth/login", { login: "plain_user", password: "Passw0rd-123" });
    assert.equal((await user.c.get("/auth/me")).data.user.role, "USER");
    assert.equal((await user.c.post("/news", { title: "Ещё новость", body: "Текст новости ещё", category: "NEWS" })).status, 403);
  });
  test("10. Отказы и изменения записаны в журналы", async () => {
    const changes = (await owner.get("/admin/access/role-changes")).data.items as { result: string; target: { login: string } }[];
    assert.ok(changes.some((c) => c.result === "SUCCESS" && c.target.login === "plain_user"));
    assert.ok(changes.some((c) => c.result === "DENIED" && c.target.login === "plain_user"), "отказ сохранён несмотря на откат операции");
    const audit = (await owner.get("/audit?critical=1")).data.items as { action: string }[];
    for (const a of ["admin.assign", "admin.revoke", "access.denied", "design.theme"]) assert.ok(audit.some((x) => x.action === a), a);
  });
});

describe("Безопасность и разделы", () => {
  test("Блокировка после 5 неудачных входов", async () => {
    await register("brute");
    const c = anon();
    for (let i = 0; i < 5; i++) assert.equal((await c.post("/auth/login", { login: "brute", password: "wrong-pass" })).status, 401);
    assert.equal((await c.post("/auth/login", { login: "brute", password: "Passw0rd-123" })).status, 429);
  });
  test("Заявка → одобрение → сотрудник → документ → проверка", async () => {
    const cand = await register("candidate_one");
    const divs = (await owner.get("/divisions")).data.items;
    assert.equal((await cand.c.post("/applications", { nickname: "Ivan_Cand", age: 19, contact: "ivan#1", divisionId: divs[1].id, experience: "Играл в полиции на другом сервере", motivation: "Хочу развиваться в RP и служить в ДПС" })).status, 200);
    const app = (await owner.get("/applications?status=PENDING")).data.items[0];
    assert.equal((await owner.post(`/applications/${app.id}/review`, { status: "APPROVED" })).status, 200);
    assert.equal((await cand.c.get("/auth/me")).data.user.role, "EMPLOYEE");
    assert.equal((await cand.c.post("/documents", { type: "raport", title: "Рапорт", data: {}, submit: true })).status, 400);
    const d = await cand.c.post("/documents", { type: "raport", title: "Рапорт", data: { to: "Начальнику", subject: "Тема", body: "Текст", date: "2026-10-21" }, submit: true });
    assert.equal(d.status, 200);
    assert.equal((await owner.post(`/documents/${d.data.id}/review`, { status: "ACCEPTED" })).status, 200);
  });
  test("Начальные данные без вымышленных сотрудников", async () => {
    const fresh = JSON.parse(store.get(STORAGE_KEY)!);
    assert.equal(fresh.employees.filter((e: { isDemo: boolean }) => e.isDemo).length, 0);
  });
  test("Старая копия с демо-людьми: импорт → «Удалить демо-данные»", async () => {
    const exp = (await owner.get("/admin/data/export")).data;
    const t = new Date().toISOString();
    exp.data.employees.push({ id: "demo1", userId: null, nickname: "Alexey_Voronov", rank: "Полковник", position: "Начальник", divisionId: exp.data.divisions[0].id, status: "ACTIVE", joinedAt: t, isDemo: true, createdAt: t, updatedAt: t });
    exp.data.hrRecords.push({ id: "h1", employeeId: "demo1", type: "APPOINTMENT", fromValue: null, toValue: "Начальник", comment: null, orderRef: null, actorId: null, actorName: "Система", createdAt: t });
    exp.data.orders.push({ id: "o1", number: "777/2026", title: "Демо приказ", category: "GENERAL", status: "PUBLISHED", content: "x".repeat(30), authorId: null, publishedAt: t, isDemo: true, createdAt: t, updatedAt: t });
    assert.equal((await owner.post("/admin/data/import", exp)).status, 200);
    const r = await owner.post("/admin/data/purge-demo", {});
    assert.equal(r.status, 200);
    assert.equal(r.data.removed.employees, 1);
    assert.equal(r.data.removed.orders, 1);
    const left = (await owner.get("/employees?status=all")).data.items as { nickname: string }[];
    assert.ok(!left.some((e) => e.nickname === "Alexey_Voronov"));
    assert.ok(left.some((e) => e.nickname === "Ivan_Cand"), "свои сотрудники остались");
  });
  test("Экспорт → сброс → импорт возвращает данные", async () => {
    const exp = (await owner.get("/admin/data/export")).data;
    const users = exp.data.users.length;
    assert.equal((await owner.post("/admin/data/reset", { confirm: "нет" })).status, 400);
    assert.equal((await owner.post("/admin/data/reset", { confirm: "СБРОС" })).status, 200);
    const fresh = anon();
    await fresh.post("/auth/login", { login: "SAMER", password: "1234samer1234" });
    await fresh.post("/auth/change-password", { currentPassword: "1234samer1234", newPassword: "Owner-New-Pass-2026" });
    const imp = await fresh.post("/admin/data/import", exp);
    assert.equal(imp.status, 200);
    assert.equal(imp.data.relogin, true, "владелец из копии другой — нужен повторный вход");
    assert.equal((await fresh.post("/auth/login", { login: "SAMER", password: "Owner-New-Pass-2026" })).status, 200);
    const after = (await fresh.get("/admin/data/export")).data.data.users.length;
    assert.equal(after, users);
  });
});
