/**
 * Первоначальное наполнение хранилища при первом открытии сайта:
 * настройки, матрица ролей, шаблоны, владелец SAMER и демо-данные (помечены «Демо»).
 */
import type { DB, DocumentTemplate, Role, Settings } from "./db";
import { DEFAULT_ROLE_PERMISSIONS } from "./permissions";
import { DIVISIONS, TEMPLATES } from "./seedData";
import registry from "../themes/themes.json";

const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
const iso = (d: Date) => d.toISOString();

/**
 * Первоначальный пароль владельца SAMER хранится только в виде хеша PBKDF2.
 * При первом входе система потребует сменить его.
 */
const OWNER_HASH = "pbkdf2$150000$6txqHMdW/evh6zaqimDi8Q==$ErZ6pq982a0ktm0yJRjsJWnXaQ8p6SOw45yz4utgo9Q=";

export function defaultSettings(): Settings {
  return {
    portalName: "УМВД | Служебный портал",
    subtitle: "Единая система управления и координации подразделений",
    description: "Служебный портал игрового подразделения УМВД проекта «Кемерово РП». Все материалы относятся к ролевой игре.",
    contacts: "Discord сообщества: укажите ссылку в настройках портала",
    logoUrl: null,
    activeTheme: registry.defaultTheme,
    effectsEnabled: true,
    cursorGlow: true,
    themeBackgrounds: {},
    addressEnabled: true,
    addressTitle: "Обращение администрации",
    addressBody: "Уважаемые сотрудники и кандидаты! Портал запущен в рабочем режиме. Все заявки, рапорты и отчёты теперь подаются только через него. Вопросы и предложения направляйте через раздел «Обращения» в личном кабинете.",
    addressAuthor: "Администрация УМВД | Кемерово RP",
    registrationOpen: true,
    applicationsOpen: true,
    version: 1,
    updatedById: null,
    updatedAt: iso(new Date()),
  };
}

export function seedDatabase(ownerHash: string = OWNER_HASH): DB {
  const t = iso(new Date());
  const ownerId = id();
  const db: DB = {
    schemaVersion: 1,
    users: [{ id: ownerId, login: "samer", nickname: "SAMER", passwordHash: ownerHash, role: "OWNER", status: "ACTIVE", mustChangePassword: true, createdAt: t, updatedAt: t, lastLoginAt: null, adminSince: null, adminAssignedById: null }],
    userPermissions: [],
    rolePermissions: Object.entries(DEFAULT_ROLE_PERMISSIONS).flatMap(([role, perms]) => perms.map((permission) => ({ role: role as Role, permission }))),
    sessions: [], loginAttempts: [], audit: [], notifications: [],
    roleChanges: [{ id: id(), targetId: ownerId, actorId: null, previousRole: "USER", newRole: "OWNER", granted: ["*"], revoked: [], result: "SUCCESS", reason: "Первоначальная настройка портала", createdAt: t }],
    divisions: [], employees: [], hrRecords: [], applications: [], orders: [], templates: [], documents: [], news: [], events: [], participants: [], reports: [], appeals: [], appealMessages: [],
    settings: defaultSettings(),
  };

  // Шаблоны документов и структура подразделений (без вымышленных сотрудников)
  db.templates = TEMPLATES.map((tpl, i): DocumentTemplate => ({ ...tpl, fields: tpl.fields as DocumentTemplate["fields"], enabled: true, sortOrder: i, updatedAt: t }));
  for (const d of DIVISIONS) {
    db.divisions.push({ id: id(), code: d.code, name: d.name, shortName: d.shortName, description: d.description, tasks: "", status: "ACTIVE", enabled: true, sortOrder: d.sortOrder, headId: null, createdAt: t, updatedAt: t });
  }
  db.news.push({
    id: id(), title: "Служебный портал УМВД запущен", category: "IMPORTANT", pinned: true, isPublic: true, status: "PUBLISHED", authorId: ownerId, isDemo: false, createdAt: t, updatedAt: t,
    body: "Портал объединяет приказы, документооборот, кадровый учёт и расписание мероприятий. Зарегистрируйтесь и подайте анкету кандидата в личном кабинете.",
  });
  db.audit.push({ id: id(), actorId: null, actorName: "Система", action: "portal.init", entity: "System", entityId: null, summary: "Портал создан", critical: false, createdAt: t });
  return db;
}
