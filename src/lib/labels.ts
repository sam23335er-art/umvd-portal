// Русские подписи для значений перечислений сервера.
export type Tone = "neutral" | "primary" | "ok" | "warn" | "bad" | "info" | "gold";

type Dict = Record<string, { label: string; tone: Tone }>;

export const ROLE: Dict = {
  OWNER: { label: "Владелец", tone: "gold" },
  ADMIN: { label: "Администратор", tone: "primary" },
  CHIEF: { label: "Начальник УМВД", tone: "info" },
  DEPUTY: { label: "Заместитель начальника", tone: "info" },
  DIV_HEAD: { label: "Руководитель подразделения", tone: "info" },
  HR: { label: "Кадровый сотрудник", tone: "info" },
  EMPLOYEE: { label: "Сотрудник", tone: "ok" },
  CANDIDATE: { label: "Кандидат", tone: "warn" },
  USER: { label: "Пользователь", tone: "neutral" },
  OBSERVER: { label: "Наблюдатель", tone: "neutral" },
};

export const EMPLOYEE_STATUS: Dict = {
  ACTIVE: { label: "На службе", tone: "ok" },
  VACATION: { label: "В отпуске", tone: "info" },
  SUSPENDED: { label: "Отстранён", tone: "warn" },
  DISMISSED: { label: "Исключён", tone: "bad" },
};

export const DIVISION_STATUS: Dict = {
  ACTIVE: { label: "Работает", tone: "ok" },
  LIMITED: { label: "Ограниченный состав", tone: "warn" },
  INACTIVE: { label: "Не активно", tone: "neutral" },
};

export const ORDER_CATEGORY: Dict = {
  PERSONNEL: { label: "Кадровый", tone: "info" },
  ORGANIZATIONAL: { label: "Организационный", tone: "primary" },
  TRAINING: { label: "Учебный", tone: "ok" },
  DISCIPLINARY: { label: "Дисциплинарный", tone: "bad" },
  GENERAL: { label: "Общее распоряжение", tone: "neutral" },
};

export const PUBLISH_STATUS: Dict = {
  DRAFT: { label: "Черновик", tone: "warn" },
  PUBLISHED: { label: "Опубликован", tone: "ok" },
  ARCHIVED: { label: "В архиве", tone: "neutral" },
};

export const DOCUMENT_STATUS: Dict = {
  DRAFT: { label: "Черновик", tone: "neutral" },
  SUBMITTED: { label: "На проверке", tone: "warn" },
  ACCEPTED: { label: "Принят", tone: "ok" },
  RETURNED: { label: "Возвращён", tone: "bad" },
  ARCHIVED: { label: "В архиве", tone: "neutral" },
};

export const NEWS_CATEGORY: Dict = {
  NEWS: { label: "Новость", tone: "primary" },
  ANNOUNCEMENT: { label: "Объявление", tone: "info" },
  IMPORTANT: { label: "Важно", tone: "bad" },
  INTERNAL: { label: "Внутреннее", tone: "neutral" },
};

export const EVENT_TYPE: Dict = {
  FORMATION: { label: "Построение", tone: "primary" },
  BRIEFING: { label: "Инструктаж", tone: "info" },
  INSPECTION: { label: "Проверка", tone: "warn" },
  TRAINING: { label: "Учебное мероприятие", tone: "ok" },
  MEETING: { label: "Совещание", tone: "neutral" },
  OPERATION: { label: "RP-операция", tone: "bad" },
};

export const EVENT_STATUS: Dict = {
  PLANNED: { label: "Запланировано", tone: "primary" },
  DONE: { label: "Проведено", tone: "ok" },
  CANCELLED: { label: "Отменено", tone: "bad" },
  ARCHIVED: { label: "В архиве", tone: "neutral" },
};

export const REPORT_STATUS: Dict = {
  PENDING: { label: "На проверке", tone: "warn" },
  APPROVED: { label: "Утверждён", tone: "ok" },
  REVISION: { label: "На доработке", tone: "info" },
  REJECTED: { label: "Отклонён", tone: "bad" },
};

export const APPLICATION_STATUS: Dict = {
  PENDING: { label: "На рассмотрении", tone: "warn" },
  INTERVIEW: { label: "Собеседование", tone: "info" },
  APPROVED: { label: "Одобрена", tone: "ok" },
  REJECTED: { label: "Отклонена", tone: "bad" },
  WITHDRAWN: { label: "Отозвана", tone: "neutral" },
};

export const APPEAL_CATEGORY: Dict = {
  QUESTION: { label: "Вопрос", tone: "primary" },
  COMPLAINT: { label: "Жалоба", tone: "bad" },
  SUGGESTION: { label: "Предложение", tone: "ok" },
  PUNISHMENT_APPEAL: { label: "Обжалование взыскания", tone: "warn" },
  TECHNICAL: { label: "Технический вопрос", tone: "info" },
};

export const APPEAL_STATUS: Dict = {
  OPEN: { label: "Ожидает ответа", tone: "warn" },
  IN_PROGRESS: { label: "В работе", tone: "info" },
  ANSWERED: { label: "Есть ответ", tone: "ok" },
  CLOSED: { label: "Закрыто", tone: "neutral" },
};

export const HR_TYPE: Dict = {
  APPOINTMENT: { label: "Назначение", tone: "ok" },
  TRANSFER: { label: "Перевод", tone: "info" },
  PROMOTION: { label: "Повышение", tone: "gold" },
  RANK_CHANGE: { label: "Изменение звания", tone: "gold" },
  POSITION_CHANGE: { label: "Смена должности", tone: "primary" },
  DISMISSAL: { label: "Исключение", tone: "bad" },
  REINSTATEMENT: { label: "Восстановление", tone: "ok" },
  NOTE: { label: "Кадровая заметка", tone: "neutral" },
};

export const options = (d: Dict) => Object.entries(d).map(([value, { label }]) => ({ value, label }));

/** Игровые звания для выпадающих списков (можно вводить и своё). */
export const RANKS = [
  "Рядовой полиции", "Младший сержант полиции", "Сержант полиции", "Старший сержант полиции", "Старшина полиции",
  "Прапорщик полиции", "Младший лейтенант полиции", "Лейтенант полиции", "Старший лейтенант полиции", "Капитан полиции",
  "Майор полиции", "Подполковник полиции", "Полковник полиции", "Лейтенант юстиции", "Старший лейтенант юстиции",
  "Капитан юстиции", "Майор юстиции", "Подполковник юстиции", "Полковник юстиции",
];
