import { z } from "zod";
import { now, uid, type DB } from "./db";
import { audit, badRequest, conflict, effectivePermissions, forbidden, hashToken, HttpError, logged, me, newToken, notify, parse, route, type Ctx } from "./core";
import { hashPassword, passwordRules, verifyPassword } from "./crypto";
import { ROLE_LABELS } from "./permissions";
import registry from "../themes/themes.json";

// ─────────── Публичная часть ───────────
export function publicSettings(db: DB) {
  const s = db.settings;
  const themeOk = registry.themes.some((t) => t.id === s.activeTheme);
  return {
    portalName: s.portalName, subtitle: s.subtitle, description: s.description, contacts: s.contacts, logoUrl: s.logoUrl,
    activeTheme: themeOk ? s.activeTheme : registry.defaultTheme, effectsEnabled: s.effectsEnabled, cursorGlow: s.cursorGlow, themeBackgrounds: s.themeBackgrounds,
    address: s.addressEnabled ? { title: s.addressTitle, body: s.addressBody, author: s.addressAuthor, updatedAt: s.updatedAt } : null,
    registrationOpen: s.registrationOpen, applicationsOpen: s.applicationsOpen, version: s.version,
  };
}

route("GET", "/public/settings", ({ db }) => ({ settings: publicSettings(db), themes: registry.themes }));

route("GET", "/public/home", ({ db }) => {
  const nick = (id: string | null) => (id ? { nickname: db.users.find((u) => u.id === id)?.nickname ?? "—" } : null);
  const news = db.news
    .filter((n) => n.isPublic && n.status === "PUBLISHED")
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)
    .map((n) => ({ ...n, author: nick(n.authorId) }));
  const divisions = db.divisions
    .filter((d) => d.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((d) => ({ ...d, _count: { employees: db.employees.filter((e) => e.divisionId === d.id && e.status !== "DISMISSED").length } }));
  return {
    news,
    divisions,
    stats: {
      employees: db.employees.filter((e) => e.status === "ACTIVE" || e.status === "VACATION").length,
      divisions: divisions.length,
      upcomingEvents: db.events.filter((e) => e.status === "PLANNED" && e.startsAt >= now()).length,
    },
  };
});

// ─────────── Вход и регистрация ───────────
const LOCK_MIN = 15, LOCK_AFTER = 5;
/** Новая сессия: клиенту отдаётся случайный токен, в базе хранится только его хеш. */
async function startSession(c: Ctx, userId: string) {
  const token = newToken();
  c.db.sessions.push({ id: uid(), tokenHash: await hashToken(token), userId, createdAt: now(), lastSeenAt: now(), expiresAt: new Date(Date.now() + 12 * 3600_000).toISOString(), revokedAt: null, userAgent: c.userAgent });
  c.session = token;
}

route("POST", "/auth/login", async (c) => {
  const { db, body } = c;
  const { login, password, adminArea } = parse(z.object({ login: z.string().trim().min(1, "Введите логин").max(40), password: z.string().min(1, "Введите пароль").max(200), adminArea: z.boolean().optional() }).strict(), body);
  const key = login.toLowerCase();
  const attempt = (success: boolean, reason: string | null, userId: string | null = null) =>
    db.loginAttempts.unshift({ id: uid(), login: key, userId, success, reason, ip: c.ip, userAgent: c.userAgent, adminArea: !!adminArea, createdAt: now() });
  const since = new Date(Date.now() - LOCK_MIN * 60_000).toISOString();
  if (db.loginAttempts.filter((a) => a.login === key && !a.success && a.createdAt >= since).length >= LOCK_AFTER) {
    attempt(false, "Учётная запись временно заблокирована");
    throw logged(new HttpError(429, `Слишком много неудачных попыток. Вход временно заблокирован на ${LOCK_MIN} минут.`));
  }
  const user = db.users.find((u) => u.login === key);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    attempt(false, user ? "Неверный пароль" : "Неверный логин или пароль", user?.id ?? null);
    throw logged(new HttpError(401, "Неверный логин или пароль"));
  }
  if (user.status !== "ACTIVE") {
    attempt(false, "Учётная запись отключена", user.id);
    throw logged(forbidden("Учётная запись отключена. Обратитесь к администрации."));
  }
  if (adminArea && !effectivePermissions(db, user.id, user.role).has("admin.access")) {
    attempt(false, "Нет доступа к админ-панели", user.id);
    throw logged(forbidden("У этой учётной записи нет доступа к административной панели"));
  }
  await startSession(c, user.id);
  user.lastLoginAt = now();
  attempt(true, null, user.id);
  return { ok: true, mustChangePassword: user.mustChangePassword };
});

route("POST", "/auth/register", async (c) => {
  const { db, body } = c;
  if (!db.settings.registrationOpen) throw forbidden("Регистрация временно закрыта");
  const data = parse(
    z.object({
      login: z.string().trim().min(3, "Логин: минимум 3 символа").max(32).regex(/^[A-Za-z0-9_.-]+$/, "Логин: латинские буквы, цифры, точка, дефис, подчёркивание"),
      nickname: z.string().trim().min(3, "Игровой ник: минимум 3 символа").max(40).regex(/^[A-Za-zА-Яа-яЁё0-9_ .-]+$/, "Игровой ник: недопустимые символы"),
      password: z.string().max(200),
    }).strict(), // попытка передать role при регистрации отклоняется
    body,
  );
  if (!passwordRules.test(data.password)) throw badRequest(passwordRules.message, { password: passwordRules.message });
  const login = data.login.toLowerCase();
  if (db.users.some((u) => u.login === login)) throw conflict("Этот логин уже занят");
  if (db.users.some((u) => u.nickname.toLowerCase() === data.nickname.toLowerCase())) throw conflict("Этот игровой ник уже занят");
  const t = now();
  const user = { id: uid(), login, nickname: data.nickname, passwordHash: await hashPassword(data.password), role: "USER" as const, status: "ACTIVE" as const, mustChangePassword: false, createdAt: t, updatedAt: t, lastLoginAt: t, adminSince: null, adminAssignedById: null };
  db.users.push(user);
  audit(db, user, "user.register", "User", user.id, `Зарегистрирован пользователь ${user.nickname}`);
  await startSession(c, user.id);
  return { ok: true };
});

route("POST", "/auth/logout", (c) => {
  const s = c.user && c.db.sessions.find((x) => x.id === c.user!.sessionId);
  if (s) s.revokedAt = now();
  c.session = null;
  return { ok: true };
});

route("GET", "/auth/me", ({ db, user: u }) => {
  if (!u) return { user: null };
  const full = db.users.find((x) => x.id === u.id)!;
  return {
    user: {
      id: u.id, login: u.login, nickname: u.nickname, role: u.role, roleLabel: ROLE_LABELS[u.role], permissions: [...u.perms], mustChangePassword: u.mustChangePassword,
      employeeId: u.employeeId, divisionId: u.divisionId, unreadNotifications: db.notifications.filter((n) => n.userId === u.id && !n.read).length,
      createdAt: full.createdAt, lastLoginAt: full.lastLoginAt, adminSince: full.adminSince,
    },
  };
});

route("POST", "/auth/change-password", async (c) => {
  const u = me(c);
  const { currentPassword, newPassword } = parse(z.object({ currentPassword: z.string().min(1, "Введите текущий пароль").max(200), newPassword: z.string().max(200) }).strict(), c.body);
  if (!passwordRules.test(newPassword)) throw badRequest(passwordRules.message, { newPassword: passwordRules.message });
  if (currentPassword === newPassword) throw badRequest("Новый пароль должен отличаться от текущего", { newPassword: "Совпадает с текущим" });
  const user = c.db.users.find((x) => x.id === u.id)!;
  if (!(await verifyPassword(currentPassword, user.passwordHash))) throw badRequest("Текущий пароль указан неверно", { currentPassword: "Неверный пароль" });
  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  user.updatedAt = now();
  for (const s of c.db.sessions) if (s.userId === u.id && s.id !== u.sessionId && !s.revokedAt) s.revokedAt = now();
  audit(c.db, u, "auth.password_change", "User", u.id, `${u.nickname} сменил(а) пароль`, { critical: true });
  return { ok: true };
});

route("GET", "/auth/notifications", (c) => ({ items: c.db.notifications.filter((n) => n.userId === me(c).id).slice(0, 50) }));
route("POST", "/auth/notifications/read-all", (c) => {
  const u = me(c);
  c.db.notifications.forEach((n) => n.userId === u.id && (n.read = true));
});
route("POST", "/auth/notifications/:id/read", (c) => {
  const n = c.db.notifications.find((x) => x.id === c.params.id && x.userId === me(c).id);
  if (n) n.read = true;
});

export { notify };
