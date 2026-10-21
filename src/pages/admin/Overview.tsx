import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, FileText, Info, MessagesSquare, ScrollText, ShieldAlert, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, Loading, PageHeader, Panel, Stat } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { get } from "../../lib/api";
import { fmtDateTime, fmtRelative } from "../../lib/format";

type Overview = {
  stats: { users: number; ordersPublished: number; reportsPending: number; newDocuments: number; applicationsPending: number; appealsOpen: number; employeesByDivision: { division: string; count: number }[] };
  recentAdmin: { id: string; actorName: string; summary: string; createdAt: string }[];
  recentLogins: { id: string; login: string; ip: string | null; createdAt: string; adminArea: boolean }[];
  alerts: { level: "info" | "warning" | "critical"; text: string; link?: string }[];
};

export function AdminOverview() {
  const { user, can } = useAuth();
  const { globalTheme } = useSettings();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["admin-overview"], queryFn: () => get<Overview>("/admin/overview"), refetchInterval: 60_000 });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const s = data.stats;
  const max = Math.max(1, ...s.employeesByDivision.map((d) => d.count));
  return (
    <>
      <PageHeader
        title="Обзор"
        description={<>Вы вошли как <b className="text-ink">{user?.nickname}</b> ({user?.roleLabel}). Активная тема сайта: {globalTheme.emoji} {globalTheme.name}. Все показатели считаются по реальным данным портала.</>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Пользователей" value={s.users} icon={<Users />} />
        <Stat label="Приказов опубликовано" value={s.ordersPublished} icon={<ScrollText />} />
        <Stat label="Отчётов ждут проверки" value={s.reportsPending} icon={<ClipboardList />} tone={s.reportsPending ? "warn" : "primary"} />
        <Stat label="Новых документов" value={s.newDocuments} hint="подано за 7 дней" icon={<FileText />} />
        <Stat label="Заявок кандидатов" value={s.applicationsPending} icon={<UserPlus />} tone="gold" />
        <Stat label="Открытых обращений" value={s.appealsOpen} icon={<MessagesSquare />} tone={s.appealsOpen ? "warn" : "primary"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel title="Системные уведомления" pad={false}>
          {data.alerts.length === 0 ? <EmptyState title="Всё спокойно" text="Нет задач, требующих внимания." /> : (
            <ul>
              {data.alerts.map((a, i) => {
                const Icon = a.level === "info" ? Info : a.level === "warning" ? AlertTriangle : ShieldAlert;
                const tone = a.level === "info" ? "text-info" : a.level === "warning" ? "text-warn" : "text-bad";
                const body = <span className="flex items-start gap-2.5"><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} /><span className="text-sm">{a.text}</span></span>;
                return <li key={i} className="border-b border-line/60 last:border-0">{a.link ? <Link to={a.link} className="block px-5 py-3 hover:bg-primary/5">{body}</Link> : <div className="px-5 py-3">{body}</div>}</li>;
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Сотрудники по подразделениям">
          {s.employeesByDivision.length === 0 ? <p className="text-sm text-muted">Сотрудников пока нет.</p> : (
            <ul className="space-y-2.5">
              {s.employeesByDivision.sort((a, b) => b.count - a.count).map((d) => (
                <li key={d.division}>
                  <div className="flex justify-between text-sm"><span>{d.division}</span><span className="tabular-nums text-muted">{d.count}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface2"><div className="h-full rounded-full bg-primary" style={{ width: `${(d.count / max) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Последние входы" actions={can("security.manage") && <Link to="/admin/security" className="btn-ghost btn-sm">Журнал</Link>} pad={false}>
          {!can("security.manage") ? <p className="p-5 text-sm text-muted">Доступно при наличии права «Безопасность».</p> : data.recentLogins.length === 0 ? <EmptyState title="Входов нет" /> : (
            <ul>
              {data.recentLogins.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 border-b border-line/60 px-5 py-2.5 text-sm last:border-0">
                  <span>{l.login}{l.adminArea && <span className="ml-1.5 text-[12px] text-gold">админ-панель</span>}</span>
                  <span className="text-[12.5px] text-muted">{fmtRelative(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Последние административные действия" className="mt-6" actions={can("audit.view") && <Link to="/admin/audit" className="btn-ghost btn-sm">Весь журнал</Link>} pad={false}>
        {data.recentAdmin.length === 0 ? <EmptyState title="Критических действий не было" /> : (
          <ul>
            {data.recentAdmin.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 px-5 py-2.5 text-sm last:border-0">
                <span><b className="font-medium">{a.actorName}</b> — {a.summary}</span>
                <span className="text-[12.5px] text-muted">{fmtDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
