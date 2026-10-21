import { z } from "zod";
import { now, uid, type DB, type Employee, type HrRecord, type TemplateField } from "./db";
import { audit, badRequest, can, conflict, divisionScope, forbidden, has, me, need, needAny, notFound, notify, parse, q, rolePermissions, route, type AuthUser, type Ctx } from "./core";

const dateOk = (s: string) => !Number.isNaN(Date.parse(s));
const user = (db: DB, id: string | null | undefined) => (id ? db.users.find((u) => u.id === id) : undefined);
const nick = (db: DB, id: string | null | undefined) => (id ? { nickname: user(db, id)?.nickname ?? "—" } : null);
const empSel = (e: Employee) => ({ id: e.id, nickname: e.nickname, rank: e.rank, position: e.position, status: e.status, isDemo: e.isDemo });
const activeCount = (db: DB, divisionId: string) => db.employees.filter((e) => e.divisionId === divisionId && e.status !== "DISMISSED").length;

// ═════════════ Подразделения ═════════════
route("GET", "/divisions", (c) => {
  need(c, "portal.view");
  const all = c.query.get("all") === "1" && can(c, "divisions.manage");
  return {
    items: c.db.divisions
      .filter((d) => all || d.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((d) => {
        const head = c.db.employees.find((e) => e.id === d.headId);
        return { ...d, head: head ? empSel(head) : null, _count: { employees: activeCount(c.db, d.id), reports: c.db.reports.filter((r) => r.divisionId === d.id).length } };
      }),
  };
});

route("GET", "/divisions/:id", (c) => {
  need(c, "portal.view");
  const d = c.db.divisions.find((x) => x.id === c.params.id);
  if (!d) throw notFound("Подразделение не найдено");
  const head = c.db.employees.find((e) => e.id === d.headId);
  return {
    item: {
      ...d,
      head: head ? empSel(head) : null,
      employees: c.db.employees.filter((e) => e.divisionId === d.id && e.status !== "DISMISSED").sort((a, b) => a.nickname.localeCompare(b.nickname)).map(empSel),
      events: c.db.events.filter((e) => e.divisionId === d.id && e.status === "PLANNED" && e.startsAt >= now()).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 5),
    },
  };
});

const divSchema = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9_]+$/, "Код: заглавные латинские буквы, цифры, _"),
  name: z.string().trim().min(3, "Название: минимум 3 символа").max(120),
  shortName: z.string().trim().min(2).max(20),
  description: z.string().trim().min(10, "Описание: минимум 10 символов").max(3000),
  tasks: z.string().trim().max(3000).default(""),
  status: z.enum(["ACTIVE", "LIMITED", "INACTIVE"]).default("ACTIVE"),
  enabled: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  headId: z.string().max(64).nullable().optional(),
}).strict();

function checkHead(db: DB, headId: string | null | undefined, divisionId?: string) {
  if (!headId) return;
  const e = db.employees.find((x) => x.id === headId);
  if (!e || e.status === "DISMISSED") throw badRequest("Руководитель должен быть действующим сотрудником", { headId: "Не найден" });
  if (divisionId && e.divisionId !== divisionId) throw badRequest("Руководитель должен состоять в этом подразделении", { headId: "Другое подразделение" });
}

route("POST", "/divisions", (c) => {
  const u = need(c, "divisions.manage");
  const data = parse(divSchema, c.body);
  if (c.db.divisions.some((d) => d.code === data.code)) throw conflict("Подразделение с таким кодом уже существует");
  checkHead(c.db, data.headId);
  const d = { ...data, headId: data.headId ?? null, id: uid(), createdAt: now(), updatedAt: now() };
  c.db.divisions.push(d);
  audit(c.db, u, "division.create", "Division", d.id, `Создано подразделение «${d.name}»`);
  return { id: d.id };
});

route("PATCH", "/divisions/:id", (c) => {
  const u = need(c, "divisions.manage");
  const d = c.db.divisions.find((x) => x.id === c.params.id);
  if (!d) throw notFound();
  const data = parse(divSchema.partial(), c.body);
  if (data.code && data.code !== d.code && c.db.divisions.some((x) => x.code === data.code)) throw conflict("Код уже занят");
  checkHead(c.db, data.headId, d.id);
  Object.assign(d, data, { updatedAt: now() });
  audit(c.db, u, "division.update", "Division", d.id, `Изменено подразделение «${d.name}»`);
});

for (const [action, enabled] of [["archive", false], ["restore", true]] as const) {
  route("POST", `/divisions/:id/${action}`, (c) => {
    const u = need(c, "divisions.manage");
    const d = c.db.divisions.find((x) => x.id === c.params.id);
    if (!d) throw notFound();
    Object.assign(d, { enabled, status: enabled ? "ACTIVE" : "INACTIVE", updatedAt: now() });
    audit(c.db, u, `division.${action}`, "Division", d.id, `Подразделение «${d.name}» ${enabled ? "восстановлено" : "отправлено в архив"}`, { critical: !enabled });
  });
}

// ═════════════ Сотрудники ═════════════
const empView = (db: DB, e: Employee) => {
  const d = db.divisions.find((x) => x.id === e.divisionId);
  const u = user(db, e.userId);
  return { ...e, division: d ? { id: d.id, shortName: d.shortName, name: d.name } : null, user: u ? { id: u.id, login: u.login, nickname: u.nickname, role: u.role } : null };
};
const statusEnum = z.enum(["ACTIVE", "VACATION", "SUSPENDED", "DISMISSED"]);

route("GET", "/employees", (c) => {
  need(c, "employees.view");
  const s = q(c, "q"), division = q(c, "division"), status = q(c, "status"), sort = q(c, "sort") ?? "division";
  const divOrder = (id: string | null) => c.db.divisions.find((d) => d.id === id)?.sortOrder ?? 999;
  const cmp: Record<string, (a: Employee, b: Employee) => number> = {
    nickname: (a, b) => a.nickname.localeCompare(b.nickname),
    rank: (a, b) => a.rank.localeCompare(b.rank),
    joined: (a, b) => b.joinedAt.localeCompare(a.joinedAt),
    joined_asc: (a, b) => a.joinedAt.localeCompare(b.joinedAt),
    division: (a, b) => divOrder(a.divisionId) - divOrder(b.divisionId),
  };
  const items = c.db.employees
    .filter((e) => !s || has(e.nickname, s) || has(e.position, s) || has(e.rank, s))
    .filter((e) => !division || e.divisionId === division)
    .filter((e) => (status === "all" ? true : status && statusEnum.safeParse(status).success ? e.status === status : e.status !== "DISMISSED"))
    .sort((a, b) => (cmp[sort] ?? cmp.division)(a, b) || a.nickname.localeCompare(b.nickname));
  return { items: items.map((e) => empView(c.db, e)) };
});

route("GET", "/employees/:id", (c) => {
  need(c, "employees.view");
  const e = c.db.employees.find((x) => x.id === c.params.id);
  if (!e) throw notFound("Сотрудник не найден");
  const headOf = c.db.divisions.find((d) => d.headId === e.id);
  return {
    item: {
      ...empView(c.db, e),
      headOf: headOf ? { id: headOf.id, name: headOf.name } : null,
      hrRecords: can(c, "hr.view") ? c.db.hrRecords.filter((r) => r.employeeId === e.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : undefined,
    },
  };
});

const empSchema = z.object({
  nickname: z.string().trim().min(3, "Ник: минимум 3 символа").max(40),
  rank: z.string().trim().min(2, "Укажите звание").max(60),
  position: z.string().trim().min(2, "Укажите должность").max(120),
  divisionId: z.string().max(64).nullable(),
  status: statusEnum.default("ACTIVE"),
  joinedAt: z.string().refine(dateOk, "Некорректная дата").optional(),
  userId: z.string().max(64).nullable().optional(),
  comment: z.string().trim().max(500).optional(),
  orderRef: z.string().trim().max(60).optional(),
});

function assertScope(u: AuthUser, divisionId: string | null | undefined) {
  const scope = divisionScope(u);
  if (scope && divisionId !== scope) throw forbidden("Руководитель подразделения управляет только своим подразделением");
}
function linkUser(db: DB, u: AuthUser, userId: string, employeeId?: string) {
  if (!u.perms.has("users.manage")) throw forbidden("Привязка учётной записи требует права управления учётными записями");
  const target = user(db, userId);
  if (!target) throw badRequest("Учётная запись не найдена");
  const other = db.employees.find((e) => e.userId === userId && e.id !== employeeId);
  if (other) throw conflict("Учётная запись уже привязана к другому сотруднику");
  if (target.role === "USER" || target.role === "CANDIDATE") {
    const empPerms = rolePermissions(db, "EMPLOYEE");
    if (u.role === "OWNER" || [...empPerms].every((p) => u.perms.has(p))) {
      db.roleChanges.unshift({ id: uid(), targetId: target.id, actorId: u.id, previousRole: target.role, newRole: "EMPLOYEE", granted: [], revoked: [], result: "SUCCESS", reason: "Зачисление в состав", createdAt: now() });
      target.role = "EMPLOYEE";
    }
  }
}
const hr = (db: DB, r: Omit<HrRecord, "id" | "createdAt">) => db.hrRecords.push({ ...r, id: uid(), createdAt: now() });

route("POST", "/employees", (c) => {
  const u = need(c, "employees.manage");
  const data = parse(empSchema.strict(), c.body);
  assertScope(u, data.divisionId);
  if (data.userId) linkUser(c.db, u, data.userId);
  const e: Employee = { id: uid(), nickname: data.nickname, rank: data.rank, position: data.position, divisionId: data.divisionId, status: data.status, joinedAt: data.joinedAt ? new Date(data.joinedAt).toISOString() : now(), userId: data.userId ?? null, isDemo: false, createdAt: now(), updatedAt: now() };
  c.db.employees.push(e);
  const div = c.db.divisions.find((d) => d.id === e.divisionId);
  hr(c.db, { employeeId: e.id, type: "APPOINTMENT", fromValue: null, toValue: `${e.position} (${div?.shortName ?? "без подразделения"})`, comment: data.comment ?? null, orderRef: data.orderRef ?? null, actorId: u.id, actorName: u.nickname });
  audit(c.db, u, "employee.create", "Employee", e.id, `Принят(а) в состав: ${e.nickname}, ${e.rank}, ${e.position}`);
  if (e.userId) notify(c.db, e.userId, "Вы зачислены в состав", `${e.rank}, ${e.position}`, `/portal/employees/${e.id}`);
  return { id: e.id };
});

route("PATCH", "/employees/:id", (c) => {
  const u = need(c, "employees.manage");
  const e = c.db.employees.find((x) => x.id === c.params.id);
  if (!e) throw notFound("Сотрудник не найден");
  const data = parse(empSchema.partial().strict(), c.body);
  assertScope(u, e.divisionId);
  if (data.divisionId !== undefined && data.divisionId !== e.divisionId && divisionScope(u)) throw forbidden("Перевод в другое подразделение выполняет кадровая служба");
  if (data.userId !== undefined && data.userId !== e.userId && data.userId) linkUser(c.db, u, data.userId, e.id);
  const recs: { type: string; fromValue: string; toValue: string }[] = [];
  if (data.rank && data.rank !== e.rank) recs.push({ type: "RANK_CHANGE", fromValue: e.rank, toValue: data.rank });
  if (data.position && data.position !== e.position) recs.push({ type: "POSITION_CHANGE", fromValue: e.position, toValue: data.position });
  if (data.divisionId !== undefined && data.divisionId !== e.divisionId) {
    const prev = c.db.divisions.find((d) => d.id === e.divisionId), next = c.db.divisions.find((d) => d.id === data.divisionId);
    if (data.divisionId && !next) throw badRequest("Подразделение не найдено");
    recs.push({ type: "TRANSFER", fromValue: prev?.shortName ?? "—", toValue: next?.shortName ?? "—" });
  }
  if (data.status && data.status !== e.status) recs.push({ type: data.status === "DISMISSED" ? "DISMISSAL" : e.status === "DISMISSED" ? "REINSTATEMENT" : "NOTE", fromValue: e.status, toValue: data.status });
  if (recs.some((r) => r.type === "RANK_CHANGE" || r.type === "TRANSFER") && !u.perms.has("hr.manage") && !u.perms.has("divisions.manage")) throw forbidden("Изменение звания и переводы требуют права кадровых операций");
  const { comment, orderRef, joinedAt, ...rest } = data;
  Object.assign(e, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)), { updatedAt: now() }, joinedAt ? { joinedAt: new Date(joinedAt).toISOString() } : {});
  for (const r of recs) hr(c.db, { employeeId: e.id, ...r, comment: comment ?? null, orderRef: orderRef ?? null, actorId: u.id, actorName: u.nickname });
  audit(c.db, u, "employee.update", "Employee", e.id, `Изменена карточка сотрудника ${e.nickname}`, { meta: { changes: recs.map((r) => `${r.type}: ${r.fromValue} → ${r.toValue}`) } });
  if (e.userId && recs.length) notify(c.db, e.userId, "Кадровые изменения", recs.map((r) => `${r.fromValue} → ${r.toValue}`).join("; "), `/portal/employees/${e.id}`);
  return { ok: true, records: recs.length };
});

route("POST", "/employees/:id/dismiss", (c) => {
  const u = need(c, "employees.manage");
  const { comment, orderRef } = parse(z.object({ comment: z.string().trim().min(3, "Укажите основание").max(500), orderRef: z.string().trim().max(60).optional() }).strict(), c.body);
  const e = c.db.employees.find((x) => x.id === c.params.id);
  if (!e) throw notFound();
  assertScope(u, e.divisionId);
  if (e.status === "DISMISSED") throw badRequest("Сотрудник уже исключён");
  if (e.userId === u.id) throw forbidden("Нельзя исключить самого себя");
  hr(c.db, { employeeId: e.id, type: "DISMISSAL", fromValue: e.position, toValue: "Исключён", comment, orderRef: orderRef ?? null, actorId: u.id, actorName: u.nickname });
  e.status = "DISMISSED";
  c.db.divisions.forEach((d) => d.headId === e.id && (d.headId = null));
  audit(c.db, u, "employee.dismiss", "Employee", e.id, `Исключён(а) из состава: ${e.nickname}. Основание: ${comment}`, { critical: true });
  if (e.userId) notify(c.db, e.userId, "Исключение из состава", comment);
});

route("POST", "/employees/:id/notes", (c) => {
  const u = need(c, "hr.manage");
  const { comment } = parse(z.object({ comment: z.string().trim().min(3, "Заметка слишком короткая").max(1000) }).strict(), c.body);
  const e = c.db.employees.find((x) => x.id === c.params.id);
  if (!e) throw notFound();
  hr(c.db, { employeeId: e.id, type: "NOTE", fromValue: null, toValue: null, comment, orderRef: null, actorId: u.id, actorName: u.nickname });
  audit(c.db, u, "hr.note", "Employee", e.id, `Кадровая заметка: ${e.nickname}`);
});

route("GET", "/hr/records", (c) => {
  const u = need(c, "hr.view");
  const type = q(c, "type"), s = q(c, "q"), scope = divisionScope(u);
  return {
    items: c.db.hrRecords
      .map((r) => ({ r, e: c.db.employees.find((x) => x.id === r.employeeId) }))
      .filter(({ r, e }) => e && (!type || r.type === type) && (!s || has(e.nickname, s)) && (!scope || e.divisionId === scope))
      .sort((a, b) => b.r.createdAt.localeCompare(a.r.createdAt))
      .slice(0, 300)
      .map(({ r, e }) => {
        const d = c.db.divisions.find((x) => x.id === e!.divisionId);
        return { ...r, employee: { id: e!.id, nickname: e!.nickname, division: d ? { shortName: d.shortName } : null } };
      }),
  };
});

route("GET", "/hr/summary", (c) => {
  need(c, "hr.view");
  const byStatus = ["ACTIVE", "VACATION", "SUSPENDED", "DISMISSED"].map((status) => ({ status, _count: c.db.employees.filter((e) => e.status === status).length }));
  return { byStatus, byDivision: [], candidates: c.db.applications.filter((a) => a.status === "PENDING" || a.status === "INTERVIEW").length };
});

// ═════════════ Заявки кандидатов ═════════════
route("POST", "/applications", (c) => {
  const u = me(c);
  if (!c.db.settings.applicationsOpen) throw forbidden("Приём заявок временно закрыт");
  if (u.employeeId) throw badRequest("Вы уже состоите в составе");
  const data = parse(z.object({
    nickname: z.string().trim().min(3, "Игровой ник: минимум 3 символа").max(40),
    age: z.coerce.number({ error: "Укажите возраст" }).int().min(14, "Минимальный возраст — 14 лет").max(99),
    contact: z.string().trim().min(3, "Укажите Discord или другой контакт").max(80),
    divisionId: z.string().max(64).nullable().optional(),
    experience: z.string().trim().min(10, "Опишите опыт (минимум 10 символов)").max(2000),
    motivation: z.string().trim().min(20, "Мотивация: минимум 20 символов").max(3000),
  }).strict(), c.body);
  if (c.db.applications.some((a) => a.userId === u.id && (a.status === "PENDING" || a.status === "INTERVIEW"))) throw conflict("У вас уже есть заявка на рассмотрении");
  if (data.divisionId && !c.db.divisions.some((d) => d.id === data.divisionId && d.enabled)) throw badRequest("Подразделение не найдено");
  const a = { ...data, divisionId: data.divisionId ?? null, id: uid(), userId: u.id, status: "PENDING", reviewerId: null, reviewComment: null, createdAt: now(), updatedAt: now() };
  c.db.applications.unshift(a);
  const usr = user(c.db, u.id)!;
  if (usr.role === "USER") usr.role = "CANDIDATE";
  audit(c.db, u, "application.create", "Application", a.id, `Подана заявка на вступление: ${a.nickname}`);
  return { id: a.id };
});

route("GET", "/applications/my", (c) => ({ items: c.db.applications.filter((a) => a.userId === me(c).id) }));

route("POST", "/applications/:id/withdraw", (c) => {
  const u = me(c);
  const a = c.db.applications.find((x) => x.id === c.params.id && x.userId === u.id);
  if (!a) throw notFound("Заявка не найдена");
  if (!["PENDING", "INTERVIEW"].includes(a.status)) throw badRequest("Заявку уже нельзя отозвать");
  a.status = "WITHDRAWN";
  const usr = user(c.db, u.id)!;
  if (usr.role === "CANDIDATE") usr.role = "USER";
  audit(c.db, u, "application.withdraw", "Application", a.id, "Кандидат отозвал заявку");
});

route("GET", "/applications", (c) => {
  need(c, "applications.review");
  const status = q(c, "status");
  return {
    items: c.db.applications.filter((a) => !status || a.status === status).map((a) => {
      const usr = user(c.db, a.userId);
      return { ...a, user: { login: usr?.login ?? "—", nickname: usr?.nickname ?? "—", createdAt: usr?.createdAt ?? a.createdAt } };
    }),
    divisions: c.db.divisions.map((d) => ({ id: d.id, shortName: d.shortName })),
  };
});

route("POST", "/applications/:id/review", (c) => {
  const u = need(c, "applications.review");
  const data = parse(z.object({ status: z.enum(["INTERVIEW", "APPROVED", "REJECTED"]), comment: z.string().trim().max(1000).optional(), rank: z.string().trim().max(60).optional(), position: z.string().trim().max(120).optional(), divisionId: z.string().max(64).nullable().optional() }).strict(), c.body);
  const a = c.db.applications.find((x) => x.id === c.params.id);
  if (!a) throw notFound("Заявка не найдена");
  if (!["PENDING", "INTERVIEW"].includes(a.status)) throw badRequest("Заявка уже рассмотрена");
  if (a.userId === u.id) throw forbidden("Нельзя рассматривать собственную заявку");
  if (data.status === "REJECTED" && !data.comment) throw badRequest("Укажите причину отказа", { comment: "Обязательно при отказе" });
  Object.assign(a, { status: data.status, reviewComment: data.comment ?? null, reviewerId: u.id, updatedAt: now() });
  const usr = user(c.db, a.userId)!;
  if (data.status === "APPROVED" && !c.db.employees.some((e) => e.userId === a.userId)) {
    const e: Employee = { id: uid(), nickname: a.nickname, rank: data.rank || "Рядовой полиции", position: data.position || "Стажёр", divisionId: data.divisionId !== undefined ? data.divisionId : a.divisionId, userId: a.userId, status: "ACTIVE", joinedAt: now(), isDemo: false, createdAt: now(), updatedAt: now() };
    c.db.employees.push(e);
    hr(c.db, { employeeId: e.id, type: "APPOINTMENT", fromValue: null, toValue: e.position, comment: "Зачислен(а) по заявке", orderRef: null, actorId: u.id, actorName: u.nickname });
    if (usr.role === "USER" || usr.role === "CANDIDATE") {
      c.db.roleChanges.unshift({ id: uid(), targetId: usr.id, actorId: u.id, previousRole: usr.role, newRole: "EMPLOYEE", granted: [], revoked: [], result: "SUCCESS", reason: "Одобрена заявка", createdAt: now() });
      usr.role = "EMPLOYEE";
    }
  }
  if (data.status === "REJECTED" && usr.role === "CANDIDATE") usr.role = "USER";
  const label = { INTERVIEW: "приглашение на собеседование", APPROVED: "одобрена", REJECTED: "отклонена" }[data.status];
  audit(c.db, u, "application.review", "Application", a.id, `Заявка ${a.nickname}: ${label}`);
  notify(c.db, a.userId, "Решение по заявке", `Ваша заявка: ${label}.${data.comment ? ` Комментарий: ${data.comment}` : ""}`, "/cabinet");
});

// ═════════════ Приказы ═════════════
const orderCats = z.enum(["PERSONNEL", "ORGANIZATIONAL", "TRAINING", "DISCIPLINARY", "GENERAL"]);
const orderVisible = (c: Ctx) => (o: DB["orders"][number]) => can(c, "orders.publish") || o.status === "PUBLISHED" || (can(c, "orders.create") && o.authorId === c.user!.id);
const orderView = (db: DB, o: DB["orders"][number]) => ({ ...o, author: o.authorId ? { id: o.authorId, nickname: user(db, o.authorId)?.nickname ?? "—" } : null });

route("GET", "/orders", (c) => {
  need(c, "portal.view");
  const s = q(c, "q"), cat = q(c, "category"), status = q(c, "status");
  return {
    items: c.db.orders
      .filter(orderVisible(c))
      .filter((o) => (!s || has(o.title, s) || has(o.number, s) || has(o.content, s)) && (!cat || o.category === cat) && (!status || o.status === status))
      .sort((a, b) => (!a.publishedAt ? -1 : !b.publishedAt ? 1 : b.publishedAt.localeCompare(a.publishedAt)) || b.createdAt.localeCompare(a.createdAt))
      .map((o) => orderView(c.db, o)),
  };
});
route("GET", "/orders/:id", (c) => {
  need(c, "portal.view");
  const o = c.db.orders.find((x) => x.id === c.params.id);
  if (!o || !orderVisible(c)(o)) throw notFound("Приказ не найден");
  return { item: orderView(c.db, o) };
});
const orderSchema = z.object({
  number: z.string().trim().max(30).optional(),
  title: z.string().trim().min(5, "Название: минимум 5 символов").max(200),
  category: orderCats,
  content: z.string().trim().min(20, "Текст приказа: минимум 20 символов").max(20000),
  publish: z.boolean().optional(),
}).strict();
function nextNumber(db: DB) {
  const y = new Date().getFullYear();
  for (let n = db.orders.filter((o) => o.createdAt.startsWith(String(y))).length + 1; ; n++) {
    const num = `${String(n).padStart(3, "0")}/${y}`;
    if (!db.orders.some((o) => o.number === num)) return num;
  }
}
route("POST", "/orders", (c) => {
  const u = need(c, "orders.create");
  const { publish, ...data } = parse(orderSchema, c.body);
  if (publish && !u.perms.has("orders.publish")) throw forbidden("Публиковать приказы может только уполномоченный руководитель");
  const number = data.number || nextNumber(c.db);
  if (c.db.orders.some((o) => o.number === number)) throw conflict(`Приказ № ${number} уже существует`);
  const o = { ...data, number, id: uid(), authorId: u.id, status: (publish ? "PUBLISHED" : "DRAFT") as "PUBLISHED" | "DRAFT", publishedAt: publish ? now() : null, isDemo: false, createdAt: now(), updatedAt: now() };
  c.db.orders.push(o);
  audit(c.db, u, publish ? "order.publish" : "order.create", "Order", o.id, `${publish ? "Опубликован" : "Создан черновик"} приказ № ${o.number} «${o.title}»`);
  return { id: o.id };
});
route("PATCH", "/orders/:id", (c) => {
  const u = need(c, "orders.create");
  const o = c.db.orders.find((x) => x.id === c.params.id);
  if (!o) throw notFound();
  const { publish: _p, ...data } = parse(orderSchema.partial(), c.body);
  if (!u.perms.has("orders.publish") && !(o.authorId === u.id && o.status === "DRAFT")) throw forbidden("Редактировать можно только собственные черновики");
  if (data.number && data.number !== o.number && c.db.orders.some((x) => x.number === data.number)) throw conflict("Номер уже занят");
  Object.assign(o, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== "")), { updatedAt: now() });
  audit(c.db, u, "order.update", "Order", o.id, `Изменён приказ № ${o.number}`);
});
for (const [action, status, label] of [["publish", "PUBLISHED", "Опубликован"], ["archive", "ARCHIVED", "Отправлен в архив"], ["restore", "PUBLISHED", "Восстановлен из архива"]] as const) {
  route("POST", `/orders/:id/${action}`, (c) => {
    const u = need(c, "orders.publish");
    const o = c.db.orders.find((x) => x.id === c.params.id);
    if (!o) throw notFound();
    if (o.status === status) throw badRequest("Статус уже установлен");
    o.status = status;
    if (status === "PUBLISHED" && !o.publishedAt) o.publishedAt = now();
    audit(c.db, u, `order.${action}`, "Order", o.id, `${label} приказ № ${o.number} «${o.title}»`, { critical: status === "ARCHIVED" });
  });
}

// ═════════════ Документы ═════════════
route("GET", "/documents/templates", (c) => {
  needAny(c, "documents.create", "templates.manage");
  return { items: c.db.templates.filter((t) => can(c, "templates.manage") || t.enabled).sort((a, b) => a.sortOrder - b.sortOrder) };
});
route("PATCH", "/documents/templates/:type", (c) => {
  const u = need(c, "templates.manage");
  const data = parse(z.object({ name: z.string().trim().min(3).max(80), description: z.string().trim().max(400), enabled: z.boolean() }).partial().strict(), c.body);
  const t = c.db.templates.find((x) => x.type === c.params.type);
  if (!t) throw notFound();
  Object.assign(t, data, { updatedAt: now() });
  audit(c.db, u, "template.update", "DocumentTemplate", t.type, `Изменён шаблон «${t.name}»${data.enabled === false ? " (отключён)" : ""}`);
});

function validateData(fields: TemplateField[], data: Record<string, unknown>, strict: boolean) {
  const out: Record<string, string> = {}, errors: Record<string, string> = {};
  for (const f of fields) {
    const raw = data[f.key];
    const v = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
    if (!v) {
      if (strict && f.required) errors[`data.${f.key}`] = `${f.label}: обязательное поле`;
      continue;
    }
    if (v.length > (f.max ?? 5000)) errors[`data.${f.key}`] = `${f.label}: слишком длинное значение`;
    if (f.type === "date" && !dateOk(v)) errors[`data.${f.key}`] = `${f.label}: некорректная дата`;
    if (f.type === "number" && !/^\d{1,6}$/.test(v)) errors[`data.${f.key}`] = `${f.label}: введите число`;
    if (f.type === "select" && f.options && !f.options.includes(v)) errors[`data.${f.key}`] = `${f.label}: выберите значение из списка`;
    out[f.key] = v;
  }
  if (Object.keys(errors).length) throw badRequest("Проверьте заполнение документа", errors);
  return out;
}
const authorView = (db: DB, id: string) => {
  const usr = user(db, id), e = db.employees.find((x) => x.userId === id), d = e && db.divisions.find((x) => x.id === e.divisionId);
  return { id, nickname: usr?.nickname ?? "—", employee: e ? { rank: e.rank, position: e.position, division: d ? { name: d.name, shortName: d.shortName } : null } : null };
};
const authorDivision = (db: DB, userId: string) => db.employees.find((e) => e.userId === userId)?.divisionId ?? null;

route("GET", "/documents", (c) => {
  const u = needAny(c, "documents.create", "documents.review");
  const scope = c.query.get("scope") === "all" && can(c, "documents.review") ? "all" : "mine";
  const div = divisionScope(u), status = q(c, "status"), type = q(c, "type"), s = q(c, "q");
  const items = c.db.documents
    .filter((d) => (scope === "mine" ? d.authorId === u.id : d.status !== "DRAFT" || d.authorId === u.id))
    .filter((d) => !(scope === "all" && div) || authorDivision(c.db, d.authorId) === div)
    .filter((d) => (!status || d.status === status) && (!type || d.type === type) && (!s || has(d.title, s) || has(user(c.db, d.authorId)?.nickname, s)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((d) => ({ ...d, author: authorView(c.db, d.authorId) }));
  return { items, scope };
});

function loadDoc(c: Ctx) {
  const u = me(c);
  const d = c.db.documents.find((x) => x.id === c.params.id);
  if (!d) throw notFound("Документ не найден");
  const own = d.authorId === u.id;
  if (!own) {
    if (!can(c, "documents.review") || d.status === "DRAFT") throw forbidden("Нет доступа к документу");
    const div = divisionScope(u);
    if (div && authorDivision(c.db, d.authorId) !== div) throw forbidden("Документ другого подразделения");
  }
  return { d, own, u };
}
route("GET", "/documents/:id", (c) => {
  const { d } = loadDoc(c);
  return { item: { ...d, author: authorView(c.db, d.authorId) }, template: c.db.templates.find((t) => t.type === d.type) ?? null };
});
const docSchema = z.object({ type: z.string().max(40), title: z.string().trim().min(3, "Заголовок: минимум 3 символа").max(200), data: z.record(z.string(), z.union([z.string().max(10000), z.number()])), submit: z.boolean().optional() }).strict();
route("POST", "/documents", (c) => {
  const u = need(c, "documents.create");
  const body = parse(docSchema, c.body);
  const tpl = c.db.templates.find((t) => t.type === body.type);
  if (!tpl || !tpl.enabled) throw badRequest("Шаблон документа недоступен");
  const data = validateData(tpl.fields, body.data, !!body.submit);
  const d = { id: uid(), type: body.type, title: body.title, data, authorId: u.id, status: body.submit ? "SUBMITTED" : "DRAFT", reviewerId: null, reviewComment: null, isDemo: false, createdAt: now(), updatedAt: now() };
  c.db.documents.push(d);
  audit(c.db, u, body.submit ? "document.submit" : "document.create", "Document", d.id, `${body.submit ? "Подан" : "Создан черновик"}: ${tpl.name} «${d.title}»`);
  return { id: d.id };
});
route("PATCH", "/documents/:id", (c) => {
  need(c, "documents.create");
  const { d, own, u } = loadDoc(c);
  if (!own) throw forbidden("Редактировать можно только собственные документы");
  if (!["DRAFT", "RETURNED"].includes(d.status)) throw badRequest("Поданный документ нельзя редактировать");
  const body = parse(docSchema.omit({ type: true }).partial(), c.body);
  const tpl = c.db.templates.find((t) => t.type === d.type)!;
  const data = body.data ? validateData(tpl.fields, body.data, !!body.submit) : undefined;
  if (body.submit && !data) validateData(tpl.fields, d.data, true);
  if (body.title) d.title = body.title;
  if (data) d.data = data;
  if (body.submit) Object.assign(d, { status: "SUBMITTED", reviewComment: null });
  d.updatedAt = now();
  audit(c.db, u, body.submit ? "document.submit" : "document.update", "Document", d.id, `${body.submit ? "Подан" : "Изменён"} документ «${d.title}»`);
  return { id: d.id };
});
route("POST", "/documents/:id/review", (c) => {
  need(c, "documents.review");
  const { d, own, u } = loadDoc(c);
  if (own) throw forbidden("Нельзя проверять собственный документ");
  if (d.status !== "SUBMITTED") throw badRequest("Документ не ожидает проверки");
  const { status, comment } = parse(z.object({ status: z.enum(["ACCEPTED", "RETURNED"]), comment: z.string().trim().max(1000).optional() }).strict(), c.body);
  if (status === "RETURNED" && !comment) throw badRequest("Укажите причину возврата", { comment: "Обязательно" });
  Object.assign(d, { status, reviewComment: comment ?? null, reviewerId: u.id, updatedAt: now() });
  audit(c.db, u, "document.review", "Document", d.id, `Документ «${d.title}» ${status === "ACCEPTED" ? "принят" : "возвращён на доработку"}`);
  notify(c.db, d.authorId, status === "ACCEPTED" ? "Документ принят" : "Документ возвращён", `«${d.title}»${comment ? `: ${comment}` : ""}`, `/portal/documents/${d.id}`);
});
route("POST", "/documents/:id/archive", (c) => {
  const { d, own, u } = loadDoc(c);
  if (!own && !can(c, "documents.review")) throw forbidden();
  d.status = "ARCHIVED";
  audit(c.db, u, "document.archive", "Document", d.id, `Документ «${d.title}» отправлен в архив`);
});

// ═════════════ Новости ═════════════
const newsCats = z.enum(["NEWS", "ANNOUNCEMENT", "IMPORTANT", "INTERNAL"]);
route("GET", "/news", (c) => {
  need(c, "portal.view");
  const s = q(c, "q"), cat = q(c, "category"), view = q(c, "view");
  const status = view === "archive" ? "ARCHIVED" : view === "drafts" && can(c, "news.manage") ? "DRAFT" : "PUBLISHED";
  return {
    items: c.db.news
      .filter((n) => n.status === status && (!cat || n.category === cat) && (!s || has(n.title, s) || has(n.body, s)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))
      .map((n) => ({ ...n, author: nick(c.db, n.authorId) })),
  };
});
const newsSchema = z.object({ title: z.string().trim().min(5, "Заголовок: минимум 5 символов").max(200), body: z.string().trim().min(10, "Текст: минимум 10 символов").max(10000), category: newsCats, pinned: z.boolean().default(false), isPublic: z.boolean().default(false), status: z.enum(["DRAFT", "PUBLISHED"]).default("PUBLISHED") }).strict();
route("POST", "/news", (c) => {
  const u = need(c, "news.manage");
  const data = parse(newsSchema, c.body);
  const n = { ...data, id: uid(), authorId: u.id, isDemo: false, createdAt: now(), updatedAt: now() };
  c.db.news.push(n);
  audit(c.db, u, "news.create", "News", n.id, `${n.status === "PUBLISHED" ? "Опубликовано" : "Создан черновик"}: «${n.title}»`);
  return { id: n.id };
});
route("PATCH", "/news/:id", (c) => {
  const u = need(c, "news.manage");
  const n = c.db.news.find((x) => x.id === c.params.id);
  if (!n) throw notFound();
  Object.assign(n, parse(newsSchema.partial(), c.body), { updatedAt: now() });
  audit(c.db, u, "news.update", "News", n.id, `Изменена публикация «${n.title}»`);
});
route("POST", "/news/:id/archive", (c) => {
  const u = need(c, "news.manage");
  const n = c.db.news.find((x) => x.id === c.params.id);
  if (!n) throw notFound();
  n.status = n.status === "ARCHIVED" ? "PUBLISHED" : "ARCHIVED";
  if (n.status === "ARCHIVED") n.pinned = false;
  audit(c.db, u, n.status === "ARCHIVED" ? "news.archive" : "news.restore", "News", n.id, `«${n.title}» ${n.status === "ARCHIVED" ? "перенесено в архив" : "восстановлено"}`);
  return { ok: true, status: n.status };
});
route("POST", "/news/:id/pin", (c) => {
  const u = need(c, "news.manage");
  const n = c.db.news.find((x) => x.id === c.params.id);
  if (!n) throw notFound();
  n.pinned = !n.pinned;
  audit(c.db, u, "news.pin", "News", n.id, `«${n.title}» ${n.pinned ? "закреплено" : "откреплено"}`);
  return { ok: true, pinned: n.pinned };
});

// ═════════════ Мероприятия ═════════════
const evTypes = z.enum(["FORMATION", "BRIEFING", "INSPECTION", "TRAINING", "MEETING", "OPERATION"]);
const evStatuses = z.enum(["PLANNED", "DONE", "CANCELLED", "ARCHIVED"]);
route("GET", "/events", (c) => {
  const u = need(c, "portal.view");
  const from = q(c, "from"), to = q(c, "to"), type = q(c, "type"), status = q(c, "status");
  return {
    items: c.db.events
      .filter((e) => (!from || e.startsAt >= new Date(from).toISOString()) && (!to || e.startsAt <= new Date(to).toISOString()) && (!type || e.type === type) && (status ? e.status === status : e.status !== "ARCHIVED"))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((e) => {
        const d = c.db.divisions.find((x) => x.id === e.divisionId);
        const parts = c.db.participants.filter((p) => p.eventId === e.id);
        return { ...e, organizer: nick(c.db, e.organizerId), division: d ? { shortName: d.shortName } : null, _count: { participants: parts.length }, joined: parts.some((p) => p.userId === u.id) };
      }),
  };
});
route("GET", "/events/:id", (c) => {
  const u = need(c, "portal.view");
  const e = c.db.events.find((x) => x.id === c.params.id);
  if (!e) throw notFound("Мероприятие не найдено");
  const d = c.db.divisions.find((x) => x.id === e.divisionId);
  const participants = c.db.participants.filter((p) => p.eventId === e.id).map((p) => {
    const emp = c.db.employees.find((x) => x.userId === p.userId);
    return { userId: p.userId, user: { id: p.userId, nickname: user(c.db, p.userId)?.nickname ?? "—", employee: emp ? { rank: emp.rank } : null } };
  });
  return { item: { ...e, organizer: nick(c.db, e.organizerId), division: d ? { id: d.id, shortName: d.shortName, name: d.name } : null, participants, joined: participants.some((p) => p.userId === u.id) } };
});
const evSchema = z.object({
  title: z.string().trim().min(3, "Название: минимум 3 символа").max(160),
  type: evTypes,
  startsAt: z.string().refine(dateOk, "Укажите дату и время начала"),
  endsAt: z.string().refine(dateOk, "Некорректная дата окончания").nullable().optional(),
  location: z.string().trim().min(2, "Укажите место в игровом мире").max(160),
  description: z.string().trim().max(4000).default(""),
  divisionId: z.string().max(64).nullable().optional(),
  status: evStatuses.optional(),
}).strict();
function checkEvent(u: AuthUser, startsAt?: string, endsAt?: string | null, divisionId?: string | null) {
  if (startsAt && endsAt && Date.parse(endsAt) < Date.parse(startsAt)) throw badRequest("Окончание раньше начала", { endsAt: "Должно быть позже начала" });
  const scope = divisionScope(u);
  if (scope && divisionId !== undefined && divisionId !== scope) throw forbidden("Руководитель подразделения создаёт мероприятия только своего подразделения");
}
route("POST", "/events", (c) => {
  const u = need(c, "events.manage");
  const data = parse(evSchema, c.body);
  const scope = divisionScope(u);
  if (scope && !data.divisionId) data.divisionId = scope;
  checkEvent(u, data.startsAt, data.endsAt, data.divisionId);
  const e = { ...data, id: uid(), startsAt: new Date(data.startsAt).toISOString(), endsAt: data.endsAt ? new Date(data.endsAt).toISOString() : null, divisionId: data.divisionId ?? null, status: "PLANNED", organizerId: u.id, isDemo: false, createdAt: now(), updatedAt: now() };
  c.db.events.push(e);
  audit(c.db, u, "event.create", "Event", e.id, `Создано мероприятие «${e.title}» на ${new Date(e.startsAt).toLocaleString("ru-RU")}`);
  return { id: e.id };
});
route("PATCH", "/events/:id", (c) => {
  const u = need(c, "events.manage");
  const e = c.db.events.find((x) => x.id === c.params.id);
  if (!e) throw notFound();
  const scope = divisionScope(u);
  if (scope && e.divisionId !== scope) throw forbidden("Мероприятие другого подразделения");
  const data = parse(evSchema.partial(), c.body);
  checkEvent(u, data.startsAt ?? e.startsAt, data.endsAt, data.divisionId);
  Object.assign(e, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)), {
    startsAt: data.startsAt ? new Date(data.startsAt).toISOString() : e.startsAt,
    endsAt: data.endsAt === undefined ? e.endsAt : data.endsAt ? new Date(data.endsAt).toISOString() : null,
    updatedAt: now(),
  });
  audit(c.db, u, "event.update", "Event", e.id, `Изменено мероприятие «${e.title}»${data.status ? ` (статус: ${data.status})` : ""}`);
});
route("POST", "/events/:id/join", (c) => {
  const u = need(c, "events.join");
  const e = c.db.events.find((x) => x.id === c.params.id);
  if (!e) throw notFound();
  if (e.status !== "PLANNED") throw badRequest("Запись на мероприятие закрыта");
  if (!c.db.participants.some((p) => p.eventId === e.id && p.userId === u.id)) c.db.participants.push({ eventId: e.id, userId: u.id, createdAt: now() });
});
route("POST", "/events/:id/leave", (c) => {
  const u = need(c, "events.join");
  c.db.participants = c.db.participants.filter((p) => !(p.eventId === c.params.id && p.userId === u.id));
});

// ═════════════ Отчётность ═════════════
const repView = (db: DB, r: DB["reports"][number]) => {
  const d = db.divisions.find((x) => x.id === r.divisionId);
  return { ...r, division: { id: r.divisionId, shortName: d?.shortName ?? "—", name: d?.name ?? "—" }, author: nick(db, r.authorId) ?? { nickname: "—" } };
};
route("GET", "/reports", (c) => {
  const u = needAny(c, "reports.create", "reports.review");
  const reviewer = can(c, "reports.review"), scope = divisionScope(u);
  const division = q(c, "division"), status = q(c, "status"), s = q(c, "q");
  const list = c.db.reports
    .filter((r) => (reviewer ? !scope || r.divisionId === scope || r.authorId === u.id : r.authorId === u.id))
    .filter((r) => (!division || r.divisionId === division) && (!status || r.status === status) && (!s || has(r.title, s) || has(r.tasksDone, s)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const byStatus: Record<string, number> = {};
  for (const r of list) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  return { items: list.map((r) => repView(c.db, r)), summary: { total: list.length, participants: list.reduce((n, r) => n + r.participants, 0), byStatus } };
});
const repSchema = z.object({
  divisionId: z.string({ error: "Выберите подразделение" }).min(1, "Выберите подразделение").max(64),
  title: z.string().trim().min(5, "Название: минимум 5 символов").max(200),
  periodFrom: z.string().refine(dateOk, "Укажите начало периода"),
  periodTo: z.string().refine(dateOk, "Укажите конец периода"),
  tasksDone: z.string().trim().min(10, "Опишите выполненные задачи").max(8000),
  participants: z.coerce.number({ error: "Укажите число" }).int().min(0).max(1000),
  results: z.string().trim().min(5, "Опишите результаты").max(8000),
}).strict();
route("POST", "/reports", (c) => {
  const u = need(c, "reports.create");
  const data = parse(repSchema, c.body);
  if (Date.parse(data.periodTo) < Date.parse(data.periodFrom)) throw badRequest("Конец периода раньше начала", { periodTo: "Раньше начала" });
  if (!c.db.divisions.some((d) => d.id === data.divisionId)) throw badRequest("Подразделение не найдено");
  if (!can(c, "reports.review") && u.divisionId && u.divisionId !== data.divisionId) throw forbidden("Отчёт подаётся только по своему подразделению");
  const r = { ...data, id: uid(), periodFrom: new Date(data.periodFrom).toISOString(), periodTo: new Date(data.periodTo).toISOString(), headComment: null, status: "PENDING", authorId: u.id, reviewerId: null, isDemo: false, createdAt: now(), updatedAt: now() };
  c.db.reports.push(r);
  audit(c.db, u, "report.create", "Report", r.id, `Подан отчёт «${r.title}»`);
  return { id: r.id };
});
route("PATCH", "/reports/:id", (c) => {
  const u = need(c, "reports.create");
  const r = c.db.reports.find((x) => x.id === c.params.id);
  if (!r) throw notFound();
  if (r.authorId !== u.id) throw forbidden("Редактировать можно только свой отчёт");
  if (r.status !== "REVISION" && r.status !== "PENDING") throw badRequest("Отчёт уже рассмотрен");
  const data = parse(repSchema.partial(), c.body);
  Object.assign(r, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)), {
    periodFrom: data.periodFrom ? new Date(data.periodFrom).toISOString() : r.periodFrom,
    periodTo: data.periodTo ? new Date(data.periodTo).toISOString() : r.periodTo,
    status: "PENDING", updatedAt: now(),
  });
  audit(c.db, u, "report.update", "Report", r.id, `Отчёт «${r.title}» исправлен и повторно подан`);
});
route("POST", "/reports/:id/review", (c) => {
  const u = need(c, "reports.review");
  const r = c.db.reports.find((x) => x.id === c.params.id);
  if (!r) throw notFound();
  const scope = divisionScope(u);
  if (scope && r.divisionId !== scope) throw forbidden("Отчёт другого подразделения");
  if (r.authorId === u.id) throw forbidden("Нельзя проверять собственный отчёт");
  const { status, headComment } = parse(z.object({ status: z.enum(["APPROVED", "REVISION", "REJECTED"]), headComment: z.string().trim().max(2000).optional() }).strict(), c.body);
  if (status !== "APPROVED" && !headComment) throw badRequest("Добавьте комментарий руководителя", { headComment: "Обязательно" });
  Object.assign(r, { status, headComment: headComment ?? null, reviewerId: u.id, updatedAt: now() });
  const label = { APPROVED: "утверждён", REVISION: "возвращён на доработку", REJECTED: "отклонён" }[status];
  audit(c.db, u, "report.review", "Report", r.id, `Отчёт «${r.title}» ${label}`);
  notify(c.db, r.authorId, "Проверка отчёта", `Отчёт «${r.title}» ${label}`, "/portal/reports");
});

// ═════════════ Обращения ═════════════
const apCats = z.enum(["QUESTION", "COMPLAINT", "SUGGESTION", "PUNISHMENT_APPEAL", "TECHNICAL"]);
const apStatuses = z.enum(["OPEN", "IN_PROGRESS", "ANSWERED", "CLOSED"]);
const msgCount = (db: DB, id: string) => db.appealMessages.filter((m) => m.appealId === id).length;
route("POST", "/appeals", (c) => {
  const u = me(c);
  const data = parse(z.object({ category: apCats, subject: z.string().trim().min(5, "Тема: минимум 5 символов").max(160), body: z.string().trim().min(10, "Текст обращения: минимум 10 символов").max(5000) }).strict(), c.body);
  if (c.db.appeals.filter((a) => a.authorId === u.id && (a.status === "OPEN" || a.status === "IN_PROGRESS")).length >= 5) throw badRequest("У вас уже 5 открытых обращений. Дождитесь ответа по ним.");
  const a = { id: uid(), authorId: u.id, category: data.category, subject: data.subject, status: "OPEN", assigneeId: null, createdAt: now(), updatedAt: now() };
  c.db.appeals.push(a);
  c.db.appealMessages.push({ id: uid(), appealId: a.id, authorId: u.id, body: data.body, isStaff: false, createdAt: now() });
  audit(c.db, u, "appeal.create", "Appeal", a.id, `Новое обращение: «${a.subject}»`);
  return { id: a.id };
});
route("GET", "/appeals/my", (c) => ({ items: c.db.appeals.filter((a) => a.authorId === me(c).id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((a) => ({ ...a, _count: { messages: msgCount(c.db, a.id) } })) }));
route("GET", "/appeals", (c) => {
  need(c, "appeals.handle");
  const status = q(c, "status"), cat = q(c, "category"), s = q(c, "q");
  const order = ["OPEN", "IN_PROGRESS", "ANSWERED", "CLOSED"];
  return {
    items: c.db.appeals
      .filter((a) => (!status || a.status === status) && (!cat || a.category === cat) && (!s || has(a.subject, s) || has(user(c.db, a.authorId)?.nickname, s)))
      .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.updatedAt.localeCompare(a.updatedAt))
      .map((a) => ({ ...a, author: { nickname: user(c.db, a.authorId)?.nickname ?? "—", login: user(c.db, a.authorId)?.login ?? "" }, _count: { messages: msgCount(c.db, a.id) } })),
  };
});
function loadAppeal(c: Ctx) {
  const u = me(c);
  const a = c.db.appeals.find((x) => x.id === c.params.id);
  if (!a) throw notFound("Обращение не найдено");
  const own = a.authorId === u.id, staff = can(c, "appeals.handle");
  if (!own && !staff) throw forbidden("Нет доступа к обращению");
  return { a, own, staff, u };
}
route("GET", "/appeals/:id", (c) => {
  const { a } = loadAppeal(c);
  return {
    item: {
      ...a,
      author: { id: a.authorId, nickname: user(c.db, a.authorId)?.nickname ?? "—" },
      assignee: a.assigneeId ? user(c.db, a.assigneeId)?.nickname ?? null : null,
      messages: c.db.appealMessages.filter((m) => m.appealId === a.id).sort((x, y) => x.createdAt.localeCompare(y.createdAt)).map((m) => ({ ...m, author: nick(c.db, m.authorId) })),
    },
  };
});
route("POST", "/appeals/:id/messages", (c) => {
  const { a, own, staff, u } = loadAppeal(c);
  if (a.status === "CLOSED") throw badRequest("Обращение закрыто");
  const { body } = parse(z.object({ body: z.string().trim().min(2, "Введите текст").max(5000) }).strict(), c.body);
  const asStaff = staff && !own;
  c.db.appealMessages.push({ id: uid(), appealId: a.id, authorId: u.id, body, isStaff: asStaff, createdAt: now() });
  a.status = asStaff ? "ANSWERED" : "OPEN";
  if (asStaff && !a.assigneeId) a.assigneeId = u.id;
  a.updatedAt = now();
  if (asStaff) {
    notify(c.db, a.authorId, "Ответ на обращение", `Администрация ответила на обращение «${a.subject}»`, `/cabinet/appeals/${a.id}`);
    audit(c.db, u, "appeal.answer", "Appeal", a.id, `Ответ на обращение «${a.subject}»`);
  }
});
route("POST", "/appeals/:id/status", (c) => {
  need(c, "appeals.handle");
  const { a, u } = loadAppeal(c);
  const { status } = parse(z.object({ status: apStatuses }).strict(), c.body);
  a.status = status;
  if (status === "IN_PROGRESS") a.assigneeId = u.id;
  a.updatedAt = now();
  audit(c.db, u, "appeal.status", "Appeal", a.id, `Обращение «${a.subject}»: статус ${status}`);
  if (status === "CLOSED") notify(c.db, a.authorId, "Обращение закрыто", `«${a.subject}»`, `/cabinet/appeals/${a.id}`);
});
route("POST", "/appeals/:id/close", (c) => {
  const { a, own, u } = loadAppeal(c);
  if (!own) throw forbidden();
  a.status = "CLOSED";
  a.updatedAt = now();
  audit(c.db, u, "appeal.close", "Appeal", a.id, `Автор закрыл обращение «${a.subject}»`);
});
