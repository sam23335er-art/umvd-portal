const tz = undefined; // часовой пояс браузера

export const fmtDate = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz }) : "—";

export const fmtDateTime = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz }) : "—";

export const fmtTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—");

export const fmtLong = (d: string | Date) => new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export function fmtRelative(d: string | Date) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} дн назад`;
  return fmtDate(d);
}

/** Значение для <input type="datetime-local"> в локальном времени. */
export const toLocalInput = (d?: string | Date | null) => {
  if (!d) return "";
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
export const toDateInput = (d?: string | Date | null) => (d ? toLocalInput(d).slice(0, 10) : "");

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
