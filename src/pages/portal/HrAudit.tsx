import { useQuery } from "@tanstack/react-query";
import { BookUser, History, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, DictBadge, EmptyState, ErrorState, FilterSelect, Loading, PageHeader, Panel, SearchBox, Stat, TableWrap, Checkbox } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { get, qs } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";
import { APPLICATION_STATUS, EMPLOYEE_STATUS, HR_TYPE, options } from "../../lib/labels";

type HrRecord = { id: string; type: string; fromValue: string | null; toValue: string | null; comment: string | null; orderRef: string | null; actorName: string; createdAt: string; employee: { id: string; nickname: string; division: { shortName: string } | null } };

export function HrPage() {
  const { can } = useAuth();
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const summary = useQuery({ queryKey: ["hr-summary"], queryFn: () => get<{ byStatus: { status: string; _count: number }[]; candidates: number }>("/hr/summary") });
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["hr-records", type, dq], queryFn: () => get<{ items: HrRecord[] }>(`/hr/records${qs({ type, q: dq })}`) });
  const count = (s: string) => summary.data?.byStatus.find((x) => x.status === s)?._count ?? 0;
  return (
    <>
      <PageHeader
        title="Кадровый раздел"
        description="История назначений, переводов, изменения званий и кадровых решений. Изменения вносят только уполномоченные сотрудники."
        actions={<>{can("employees.view") && <Link to="/portal/employees" className="btn-secondary">Список личного состава</Link>}{can("applications.review") && <Link to="/admin/applications" className="btn-primary">Кандидаты{summary.data ? ` · ${summary.data.candidates}` : ""}</Link>}</>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={EMPLOYEE_STATUS.ACTIVE.label} value={count("ACTIVE")} tone="ok" />
        <Stat label={EMPLOYEE_STATUS.VACATION.label} value={count("VACATION")} />
        <Stat label={EMPLOYEE_STATUS.SUSPENDED.label} value={count("SUSPENDED")} tone="warn" />
        <Stat label="Кандидатов на рассмотрении" value={summary.data?.candidates ?? 0} tone="gold" hint={APPLICATION_STATUS.PENDING.label} />
      </div>
      <Panel pad={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-4">
          <SearchBox className="min-w-[200px] flex-1" value={q} onChange={setQ} placeholder="Поиск по сотруднику" />
          <FilterSelect label="Тип решения" value={type} onChange={setType} all="Все кадровые решения" options={options(HR_TYPE)} />
        </div>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorState error={error} onRetry={refetch} /></div> : data!.items.length === 0 ? (
          <EmptyState icon={<BookUser />} title="Записей нет" />
        ) : (
          <div className="p-4 pt-0 sm:p-5 sm:pt-0">
            <TableWrap>
              <table className="table-base">
                <thead><tr><th>Дата</th><th>Сотрудник</th><th>Решение</th><th>Изменение</th><th className="hidden lg:table-cell">Основание</th><th className="hidden md:table-cell">Кто внёс</th></tr></thead>
                <tbody>
                  {data!.items.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap text-muted">{fmtDateTime(r.createdAt)}</td>
                      <td><Link className="link" to={`/portal/employees/${r.employee.id}`}>{r.employee.nickname}</Link>{r.employee.division && <span className="text-muted"> · {r.employee.division.shortName}</span>}</td>
                      <td><DictBadge dict={HR_TYPE} value={r.type} /></td>
                      <td className="text-sm">{r.fromValue && <span className="text-muted">{r.fromValue} → </span>}{r.toValue}{!r.fromValue && !r.toValue && <span className="text-muted">{r.comment}</span>}</td>
                      <td className="hidden text-muted lg:table-cell">{r.orderRef ? `Приказ № ${r.orderRef}` : r.fromValue || r.toValue ? r.comment ?? "—" : "—"}</td>
                      <td className="hidden text-muted md:table-cell">{r.actorName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}
      </Panel>
    </>
  );
}

type AuditItem = { id: string; actorName: string; action: string; entity: string; entityId: string | null; summary: string; critical: boolean; createdAt: string };
const ENTITIES = [
  { value: "User", label: "Пользователи и роли" }, { value: "Employee", label: "Сотрудники" }, { value: "Order", label: "Приказы" }, { value: "Document", label: "Документы" },
  { value: "News", label: "Новости" }, { value: "Event", label: "Мероприятия" }, { value: "Report", label: "Отчёты" }, { value: "Division", label: "Подразделения" },
  { value: "RolePermission", label: "Матрица ролей" }, { value: "PortalSettings", label: "Настройки и дизайн" }, { value: "Session", label: "Сессии" }, { value: "Application", label: "Заявки" }, { value: "Appeal", label: "Обращения" },
];

export function AuditPage() {
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const [critical, setCritical] = useState(false);
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["audit", dq, entity, critical, page], queryFn: () => get<{ items: AuditItem[]; total: number; page: number; pages: number }>(`/audit${qs({ q: dq, entity, critical: critical ? "1" : "", page })}`) });
  return (
    <>
      <PageHeader title="Журнал действий" description="Все значимые операции портала. Записи журнала нельзя изменить или удалить — таких функций в портале нет." />
      <Panel pad={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchBox className="min-w-[200px] flex-1" value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Действие, автор или описание" />
          <FilterSelect label="Раздел" value={entity} onChange={(v) => { setEntity(v); setPage(1); }} all="Все разделы" options={ENTITIES} />
          <Checkbox label="Только критические" checked={critical} onChange={(v) => { setCritical(v); setPage(1); }} />
        </div>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorState error={error} onRetry={refetch} /></div> : data!.items.length === 0 ? (
          <EmptyState icon={<History />} title="Записей не найдено" />
        ) : (
          <>
            <div className="p-4 pt-0 sm:p-5 sm:pt-0">
              <TableWrap>
                <table className="table-base">
                  <thead><tr><th>Дата и время</th><th>Автор</th><th>Действие</th><th className="hidden md:table-cell">Код</th></tr></thead>
                  <tbody>
                    {data!.items.map((a) => (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap text-muted">{fmtDateTime(a.createdAt)}</td>
                        <td className="whitespace-nowrap">{a.actorName}</td>
                        <td>{a.critical && <ShieldAlert className="mr-1.5 inline h-4 w-4 text-warn" aria-label="Критическое" />}{a.summary}</td>
                        <td className="hidden md:table-cell"><Badge>{a.action}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
            <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm text-muted">
              <span>Всего записей: {data!.total}</span>
              <div className="flex items-center gap-2">
                <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Назад</button>
                <span>{data!.page} из {data!.pages}</span>
                <button className="btn-secondary btn-sm" disabled={page >= data!.pages} onClick={() => setPage((p) => p + 1)}>Далее</button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
