import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ClipboardList, FilePlus2, FileText, History, Megaphone, Pin, ScrollText, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, DemoBadge, DictBadge, EmptyState, ErrorState, Loading, Panel } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { get } from "../../lib/api";
import { fmtDate, fmtDateTime, fmtRelative, fmtTime } from "../../lib/format";
import { DIVISION_STATUS, EVENT_TYPE, NEWS_CATEGORY, ORDER_CATEGORY } from "../../lib/labels";

type Dash = {
  news: { id: string; title: string; body: string; category: string; pinned: boolean; createdAt: string; isDemo: boolean; author: { nickname: string } | null }[];
  orders: { id: string; number: string; title: string; category: string; publishedAt: string; isDemo: boolean }[];
  events: { id: string; title: string; type: string; startsAt: string; location: string; _count: { participants: number } }[];
  divisions: { id: string; shortName: string; name: string; status: string; _count: { employees: number } }[];
  activity: { id: string; actorName: string; summary: string; createdAt: string }[];
  activityScope: "all" | "mine";
  my: { drafts: number; pendingReports: number };
  pendingReview: number | null;
};

const QUICK = [
  { type: "raport", label: "Рапорт" },
  { type: "memo", label: "Служебная записка" },
  { type: "report_note", label: "Докладная записка" },
  { type: "statement", label: "Заявление" },
];

export function DashboardPage() {
  const { user, can } = useAuth();
  const { settings } = useSettings();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["dashboard"], queryFn: () => get<Dash>("/dashboard") });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const maxEmp = Math.max(1, ...data.divisions.map((d) => d._count.employees));

  return (
    <div className="space-y-6">
      {/* Приветствие */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-page">Добро пожаловать в служебный портал УМВД</h1>
          <p className="mt-1.5 max-w-2xl text-muted">
            {user?.nickname}, здесь собрана информация о деятельности подразделений, актуальных распоряжениях и организационных мероприятиях.
          </p>
        </div>
        {can("documents.create") && (
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <Link key={q.type} to={`/portal/documents/new/${q.type}`} className="btn-secondary btn-sm"><FilePlus2 className="h-4 w-4" /> {q.label}</Link>
            ))}
          </div>
        )}
      </section>

      {/* Служебная информация */}
      <Panel title="Служебная информация">
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted">Ваша должность</p>
            <p className="mt-0.5 font-medium">{user?.roleLabel}</p>
          </div>
          <div>
            <p className="text-muted">Мои документы в работе</p>
            <p className="mt-0.5 font-medium">{data.my.drafts ? <Link className="link" to="/portal/documents">{data.my.drafts} — черновики и возвращённые</Link> : "Нет"}</p>
          </div>
          <div>
            <p className="text-muted">Мои отчёты на проверке</p>
            <p className="mt-0.5 font-medium">{data.my.pendingReports || "Нет"}</p>
          </div>
          <div>
            <p className="text-muted">{data.pendingReview !== null ? "Отчётов ждут вашей проверки" : "Ближайшее мероприятие"}</p>
            <p className="mt-0.5 font-medium">
              {data.pendingReview !== null
                ? <Link className="link" to="/portal/reports">{data.pendingReview}</Link>
                : data.events[0] ? `${fmtDateTime(data.events[0].startsAt)} — ${data.events[0].title}` : "Не запланировано"}
            </p>
          </div>
        </div>
        {settings.address && (
          <div className="mt-4 border-l-[3px] border-gold pl-3 text-sm">
            <p className="font-medium">{settings.address.title || "Обращение администрации"}</p>
            <p className="line-clamp-2 text-muted">{settings.address.body}</p>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        {/* Новости */}
        <Panel title="Новости и объявления руководства" actions={<Link to="/portal/news" className="btn-ghost btn-sm">Все новости</Link>} pad={false}>
          {data.news.length === 0 ? <EmptyState icon={<Megaphone />} title="Публикаций пока нет" /> : (
            <ul>
              {data.news.map((n) => (
                <li key={n.id} className="border-b border-line/60 px-5 py-4 last:border-0">
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                    <DictBadge dict={NEWS_CATEGORY} value={n.category} />
                    {n.pinned && <Badge tone="gold"><Pin className="h-3 w-3" /> Закреплено</Badge>}
                    {n.isDemo && <DemoBadge />}
                    <span>{fmtRelative(n.createdAt)}{n.author && ` · ${n.author.nickname}`}</span>
                  </div>
                  <p className="mt-1.5 font-medium">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Мероприятия */}
        <Panel title="Предстоящие мероприятия" actions={<Link to="/portal/events" className="btn-ghost btn-sm">Календарь</Link>} pad={false}>
          {data.events.length === 0 ? <EmptyState icon={<CalendarDays />} title="Ничего не запланировано" /> : (
            <ul>
              {data.events.map((e) => (
                <li key={e.id} className="flex gap-4 border-b border-line/60 px-5 py-3.5 last:border-0">
                  <div className="w-14 shrink-0 text-center">
                    <p className="font-serif text-2xl font-bold leading-none text-primary">{new Date(e.startsAt).getDate()}</p>
                    <p className="text-[12px] text-muted">{new Date(e.startsAt).toLocaleDateString("ru-RU", { month: "short" })}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{e.title}</p>
                    <p className="text-[13px] text-muted">{fmtTime(e.startsAt)} · {e.location}</p>
                    <div className="mt-1 flex items-center gap-2"><DictBadge dict={EVENT_TYPE} value={e.type} /><span className="text-[12.5px] text-muted">участников: {e._count.participants}</span></div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Приказы */}
        <Panel title="Актуальные приказы" actions={<Link to="/portal/orders" className="btn-ghost btn-sm">Реестр</Link>} pad={false} className="xl:col-span-1">
          {data.orders.length === 0 ? <EmptyState icon={<ScrollText />} title="Опубликованных приказов нет" /> : (
            <ul>
              {data.orders.map((o) => (
                <li key={o.id}>
                  <Link to={`/portal/orders/${o.id}`} className="block border-b border-line/60 px-5 py-3 hover:bg-primary/5">
                    <p className="text-[12.5px] text-muted">№ {o.number} от {fmtDate(o.publishedAt)}</p>
                    <p className="text-sm font-medium">{o.title}</p>
                    <div className="mt-1 flex gap-1.5"><DictBadge dict={ORDER_CATEGORY} value={o.category} />{o.isDemo && <DemoBadge />}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Статистика подразделений */}
        <Panel title="Подразделения" actions={<Users className="h-4 w-4 text-muted" />}>
          <ul className="space-y-3">
            {data.divisions.map((d) => (
              <li key={d.id}>
                <Link to={`/portal/divisions/${d.id}`} className="group block">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium group-hover:text-primary">{d.shortName}<span className="ml-2 text-muted">{d.name}</span></span>
                    <span className="tabular-nums text-muted">{d._count.employees}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface2">
                    <div className={`h-full rounded-full ${d.status === "ACTIVE" ? "bg-primary" : "bg-warn"}`} style={{ width: `${(d._count.employees / maxEmp) * 100}%` }} />
                  </div>
                  {d.status !== "ACTIVE" && <p className="mt-0.5 text-[12px] text-warn">{DIVISION_STATUS[d.status]?.label}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Журнал */}
        <Panel title={data.activityScope === "all" ? "Последние действия" : "Мои последние действия"} actions={can("audit.view") && <Link to="/portal/audit" className="btn-ghost btn-sm"><History className="h-4 w-4" /></Link>} pad={false}>
          {data.activity.length === 0 ? <EmptyState icon={<FileText />} title="Записей пока нет" /> : (
            <ul>
              {data.activity.map((a) => (
                <li key={a.id} className="border-b border-line/60 px-5 py-2.5 text-sm last:border-0">
                  <p>{a.summary}</p>
                  <p className="text-[12px] text-muted">{a.actorName} · {fmtRelative(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {can("reports.create") && (
        <div className="flex flex-wrap gap-2">
          <Link to="/portal/reports?new=1" className="btn-secondary"><ClipboardList className="h-4 w-4" /> Подать отчёт о деятельности</Link>
        </div>
      )}
    </div>
  );
}
