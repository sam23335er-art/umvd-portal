/**
 * Управление доступом: Owner, администраторы, роли. Все запреты повышения
 * привилегий проверяются здесь, при каждом запросе.
 */
import { z } from "zod";
import { now, uid, type DB, type Role, type User } from "./db";
import { audit, badRequest, conflict, effectivePermissions, forbidden, HttpError, me, needAny, notFound, notify, parse, q, rolePermissions, route, type AuthUser, type Ctx } from "./core";
import { hashPassword, passwordRules } from "./crypto";
import { ALL_PERMISSIONS, ASSIGNABLE_ROLES, isCritical, isPermission, OWNER_ONLY_GRANT, PERMISSIONS, ROLE_LABELS, type Permission } from "./permissions";

const roleEnum = z.enum(["OWNER", "ADMIN", "CHIEF", "DEPUTY", "DIV_HEAD", "HR", "EMPLOYEE", "CANDIDATE", "USER", "OBSERVER"]);
const subset = (a: Iterable<Permission>, b: Set<Permission>) => [...a].every((p) => b.has(p));

/**
 * Отказ фиксируется в журналах. Чтобы запись сохранилась несмотря на откат
 * транзакции, она возвращается клиенту как ответ 403 после сохранения.
 */
function deny(db: DB, actor: AuthUser, target: User | null, newRole: Role | null, reason: string): never {
  if (target) db.roleChanges.unshift({ id: uid(), targetId: target.id, actorId: actor.id, previousRole: target.role, newRole: newRole ?? target.role, granted: [], revoked: [], result: "DENIED", reason, createdAt: now() });
  audit(db, actor, "access.denied", "User", target?.id ?? null, `Отклонено: ${reason}${target ? ` (пользователь ${target.nickname})` : ""}`, { critical: true });
  throw new DeniedError(reason);
}
export class DeniedError extends HttpError {
  constructor(reason: string) {
    super(403, reason, { code: "DENIED_LOGGED" });
    this.commit = true;
  }
}

function assertCanActOn(db: DB, actor: AuthUser, target: User, newRole: Role | null) {
  if (target.id === actor.id) deny(db, actor, target, newRole, "Нельзя изменять собственную роль и полномочия");
  if (target.role === "OWNER") deny(db, actor, target, newRole, "Роль и права владельца (Owner) нельзя изменить через портал");
  if (newRole === "OWNER") deny(db, actor, target, newRole, "Роль Owner назначается только при первоначальной настройке");
  if (actor.role !== "OWNER") {
    const tp = effectivePermissions(db, target.id, target.role);
    if (tp.has("admins.manage")) deny(db, actor, target, newRole, "Пользователем с правом управления администраторами может управлять только Owner");
    if (!subset(tp, actor.perms)) deny(db, actor, target, newRole, "Нельзя изменять пользователя с более широкими полномочиями, чем у вас");
  }
}
const target = (c: Ctx) => {
  const t = c.db.users.find((u) => u.id === c.params.id);
  if (!t) throw notFound("Пользователь не найден");
  return t;
};
const nick = (db: DB, id: string | null) => (id ? { nickname: db.users.find((u) => u.id === id)?.nickname ?? "—" } : null);

route("GET", "/admin/access/catalog", (c) => {
  const u = needAny(c, "users.manage", "admins.manage", "roles.manage");
  return {
    permissions: ALL_PERMISSIONS.map((key) => ({ key, ...PERMISSIONS[key], critical: isCritical(key) })),
    roles: Object.entries(ROLE_LABELS).map(([key, label]) => ({ key, label })),
    assignableRoles: ASSIGNABLE_ROLES,
    grantable: ALL_PERMISSIONS.filter((p) => u.role === "OWNER" || (u.perms.has(p) && !OWNER_ONLY_GRANT.includes(p))),
    ownerOnly: OWNER_ONLY_GRANT,
  };
});

route("GET", "/admin/access/users", (c) => {
  needAny(c, "users.manage", "admins.manage");
  const s = q(c, "q")?.toLowerCase(), role = q(c, "role"), status = q(c, "status");
  const order: Role[] = ["OWNER", "ADMIN", "CHIEF", "DEPUTY", "DIV_HEAD", "HR", "EMPLOYEE", "CANDIDATE", "USER", "OBSERVER"];
  return {
    items: c.db.users
      .filter((u) => (!s || u.nickname.toLowerCase().includes(s) || u.login.includes(s)) && (!role || u.role === role) && (!status || u.status === status))
      .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || b.createdAt.localeCompare(a.createdAt))
      .map((u) => {
        const emp = c.db.employees.find((e) => e.userId === u.id);
        const div = emp && c.db.divisions.find((d) => d.id === emp.divisionId);
        return {
          id: u.id, login: u.login, nickname: u.nickname, role: u.role, status: u.status, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, adminSince: u.adminSince,
          adminAssignedBy: nick(c.db, u.adminAssignedById), roleLabel: ROLE_LABELS[u.role],
          permissions: c.db.userPermissions.filter((p) => p.userId === u.id).map((p) => p.permission),
          employee: emp ? { rank: emp.rank, position: emp.position, division: div ? { shortName: div.shortName } : null } : null,
        };
      }),
  };
});

route("GET", "/admin/access/users/:id", (c) => {
  needAny(c, "users.manage", "admins.manage");
  const u = target(c);
  const emp = c.db.employees.find((e) => e.userId === u.id);
  const div = emp && c.db.divisions.find((d) => d.id === emp.divisionId);
  return {
    user: {
      id: u.id, login: u.login, nickname: u.nickname, role: u.role, status: u.status, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, adminSince: u.adminSince,
      adminAssignedBy: nick(c.db, u.adminAssignedById), roleLabel: ROLE_LABELS[u.role],
      permissions: c.db.userPermissions.filter((p) => p.userId === u.id).map((p) => ({ permission: p.permission, grantedAt: p.grantedAt, grantedBy: nick(c.db, p.grantedById) })),
      effectivePermissions: [...effectivePermissions(c.db, u.id, u.role)],
      employee: emp ? { id: emp.id, rank: emp.rank, position: emp.position, status: emp.status, division: div ? { name: div.name } : null } : null,
      roleChangesOn: c.db.roleChanges.filter((r) => r.targetId === u.id).slice(0, 50).map((r) => ({ ...r, actor: nick(c.db, r.actorId) })),
    },
  };
});

route("POST", "/admin/access/users", async (c) => {
  const u = me(c);
  if (!u.perms.has("users.manage")) throw forbidden();
  const data = parse(z.object({ login: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_.-]+$/, "Логин: латиница, цифры, . _ -"), nickname: z.string().trim().min(3).max(40), password: z.string().max(200), role: roleEnum }).strict(), c.body);
  if (!passwordRules.test(data.password)) throw badRequest(passwordRules.message, { password: passwordRules.message });
  if (!ASSIGNABLE_ROLES.includes(data.role)) deny(c.db, u, null, data.role, "Эту роль нельзя назначить при создании учётной записи");
  if (u.role !== "OWNER" && !subset(rolePermissions(c.db, data.role), u.perms)) deny(c.db, u, null, data.role, "Роль даёт больше прав, чем у вас");
  const login = data.login.toLowerCase();
  if (c.db.users.some((x) => x.login === login)) throw conflict("Логин уже занят");
  if (c.db.users.some((x) => x.nickname.toLowerCase() === data.nickname.toLowerCase())) throw conflict("Игровой ник уже занят");
  const t = now();
  const user: User = { id: uid(), login, nickname: data.nickname, role: data.role, passwordHash: await hashPassword(data.password), mustChangePassword: true, status: "ACTIVE", createdAt: t, updatedAt: t, lastLoginAt: null, adminSince: null, adminAssignedById: null };
  c.db.users.push(user);
  audit(c.db, u, "user.create", "User", user.id, `Создана учётная запись ${user.nickname} (${ROLE_LABELS[user.role]})`);
  return { id: user.id };
});

route("PATCH", "/admin/access/users/:id/role", (c) => {
  const u = me(c), t = target(c);
  const { role } = parse(z.object({ role: roleEnum, confirm: z.literal(true, { error: "Требуется подтверждение" }) }).strict(), c.body);
  if (!u.perms.has("users.manage")) deny(c.db, u, t, role, "Нет права на управление учётными записями");
  assertCanActOn(c.db, u, t, role);
  if (role === "ADMIN" || t.role === "ADMIN") deny(c.db, u, t, role, "Роль администратора назначается и снимается только в разделе «Администраторы»");
  if (!ASSIGNABLE_ROLES.includes(role)) deny(c.db, u, t, role, "Эту роль нельзя назначить");
  if (u.role !== "OWNER" && !subset(rolePermissions(c.db, role), u.perms)) deny(c.db, u, t, role, "Новая роль даёт больше прав, чем у вас");
  if (role === t.role) throw badRequest("У пользователя уже эта роль");
  c.db.roleChanges.unshift({ id: uid(), targetId: t.id, actorId: u.id, previousRole: t.role, newRole: role, granted: [], revoked: [], result: "SUCCESS", reason: null, createdAt: now() });
  audit(c.db, u, "role.change", "User", t.id, `Роль ${t.nickname}: ${ROLE_LABELS[t.role]} → ${ROLE_LABELS[role]}`, { critical: true });
  notify(c.db, t.id, "Изменена роль", `Ваша роль изменена: ${ROLE_LABELS[role]}`);
  t.role = role;
});

route("PATCH", "/admin/access/users/:id/status", (c) => {
  const u = me(c), t = target(c);
  const { status } = parse(z.object({ status: z.enum(["ACTIVE", "DISABLED"]) }).strict(), c.body);
  if (!u.perms.has("users.manage")) deny(c.db, u, t, null, "Нет права на управление учётными записями");
  assertCanActOn(c.db, u, t, null);
  t.status = status;
  if (status === "DISABLED") c.db.sessions.forEach((s) => s.userId === t.id && !s.revokedAt && (s.revokedAt = now()));
  audit(c.db, u, status === "DISABLED" ? "user.disable" : "user.enable", "User", t.id, `${status === "DISABLED" ? "Деактивирована" : "Активирована"} учётная запись ${t.nickname}`, { critical: true });
});

route("POST", "/admin/access/users/:id/admin", (c) => {
  const u = me(c), t = target(c);
  const body = parse(z.object({ permissions: z.array(z.string()).max(ALL_PERMISSIONS.length), confirm: z.literal(true, { error: "Требуется явное подтверждение назначения" }) }).strict(), c.body);
  if (!u.perms.has("admins.manage")) deny(c.db, u, t, "ADMIN", "Нет права назначать администраторов (выдаётся только Owner)");
  assertCanActOn(c.db, u, t, "ADMIN");
  if (t.status !== "ACTIVE") throw badRequest("Нельзя назначить администратором отключённую учётную запись");
  const requested = [...new Set(body.permissions)];
  const unknown = requested.filter((p) => !isPermission(p));
  if (unknown.length) throw badRequest(`Неизвестные разрешения: ${unknown.join(", ")}`);
  const perms = requested as Permission[];
  if (u.role !== "OWNER") {
    if (perms.some((p) => OWNER_ONLY_GRANT.includes(p))) deny(c.db, u, t, "ADMIN", "Право управлять администраторами может выдать только Owner");
    const excess = perms.filter((p) => !u.perms.has(p));
    if (excess.length) deny(c.db, u, t, "ADMIN", `Нельзя выдать разрешения, которых нет у вас: ${excess.join(", ")}`);
  }
  const defaults = rolePermissions(c.db, "ADMIN");
  const individual = perms.filter((p) => !defaults.has(p));
  const before = c.db.userPermissions.filter((p) => p.userId === t.id).map((p) => p.permission);
  const granted = individual.filter((p) => !before.includes(p));
  const revoked = before.filter((p) => !individual.includes(p as Permission));
  const wasAdmin = t.role === "ADMIN";
  c.db.userPermissions = c.db.userPermissions.filter((p) => p.userId !== t.id).concat(individual.map((permission) => ({ userId: t.id, permission, grantedById: u.id, grantedAt: now() })));
  c.db.roleChanges.unshift({ id: uid(), targetId: t.id, actorId: u.id, previousRole: t.role, newRole: "ADMIN", granted, revoked, result: "SUCCESS", reason: null, createdAt: now() });
  t.role = "ADMIN";
  if (!wasAdmin) {
    t.adminSince = now();
    t.adminAssignedById = u.id;
  }
  audit(c.db, u, wasAdmin ? "admin.permissions" : "admin.assign", "User", t.id, wasAdmin ? `Изменены права администратора ${t.nickname}` : `${t.nickname} назначен(а) администратором`, { critical: true, meta: { granted, revoked } });
  notify(c.db, t.id, wasAdmin ? "Изменены административные права" : "Вы назначены администратором", `Разрешения: ${individual.map((p) => PERMISSIONS[p].label).join(", ") || "базовый доступ к админ-панели"}`, "/admin");
});

route("POST", "/admin/access/users/:id/admin/revoke", (c) => {
  const u = me(c), t = target(c);
  const { newRole } = parse(z.object({ newRole: roleEnum.default("USER"), confirm: z.literal(true, { error: "Требуется подтверждение" }) }).strict(), c.body);
  if (!u.perms.has("admins.manage")) deny(c.db, u, t, newRole, "Нет права снимать администраторов");
  assertCanActOn(c.db, u, t, newRole);
  if (t.role !== "ADMIN") throw badRequest("Пользователь не является администратором");
  if (!ASSIGNABLE_ROLES.includes(newRole)) deny(c.db, u, t, newRole, "Недопустимая новая роль");
  if (u.role !== "OWNER" && !subset(rolePermissions(c.db, newRole), u.perms)) deny(c.db, u, t, newRole, "Новая роль даёт больше прав, чем у вас");
  const before = c.db.userPermissions.filter((p) => p.userId === t.id).map((p) => p.permission);
  c.db.userPermissions = c.db.userPermissions.filter((p) => p.userId !== t.id);
  c.db.roleChanges.unshift({ id: uid(), targetId: t.id, actorId: u.id, previousRole: "ADMIN", newRole, granted: [], revoked: ["admin", ...before], result: "SUCCESS", reason: null, createdAt: now() });
  Object.assign(t, { role: newRole, adminSince: null, adminAssignedById: null });
  c.db.sessions.forEach((s) => s.userId === t.id && !s.revokedAt && (s.revokedAt = now()));
  audit(c.db, u, "admin.revoke", "User", t.id, `Сняты права администратора с ${t.nickname} (новая роль: ${ROLE_LABELS[newRole]})`, { critical: true, meta: { revoked: before } });
  notify(c.db, t.id, "Административные права сняты", `Ваша новая роль: ${ROLE_LABELS[newRole]}. Войдите в систему заново.`);
});

route("GET", "/admin/access/role-changes", (c) => {
  needAny(c, "admins.manage", "audit.view");
  return {
    items: c.db.roleChanges.slice(0, 200).map((r) => {
      const t = c.db.users.find((x) => x.id === r.targetId);
      return { ...r, target: t ? { nickname: t.nickname, login: t.login } : { nickname: "—", login: "" }, actor: nick(c.db, r.actorId) };
    }),
  };
});

route("GET", "/admin/access/roles", (c) => {
  needAny(c, "roles.manage", "admins.manage", "users.manage");
  const matrix: Record<string, string[]> = {};
  for (const role of Object.keys(ROLE_LABELS)) matrix[role] = role === "OWNER" ? [...ALL_PERMISSIONS] : [];
  for (const r of c.db.rolePermissions) matrix[r.role].push(r.permission);
  return { matrix, roles: Object.entries(ROLE_LABELS).map(([key, label]) => ({ key, label })) };
});

route("PUT", "/admin/access/roles/:role", (c) => {
  const u = me(c);
  const rp = roleEnum.safeParse(c.params.role);
  if (!rp.success) throw badRequest("Неизвестная роль");
  const role = rp.data;
  const { permissions, confirm } = parse(z.object({ permissions: z.array(z.string()).max(ALL_PERMISSIONS.length), confirm: z.boolean().optional() }).strict(), c.body);
  const deny2 = (reason: string): never => {
    audit(c.db, u, "access.denied", "RolePermission", role, `Отклонено изменение матрицы роли ${ROLE_LABELS[role]}: ${reason}`, { critical: true });
    throw new DeniedError(reason);
  };
  if (!u.perms.has("roles.manage")) deny2("Нет права на управление матрицей ролей");
  if (role === "OWNER") deny2("Права Owner фиксированы");
  if (role === u.role) deny2("Нельзя изменять разрешения собственной роли");
  const next = [...new Set(permissions)];
  const unknown = next.filter((p) => !isPermission(p));
  if (unknown.length) throw badRequest(`Неизвестные разрешения: ${unknown.join(", ")}`);
  const nextPerms = next as Permission[];
  if (nextPerms.some((p) => OWNER_ONLY_GRANT.includes(p))) deny2("Право управлять администраторами выдаётся только индивидуально владельцем");
  const current = rolePermissions(c.db, role);
  const added = nextPerms.filter((p) => !current.has(p));
  const removed = [...current].filter((p) => !nextPerms.includes(p));
  if (u.role !== "OWNER") {
    const out = [...added, ...removed].filter((p) => !u.perms.has(p) || p === "roles.manage");
    if (out.length) deny2(`Нельзя менять разрешения, которыми вы не обладаете: ${out.join(", ")}`);
  }
  const touchesCritical = [...added, ...removed].some(isCritical);
  if (touchesCritical && confirm !== true) throw new HttpError(409, "Изменение критических разрешений требует подтверждения", { code: "CONFIRM_REQUIRED" });
  c.db.rolePermissions = c.db.rolePermissions.filter((r) => r.role !== role).concat(nextPerms.map((permission) => ({ role, permission })));
  audit(c.db, u, "roles.matrix", "RolePermission", role, `Изменены разрешения роли «${ROLE_LABELS[role]}»`, { critical: touchesCritical, meta: { added, removed } });
  return { ok: true, added, removed };
});
