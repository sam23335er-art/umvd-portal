// Шаблоны документов и структура подразделений по умолчанию.
/* eslint-disable */

export const TEMPLATES = [
  {
    type: "raport", name: "Рапорт", description: "Официальное обращение к руководству по служебному вопросу.",
    fields: [
      { key: "to", label: "Кому", type: "text", required: true, max: 160, placeholder: "Начальнику УМВД полковнику полиции …" },
      { key: "subject", label: "Тема", type: "text", required: true, max: 200 },
      { key: "body", label: "Текст рапорта", type: "textarea", required: true, max: 6000 },
      { key: "date", label: "Дата", type: "date", required: true },
    ],
  },
  {
    type: "memo", name: "Служебная записка", description: "Внутренняя переписка между подразделениями.",
    fields: [
      { key: "to", label: "Адресат", type: "text", required: true, max: 160 },
      { key: "subject", label: "Тема", type: "text", required: true, max: 200 },
      { key: "body", label: "Содержание", type: "textarea", required: true, max: 6000 },
      { key: "date", label: "Дата", type: "date", required: true },
    ],
  },
  {
    type: "report_note", name: "Докладная записка", description: "Доклад руководству о фактах, событиях и предложениях.",
    fields: [
      { key: "to", label: "Кому", type: "text", required: true, max: 160 },
      { key: "subject", label: "О чём", type: "text", required: true, max: 200 },
      { key: "facts", label: "Изложение фактов", type: "textarea", required: true, max: 6000 },
      { key: "proposals", label: "Предложения", type: "textarea", required: false, max: 3000 },
      { key: "date", label: "Дата", type: "date", required: true },
    ],
  },
  {
    type: "explanation", name: "Объяснение", description: "Объяснение сотрудника по обстоятельствам игрового инцидента.",
    fields: [
      { key: "to", label: "Кому", type: "text", required: true, max: 160 },
      { key: "incidentDate", label: "Дата события", type: "date", required: true },
      { key: "circumstances", label: "Обстоятельства", type: "textarea", required: true, max: 6000 },
      { key: "reasons", label: "Причины и пояснения", type: "textarea", required: true, max: 3000 },
      { key: "date", label: "Дата составления", type: "date", required: true },
    ],
  },
  {
    type: "reference", name: "Характеристика сотрудника", description: "Служебная характеристика игрового персонажа.",
    fields: [
      { key: "employeeName", label: "Сотрудник (игровой ник)", type: "text", required: true, max: 60 },
      { key: "rank", label: "Звание", type: "text", required: true, max: 60 },
      { key: "position", label: "Должность", type: "text", required: true, max: 120 },
      { key: "serviceStart", label: "Дата вступления", type: "date", required: true },
      { key: "qualities", label: "Деловые и личные качества", type: "textarea", required: true, max: 5000 },
      { key: "conclusion", label: "Вывод", type: "select", required: true, options: ["Положительная", "Удовлетворительная", "Отрицательная"] },
      { key: "date", label: "Дата", type: "date", required: true },
    ],
  },
  {
    type: "statement", name: "Заявление", description: "Заявление на отпуск, перевод, увольнение и т. п.",
    fields: [
      { key: "to", label: "Кому", type: "text", required: true, max: 160 },
      { key: "requestType", label: "Вид заявления", type: "select", required: true, options: ["Отпуск", "Перевод", "Увольнение по собственному желанию", "Повышение квалификации", "Иное"] },
      { key: "body", label: "Текст заявления", type: "textarea", required: true, max: 4000 },
      { key: "date", label: "Дата", type: "date", required: true },
    ],
  },
  {
    type: "event_report", name: "Отчёт о мероприятии", description: "Итоги проведённого построения, учений или RP-операции.",
    fields: [
      { key: "eventName", label: "Мероприятие", type: "text", required: true, max: 160 },
      { key: "eventDate", label: "Дата проведения", type: "date", required: true },
      { key: "location", label: "Место (в игровом мире)", type: "text", required: true, max: 160 },
      { key: "participants", label: "Количество участников", type: "number", required: true },
      { key: "course", label: "Ход мероприятия", type: "textarea", required: true, max: 6000 },
      { key: "results", label: "Итоги", type: "textarea", required: true, max: 4000 },
    ],
  },
];

export const DIVISIONS = [
  { code: "UMVD", shortName: "УМВД", name: "Руководство УМВД", sortOrder: 1, description: "Руководство и координация деятельности всех игровых подразделений, планирование операций, контроль исполнения приказов.", tasks: "Утверждение плана на неделю\nПроверка готовности подразделений\nКоординация совместных RP-операций" },
  { code: "DPS", shortName: "ДПС", name: "Дорожно-патрульная служба", sortOrder: 2, description: "Обеспечение безопасности дорожного движения в игровом мире, патрулирование трасс и городских магистралей.", tasks: "Патрулирование Кузнецкого проспекта\nПрофилактические рейды «Нетрезвый водитель»\nСопровождение колонн" },
  { code: "PPS", shortName: "ППС", name: "Патрульно-постовая служба", sortOrder: 3, description: "Охрана общественного порядка на улицах игрового Кемерово, реагирование на вызовы граждан.", tasks: "Пешие патрули в центре\nДежурство на массовых мероприятиях\nОтработка вызовов" },
  { code: "OPER", shortName: "ОУР", name: "Оперативные подразделения", sortOrder: 4, description: "Оперативно-розыскная деятельность в рамках игровых сценариев, работа с информаторами, раскрытие преступлений.", tasks: "Разработка RP-сценария «Схема»\nВзаимодействие со следствием" },
  { code: "SLED", shortName: "СО", name: "Следственные подразделения", sortOrder: 5, description: "Расследование игровых уголовных дел, допросы, оформление процессуальных документов.", tasks: "Оформление материалов по операции «Сквозняк»\nОбучение стажёров документообороту", status: "LIMITED" as const },
  { code: "DCH", shortName: "ДЧ", name: "Дежурная часть", sortOrder: 6, description: "Круглосуточный приём вызовов, распределение нарядов, ведение журнала происшествий.", tasks: "Ведение журнала смен\nКоординация нарядов в эфире" },
];

