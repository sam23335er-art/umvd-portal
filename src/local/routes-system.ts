import { z } from "zod";
import { now, uid, type DB } from "./db";
import { seedDatabase } from "./seed";
import { audit, badRequest, can, forbidden, has, logged, me, need, needAny, notFound, parse, q, route, type Ctx } from "./core";
import registry from "../themes/themes.json";

const isTheme = (id: string) => registry.themes.some((t) => t.id === id);
const themeName = (id: string) => registry.themes.find((t) => t.id === id)?.name ?? id;
const nickOf = (db: DB, id: string | null) => (id ? db.users.find((u) => u.id === id)?.nickname ?? null : null);

// ═════════════ Главная портала ═════════════
route("GET", "/dashboard", (c) => {
  const u = need(c, "portal.view");
  const t = now();
  const author = (id: string | null) => (id ? { nickname: nickOf(c.db, id) ?? "—" } : null);
  const audits = can(c, "audit.view") ? c.db.audit.filter((a) => !a.critical) : c.db.audit.filter((a) => a.actorId === u.id);
  return {
    news: c.db.news.filter((n) => n.status === "PUBLISHED").sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((n) => ({ ...n, author: author(n.authorId) })),
    orders: c.db.orders.filter((o) => o.status === "PUBLISHED").sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")).slice(0, 5),
    events: c.db.events.filter((e) => e.status === "PLANNED" && e.startsAt >= t).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 5)
      .map((e) => ({ ...e, _count: { participants: c.db.participants.filter((p) => p.eventId === e.id).length } })),
    divisions: c.db.divisions.filter((d) => d.enabled).sort((a, b) => a.sortOrder - b.sortOrder)
      .map((d) => ({ id: d.id, shortName: d.shortName, name: d.name, status: d.status, _count: { employees: c.db.employees.filter((e) => e.divisionId === d.id && (e.status === "ACTIVE" || e.status === "VACATION")).length } })),
    activity: audits.slice(0, 8),
    activityScope: can(c, "audit.view") ? "all" : "mine",
    my: {
      drafts: c.db.documents.filter((d) => d.authorId === u.id && (d.status === "DRAFT" || d.status === "RETURNED")).length,
      pendingReports: c.db.reports.filter((r) => r.authorId === u.id && (r.status === "PENDING" || r.status === "REVISION")).length,
    },
    pendingReview: can(c, "reports.review") ? c.db.reports.filter((r) => r.status === "PENDING").length : null,
  };
});

// ═════════════ Обзор админ-панели ═════════════
route("GET", "/admin/overview", (c) => {
  const u = need(c, "admin.access");
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const byDiv = new Map<string, number>();
  for (const e of c.db.employees) if (e.status === "ACTIVE" || e.status === "VACATION") {
    const name = c.db.divisions.find((d) => d.id === e.divisionId)?.shortName ?? "Без подразделения";
    byDiv.set(name, (byDiv.get(name) ?? 0) + 1);
  }
  const applicationsPending = c.db.applications.filter((a) => a.status === "PENDING" || a.status === "INTERVIEW").length;
  const appealsOpen = c.db.appeals.filter((a) => a.status === "OPEN" || a.status === "IN_PROGRESS").length;
  const reportsPending = c.db.reports.filter((r) => r.status === "PENDING").length;
  const failed24 = can(c, "security.manage") ? c.db.loginAttempts.filter((l) => !l.success && l.createdAt >= dayAgo).length : null;
  const alerts: { level: string; text: string; link?: string }[] = [];
  if (applicationsPending) alerts.push({ level: "info", text: `Заявок кандидатов на рассмотрении: ${applicationsPending}`, link: "/admin/applications" });
  if (appealsOpen) alerts.push({ level: "info", text: `Открытых обращений: ${appealsOpen}`, link: "/admin/appeals" });
  if (reportsPending) alerts.push({ level: "info", text: `Отчётов ожидают проверки: ${reportsPending}`, link: "/admin/reports" });
  if (failed24 && failed24 >= 10) alerts.push({ level: "warning", text: `Неудачных попыток входа за сутки: ${failed24}`, link: "/admin/security" });
  const demo = c.db.employees.filter((e) => e.isDemo).length;
  const demoAny = demo + c.db.orders.filter((o) => o.isDemo).length + c.db.news.filter((n) => n.isDemo).length + c.db.events.filter((e) => e.isDemo).length;
  if (demoAny) alerts.push({ level: "warning", text: `Есть демонстрационные данные (${demoAny} записей, из них ${demo} вымышленных сотрудников). Удалить: «Настройки портала» → «Данные портала» → «Удалить демо-данные».`, link: "/admin/settings" });
  if (c.store.kind === "local") alerts.push({ level: "info", text: "Автономный режим: данные хранятся только в этом браузере. Регулярно делайте резервную копию: «Настройки портала» → «Данные портала».", link: "/admin/settings" });
  return {
    stats: {
      users: c.db.users.length,
      ordersPublished: c.db.orders.filter((o) => o.status === "PUBLISHED").length,
      reportsPending,
      newDocuments: c.db.documents.filter((d) => d.status === "SUBMITTED" && d.createdAt >= weekAgo).length,
      applicationsPending,
      appealsOpen,
      employeesByDivision: [...byDiv].map(([division, count]) => ({ division, count })),
    },
    recentAdmin: can(c, "audit.view") || u.role === "OWNER" ? c.db.audit.filter((a) => a.critical).slice(0, 8) : [],
    recentLogins: can(c, "security.manage") ? c.db.loginAttempts.filter((l) => l.success).slice(0, 8) : [],
    alerts,
  };
});

// ═════════════ Журнал аудита (только чтение) ═════════════
route("GET", "/audit", (c) => {
  need(c, "audit.view");
  const s = q(c, "q"), entity = q(c, "entity"), critical = q(c, "critical") === "1";
  const page = Math.max(1, Number(q(c, "page") ?? 1) || 1);
  const list = c.db.audit.filter((a) => (!s || has(a.summary, s) || has(a.actorName, s) || has(a.action, s)) && (!entity || a.entity === entity) && (!critical || a.critical));
  return { items: list.slice((page - 1) * 50, page * 50), total: list.length, page, pages: Math.max(1, Math.ceil(list.length / 50)) };
});

// ═════════════ Безопасность ═════════════
route("GET", "/admin/security/logins", (c) => {
  need(c, "security.manage");
  const result = q(c, "result"), s = q(c, "q");
  return { items: c.db.loginAttempts.filter((l) => (result === "fail" ? !l.success : result === "ok" ? l.success : true) && (!s || l.login.includes(s.toLowerCase()))).slice(0, 300) };
});
route("GET", "/admin/security/sessions", (c) => {
  need(c, "security.manage");
  const t = now();
  return {
    items: c.db.sessions.filter((s) => !s.revokedAt && s.expiresAt > t).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).map((s) => {
      const u = c.db.users.find((x) => x.id === s.userId);
      return { ...s, ip: "—", user: { id: s.userId, nickname: u?.nickname ?? "—", login: u?.login ?? "", role: u?.role ?? "USER" } };
    }),
  };
});
route("POST", "/admin/security/sessions/:id/revoke", (c) => {
  const u = need(c, "security.manage");
  const s = c.db.sessions.find((x) => x.id === c.params.id);
  if (!s) throw notFound("Сессия не найдена");
  const owner = c.db.users.find((x) => x.id === s.userId);
  if (owner?.role === "OWNER" && u.role !== "OWNER") throw forbidden("Сессии владельца может завершить только владелец");
  s.revokedAt = now();
  audit(c.db, u, "security.session_revoke", "Session", s.id, `Завершена сессия пользователя ${owner?.nickname ?? "—"}`, { critical: true });
  const self = s.id === u.sessionId;
  if (self) c.session = null;
  return { ok: true, self };
});
route("POST", "/admin/security/users/:id/revoke-all", (c) => {
  const u = need(c, "security.manage");
  const t = c.db.users.find((x) => x.id === c.params.id);
  if (!t) throw notFound();
  if (t.role === "OWNER" && u.role !== "OWNER") throw forbidden("Сессии владельца может завершить только владелец");
  c.db.sessions.forEach((s) => s.userId === t.id && !s.revokedAt && !(t.id === u.id && s.id === u.sessionId) && (s.revokedAt = now()));
  audit(c.db, u, "security.revoke_all", "User", t.id, `Завершены все сессии пользователя ${t.nickname}`, { critical: true });
});

// ═════════════ Настройки и дизайн ═════════════
function bump(db: DB, actorId: string) {
  db.settings.version += 1;
  db.settings.updatedById = actorId;
  db.settings.updatedAt = now();
}

route("GET", "/admin/settings", (c) => {
  needAny(c, "settings.manage", "design.manage");
  return { settings: { ...c.db.settings, updatedBy: nickOf(c.db, c.db.settings.updatedById) }, themes: registry.themes };
});

route("PATCH", "/admin/settings", (c) => {
  const u = need(c, "settings.manage");
  const data = parse(z.object({
    portalName: z.string().trim().min(3).max(80), subtitle: z.string().trim().max(160), description: z.string().trim().max(2000), contacts: z.string().trim().max(1000),
    addressEnabled: z.boolean(), addressTitle: z.string().trim().max(120), addressBody: z.string().trim().max(4000), addressAuthor: z.string().trim().max(80),
    registrationOpen: z.boolean(), applicationsOpen: z.boolean(),
  }).partial().strict(), c.body);
  if (data.addressEnabled && !(data.addressBody ?? c.db.settings.addressBody)) throw badRequest("Заполните текст обращения администрации", { addressBody: "Обязательное поле" });
  Object.assign(c.db.settings, data);
  bump(c.db, u.id);
  audit(c.db, u, "settings.update", "PortalSettings", "1", `Изменены настройки портала: ${Object.keys(data).join(", ")}`, { critical: true });
});

route("PUT", "/admin/settings/theme", (c) => {
  const u = me(c);
  if (!u.perms.has("design.manage")) {
    audit(c.db, u, "access.denied", "PortalSettings", "1", "Отклонена попытка изменить глобальную тему без права design.manage", { critical: true });
    throw logged(forbidden("Нет права на изменение оформления сайта"));
  }
  const { theme } = parse(z.object({ theme: z.string().max(40), confirm: z.literal(true, { error: "Подтвердите применение темы" }) }).strict(), c.body);
  if (!isTheme(theme)) throw badRequest("Недопустимая тема оформления");
  const prev = c.db.settings.activeTheme;
  c.db.settings.activeTheme = theme;
  bump(c.db, u.id);
  audit(c.db, u, "design.theme", "PortalSettings", "1", `Глобальная тема: «${themeName(prev)}» → «${themeName(theme)}»`, { critical: true, meta: { from: prev, to: theme } });
  return { ok: true, activeTheme: theme, version: c.db.settings.version };
});

route("PATCH", "/admin/settings/effects", (c) => {
  const u = need(c, "design.manage");
  const data = parse(z.object({ effectsEnabled: z.boolean(), cursorGlow: z.boolean() }).partial().strict(), c.body);
  Object.assign(c.db.settings, data);
  bump(c.db, u.id);
  audit(c.db, u, "design.effects", "PortalSettings", "1", `Эффекты оформления: ${JSON.stringify(data)}`);
});

/**
 * Картинка приходит уже сжатой браузером (data URL). Здесь — только проверка
 * типа и размера, затем сохранение в хранилище картинок.
 */
const imageSchema = z.object({ dataUrl: z.string().max(7_000_000, "Изображение слишком большое") }).strict();
async function saveImage(c: Ctx, prefix: string): Promise<string> {
  const { dataUrl } = parse(imageSchema, c.body);
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw badRequest("Допустимы только изображения PNG, JPEG или WebP");
  return c.store.putAsset(`${prefix}-${uid()}`, dataUrl);
}

route("POST", "/admin/settings/logo", async (c) => {
  const u = need(c, "settings.manage");
  const prev = c.db.settings.logoUrl;
  c.db.settings.logoUrl = await saveImage(c, "logo");
  await c.store.deleteAsset(prev);
  bump(c.db, u.id);
  audit(c.db, u, "settings.logo", "PortalSettings", "1", "Загружена новая эмблема портала");
  return { ok: true, url: c.db.settings.logoUrl };
});
route("DELETE", "/admin/settings/logo", async (c) => {
  const u = need(c, "settings.manage");
  await c.store.deleteAsset(c.db.settings.logoUrl);
  c.db.settings.logoUrl = null;
  bump(c.db, u.id);
  audit(c.db, u, "settings.logo", "PortalSettings", "1", "Восстановлена стандартная эмблема");
});
route("POST", "/admin/settings/backgrounds/:theme", async (c) => {
  const u = need(c, "design.manage");
  if (!isTheme(c.params.theme)) throw badRequest("Недопустимая тема");
  const url = await saveImage(c, `bg-${c.params.theme}`);
  await c.store.deleteAsset(c.db.settings.themeBackgrounds[c.params.theme]);
  c.db.settings.themeBackgrounds = { ...c.db.settings.themeBackgrounds, [c.params.theme]: url };
  bump(c.db, u.id);
  audit(c.db, u, "design.background", "PortalSettings", "1", `Загружен фон для темы «${themeName(c.params.theme)}»`);
  return { ok: true, url };
});
route("DELETE", "/admin/settings/backgrounds/:theme", async (c) => {
  const u = need(c, "design.manage");
  if (!isTheme(c.params.theme)) throw badRequest("Недопустимая тема");
  const next = { ...c.db.settings.themeBackgrounds };
  await c.store.deleteAsset(next[c.params.theme]);
  delete next[c.params.theme];
  c.db.settings.themeBackgrounds = next;
  bump(c.db, u.id);
  audit(c.db, u, "design.background", "PortalSettings", "1", `Для темы «${themeName(c.params.theme)}» восстановлен стандартный фон`);
});

// ═════════════ Данные портала: резервная копия ═════════════
route("GET", "/admin/data/export", (c) => {
  need(c, "settings.manage");
  const { sessions: _s, ...rest } = c.db;
  return { exportedAt: now(), app: "umvd-portal", data: { ...rest, sessions: [] } };
});

route("POST", "/admin/data/import", async (c) => {
  const u = me(c);
  if (u.role !== "OWNER") throw forbidden("Восстанавливать данные из копии может только владелец");
  const file = c.body as { app?: string; data?: DB };
  const d = file?.data;
  if (file?.app !== "umvd-portal" || !d || d.schemaVersion !== 1 || !Array.isArray(d.users) || !d.settings) throw badRequest("Это не файл резервной копии портала УМВД");
  if (!d.users.some((x) => x.role === "OWNER")) throw badRequest("В копии нет владельца (Owner) — импорт отменён");
  // Встроенные картинки из автономной версии переносим в хранилище картинок
  if (d.settings.logoUrl?.startsWith("data:")) d.settings.logoUrl = await c.store.putAsset(`logo-${uid()}`, d.settings.logoUrl);
  for (const [k, v] of Object.entries(d.settings.themeBackgrounds ?? {})) {
    if (v.startsWith("data:")) d.settings.themeBackgrounds[k] = await c.store.putAsset(`bg-${k}-${uid()}`, v);
  }
  const keepSession = d.users.some((x) => x.id === u.id);
  const mySessions = c.db.sessions.filter((s) => s.userId === u.id);
  for (const k of Object.keys(c.db)) delete (c.db as Record<string, unknown>)[k];
  Object.assign(c.db, d, { sessions: keepSession ? mySessions : [] });
  c.db.sessions ??= [];
  if (!keepSession) c.session = null;
  c.db.settings.version += 1;
  audit(c.db, u, "data.import", "System", null, `Данные портала восстановлены из резервной копии (${d.users.length} пользователей, ${d.employees.length} сотрудников)`, { critical: true });
  return { ok: true, relogin: !keepSession };
});

route("POST", "/admin/data/reset", (c) => {
  const u = me(c);
  if (u.role !== "OWNER") throw forbidden("Сбросить портал может только владелец");
  parse(z.object({ confirm: z.literal("СБРОС", { error: "Введите слово СБРОС для подтверждения" }) }).strict(), c.body);
  const fresh = seedDatabase();
  for (const k of Object.keys(c.db)) delete (c.db as Record<string, unknown>)[k];
  Object.assign(c.db, fresh);
  c.session = null;
  return { ok: true };
});

/** Удаление всех демонстрационных записей (помечены isDemo) и связанных с ними данных. */
route("POST", "/admin/data/purge-demo", (c) => {
  const u = me(c);
  if (u.role !== "OWNER" && !u.perms.has("settings.manage")) throw forbidden();
  const db = c.db;
  const demoEmp = new Set(db.employees.filter((e) => e.isDemo).map((e) => e.id));
  const demoEvents = new Set(db.events.filter((e) => e.isDemo).map((e) => e.id));
  const before = { employees: db.employees.length, orders: db.orders.length, news: db.news.length, events: db.events.length, documents: db.documents.length, reports: db.reports.length };
  db.employees = db.employees.filter((e) => !e.isDemo);
  db.hrRecords = db.hrRecords.filter((r) => !demoEmp.has(r.employeeId));
  db.divisions.forEach((d) => d.headId && demoEmp.has(d.headId) && (d.headId = null));
  db.orders = db.orders.filter((x) => !x.isDemo);
  db.news = db.news.filter((x) => !x.isDemo);
  db.events = db.events.filter((x) => !x.isDemo);
  db.participants = db.participants.filter((p) => !demoEvents.has(p.eventId));
  db.documents = db.documents.filter((x) => !x.isDemo);
  db.reports = db.reports.filter((x) => !x.isDemo);
  const removed = Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v - (db[k as keyof typeof before] as unknown[]).length]));
  const total = Object.values(removed).reduce((a, b) => a + b, 0);
  audit(db, u, "data.purge_demo", "System", null, `Удалены демонстрационные данные: ${total} записей`, { critical: true, meta: removed });
  return { ok: true, removed, total };
});
