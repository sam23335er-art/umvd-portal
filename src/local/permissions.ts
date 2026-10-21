import type { Role } from "./db";

/** Каталог разрешений (тот же, что был на сервере). */
export const PERMISSIONS = {
  "portal.view": { label: "Доступ к служебному порталу", group: "Портал" },
  "admin.access": { label: "Вход в административную панель", group: "Портал" },
  "employees.view": { label: "Просмотр состава", group: "Кадры" },
  "employees.manage": { label: "Управление сотрудниками", group: "Кадры" },
  "hr.view": { label: "Просмотр кадрового раздела", group: "Кадры" },
  "hr.manage": { label: "Кадровые операции (звания, переводы)", group: "Кадры" },
  "applications.review": { label: "Рассмотрение заявок кандидатов", group: "Кадры" },
  "divisions.manage": { label: "Управление подразделениями", group: "Структура" },
  "orders.create": { label: "Подготовка приказов (черновики)", group: "Документы" },
  "orders.publish": { label: "Публикация и архивирование приказов", group: "Документы" },
  "documents.create": { label: "Создание собственных документов", group: "Документы" },
  "documents.review": { label: "Проверка документов сотрудников", group: "Документы" },
  "templates.manage": { label: "Управление шаблонами документов", group: "Документы" },
  "reports.create": { label: "Подача отчётов", group: "Отчётность" },
  "reports.review": { label: "Проверка отчётов", group: "Отчётность" },
  "news.manage": { label: "Новости и объявления", group: "Контент" },
  "events.join": { label: "Отметка участия в мероприятиях", group: "Контент" },
  "events.manage": { label: "Управление мероприятиями", group: "Контент" },
  "appeals.handle": { label: "Работа с обращениями", group: "Контент" },
  "audit.view": { label: "Просмотр журнала аудита", group: "Аудит" },
  "users.manage": { label: "Управление учётными записями", group: "Администрирование", critical: true },
  "roles.manage": { label: "Матрица ролей и разрешений", group: "Администрирование", critical: true },
  "admins.manage": { label: "Назначение и снятие администраторов", group: "Администрирование", critical: true },
  "settings.manage": { label: "Настройки портала", group: "Администрирование", critical: true },
  "design.manage": { label: "Дизайн и глобальная тема", group: "Администрирование", critical: true },
  "security.manage": { label: "Безопасность: сессии и журнал входов", group: "Администрирование", critical: true },
} as const satisfies Record<string, { label: string; group: string; critical?: boolean }>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];
export const isPermission = (p: string): p is Permission => p in PERMISSIONS;
export const isCritical = (p: Permission) => "critical" in PERMISSIONS[p] && PERMISSIONS[p].critical === true;
export const OWNER_ONLY_GRANT: Permission[] = ["admins.manage"];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Владелец (Owner)", ADMIN: "Администратор", CHIEF: "Начальник УМВД", DEPUTY: "Заместитель начальника",
  DIV_HEAD: "Руководитель подразделения", HR: "Кадровый сотрудник", EMPLOYEE: "Сотрудник", CANDIDATE: "Кандидат", USER: "Пользователь", OBSERVER: "Наблюдатель",
};
export const ASSIGNABLE_ROLES: Role[] = ["CHIEF", "DEPUTY", "DIV_HEAD", "HR", "EMPLOYEE", "CANDIDATE", "USER", "OBSERVER"];

const STAFF_BASE: Permission[] = ["portal.view", "employees.view", "documents.create", "reports.create", "events.join"];
export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<Role, "OWNER">, Permission[]> = {
  ADMIN: ["admin.access", "portal.view", "employees.view"],
  CHIEF: [...STAFF_BASE, "admin.access", "employees.manage", "hr.view", "hr.manage", "applications.review", "divisions.manage", "orders.create", "orders.publish", "documents.review", "templates.manage", "reports.review", "news.manage", "events.manage", "appeals.handle", "audit.view"],
  DEPUTY: [...STAFF_BASE, "admin.access", "employees.manage", "hr.view", "applications.review", "orders.create", "orders.publish", "documents.review", "reports.review", "news.manage", "events.manage", "appeals.handle", "audit.view"],
  DIV_HEAD: [...STAFF_BASE, "employees.manage", "hr.view", "orders.create", "documents.review", "reports.review", "events.manage"],
  HR: [...STAFF_BASE, "admin.access", "employees.manage", "hr.view", "hr.manage", "applications.review"],
  EMPLOYEE: [...STAFF_BASE],
  CANDIDATE: [],
  USER: [],
  OBSERVER: ["portal.view", "employees.view"],
};
