import { useQuery } from "@tanstack/react-query";
import { Eye, Pencil, Plus, UserMinus, Users } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Badge, DemoBadge, DictBadge, EmptyState, ErrorState, FilterSelect, Loading, Modal, PageHeader, Panel, SearchBox, SelectInput, SortHeader, TableWrap, TextArea, TextInput,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { get, patch, post, qs } from "../../lib/api";
import { fmtDate, fmtDateTime, toDateInput } from "../../lib/format";
import { useAction, useDebounced } from "../../lib/hooks";
import { EMPLOYEE_STATUS, HR_TYPE, options, RANKS } from "../../lib/labels";

export type Employee = {
  id: string; nickname: string; rank: string; position: string; status: string; joinedAt: string; isDemo: boolean; divisionId: string | null; userId: string | null;
  division: { id: string; shortName: string; name: string } | null; user: { id: string; login: string } | null;
};
type DivisionOpt = { id: string; shortName: string; name: string };

export function useDivisionOptions() {
  return useQuery({ queryKey: ["divisions", false], queryFn: () => get<{ items: DivisionOpt[] }>("/divisions"), staleTime: 60_000 });
}

export function EmployeesPage({ admin = false }: { admin?: boolean }) {
  const { can, user } = useAuth();
  const manage = can("employees.manage");
  const [q, setQ] = useState("");
  const [division, setDivision] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("division");
  const dq = useDebounced(q);
  const divs = useDivisionOptions();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["employees", dq, division, status, sort],
    queryFn: () => get<{ items: Employee[] }>(`/employees${qs({ q: dq, division, status, sort })}`),
  });
  const [edit, setEdit] = useState<Employee | "new" | null>(null);
  const [dismiss, setDismiss] = useState<Employee | null>(null);
  const toggleSort = (f: string) => setSort((s) => (s === f ? (f === "joined" ? "joined_asc" : f) : f));
  const scoped = user?.role === "DIV_HEAD";

  return (
    <>
      <PageHeader
        title={admin ? "Управление сотрудниками" : "Состав сотрудников"}
        description={scoped && manage ? "Вы можете изменять карточки сотрудников своего подразделения." : "Игровой личный состав УМВД. Демонстрационные записи помечены и легко заменяются."}
        actions={manage && <button className="btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Добавить сотрудника</button>}
      />
      <Panel pad={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-4">
          <SearchBox className="min-w-[220px] flex-1" value={q} onChange={setQ} placeholder="Поиск по нику, званию, должности" />
          <FilterSelect label="Подразделение" value={division} onChange={setDivision} all="Все подразделения" options={(divs.data?.items ?? []).map((d) => ({ value: d.id, label: d.shortName }))} />
          <FilterSelect label="Статус" value={status} onChange={setStatus} all="Действующие" options={[...options(EMPLOYEE_STATUS), { value: "all", label: "Все, включая исключённых" }]} />
        </div>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorState error={error} onRetry={refetch} /></div> : data!.items.length === 0 ? (
          <EmptyState icon={<Users />} title="Никого не найдено" text="Измените условия поиска или фильтры." />
        ) : (
          <div className="p-4 pt-0 sm:p-5 sm:pt-0">
            <TableWrap>
              <table className="table-base">
                <thead>
                  <tr>
                    <th><SortHeader label="Игровой ник" field="nickname" sort={sort} onSort={toggleSort} /></th>
                    <th><SortHeader label="Звание" field="rank" sort={sort} onSort={toggleSort} /></th>
                    <th className="hidden md:table-cell">Должность</th>
                    <th><SortHeader label="Подразделение" field="division" sort={sort} onSort={toggleSort} /></th>
                    <th>Статус</th>
                    <th className="hidden lg:table-cell"><SortHeader label="Дата вступления" field="joined" sort={sort} onSort={toggleSort} /></th>
                    <th className="text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.items.map((e) => (
                    <tr key={e.id}>
                      <td className="font-medium">
                        <Link to={`/portal/employees/${e.id}`} className="hover:text-primary">{e.nickname}</Link> {e.isDemo && <DemoBadge />}
                      </td>
                      <td className="text-muted">{e.rank}</td>
                      <td className="hidden text-muted md:table-cell">{e.position}</td>
                      <td>{e.division?.shortName ?? "—"}</td>
                      <td><DictBadge dict={EMPLOYEE_STATUS} value={e.status} /></td>
                      <td className="hidden text-muted lg:table-cell">{fmtDate(e.joinedAt)}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Link to={`/portal/employees/${e.id}`} className="btn-ghost btn-sm" title="Карточка"><Eye className="h-4 w-4" /></Link>
                          {manage && (!scoped || e.divisionId === user?.divisionId) && (
                            <>
                              <button className="btn-ghost btn-sm" title="Изменить" onClick={() => setEdit(e)}><Pencil className="h-4 w-4" /></button>
                              {e.status !== "DISMISSED" && <button className="btn-ghost btn-sm text-bad" title="Исключить" onClick={() => setDismiss(e)}><UserMinus className="h-4 w-4" /></button>}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <p className="mt-3 text-[13px] text-muted">Показано: {data!.items.length}</p>
          </div>
        )}
      </Panel>
      {edit && <EmployeeForm employee={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {dismiss && <DismissDialog employee={dismiss} onClose={() => setDismiss(null)} />}
    </>
  );
}

type UserOpt = { id: string; login: string; nickname: string; role: string; employee: unknown };

export function EmployeeForm({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const { can, user } = useAuth();
  const divs = useDivisionOptions();
  const canLink = can("users.manage");
  const users = useQuery({ queryKey: ["access-users-free"], queryFn: () => get<{ items: UserOpt[] }>("/admin/access/users"), enabled: canLink });
  const scoped = user?.role === "DIV_HEAD";
  const [v, setV] = useState({
    nickname: employee?.nickname ?? "", rank: employee?.rank ?? RANKS[0], position: employee?.position ?? "",
    divisionId: employee?.divisionId ?? (scoped ? user?.divisionId ?? "" : ""), status: employee?.status ?? "ACTIVE",
    joinedAt: toDateInput(employee?.joinedAt ?? new Date()), userId: employee?.userId ?? "", comment: "", orderRef: "",
  });
  const save = useAction(
    () => {
      const body: Record<string, unknown> = { ...v, divisionId: v.divisionId || null, userId: v.userId || null, comment: v.comment || undefined, orderRef: v.orderRef || undefined };
      if (!canLink) delete body.userId;
      if (employee && body.userId === employee.userId) delete body.userId;
      return employee ? patch(`/employees/${employee.id}`, body) : post("/employees", body);
    },
    { success: employee ? "Карточка сотрудника сохранена" : "Сотрудник добавлен в состав", invalidate: [["employees"], ["employee"], ["divisions"], ["dashboard"], ["hr-records"]], onDone: onClose },
  );
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const fe = save.fieldErrors;
  const freeUsers = (users.data?.items ?? []).filter((u) => !u.employee || u.id === employee?.userId);

  return (
    <Modal open onClose={onClose} wide title={employee ? `Карточка: ${employee.nickname}` : "Новый сотрудник"} footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button><button className="btn-primary" disabled={save.pending} onClick={() => save.run()}>Сохранить</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Игровой ник" value={v.nickname} onChange={set("nickname")} error={fe.nickname} required />
        <div>
          <TextInput label="Звание" list="ranks" value={v.rank} onChange={set("rank")} error={fe.rank} required />
          <datalist id="ranks">{RANKS.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
        <TextInput label="Должность" value={v.position} onChange={set("position")} error={fe.position} required />
        <SelectInput label="Подразделение" value={v.divisionId} onChange={set("divisionId")} disabled={scoped} placeholder="Без подразделения" options={(divs.data?.items ?? []).map((d) => ({ value: d.id, label: d.name }))} />
        <SelectInput label="Статус" value={v.status} onChange={set("status")} options={options(EMPLOYEE_STATUS).filter((o) => o.value !== "DISMISSED" || employee)} />
        <TextInput label="Дата вступления" type="date" value={v.joinedAt} onChange={set("joinedAt")} error={fe.joinedAt} />
        {canLink && (
          <SelectInput className="sm:col-span-2" label="Учётная запись портала" value={v.userId} onChange={set("userId")} placeholder="Не привязана"
            options={freeUsers.map((u) => ({ value: u.id, label: `${u.nickname} (${u.login})` }))} />
        )}
        <TextInput label="Основание (№ приказа)" value={v.orderRef} onChange={set("orderRef")} hint="Попадёт в кадровую историю" />
        <TextInput label="Комментарий к изменению" value={v.comment} onChange={set("comment")} />
      </div>
      {employee && <p className="mt-4 text-[13px] text-muted">Изменения звания, должности, подразделения и статуса автоматически записываются в кадровую историю и журнал действий.</p>}
    </Modal>
  );
}

function DismissDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const [comment, setComment] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const run = useAction(() => post(`/employees/${employee.id}/dismiss`, { comment, orderRef: orderRef || undefined }), {
    success: `${employee.nickname} исключён(а) из состава`,
    invalidate: [["employees"], ["employee"], ["divisions"], ["hr-records"]],
    onDone: onClose,
  });
  return (
    <Modal open onClose={onClose} title="Исключение из состава" footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button><button className="btn-danger" disabled={run.pending} onClick={() => run.run()}>Исключить</button></>}>
      <p className="text-sm">
        <b>{employee.nickname}</b> ({employee.rank}, {employee.position}) будет переведён(а) в статус «Исключён». Карточка и кадровая история сохранятся, сотрудник перестанет числиться в подразделении.
      </p>
      <div className="mt-4 space-y-3">
        <TextArea label="Основание" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} error={run.fieldErrors.comment} required />
        <TextInput label="№ приказа" value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />
      </div>
    </Modal>
  );
}

type EmployeeFull = Employee & {
  user: { id: string; login: string; nickname: string; role: string } | null;
  headOf: { id: string; name: string } | null;
  hrRecords?: { id: string; type: string; fromValue: string | null; toValue: string | null; comment: string | null; orderRef: string | null; actorName: string; createdAt: string }[];
};

export function EmployeeDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["employee", id], queryFn: () => get<{ item: EmployeeFull }>(`/employees/${id}`) });
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState("");
  const addNote = useAction(() => post(`/employees/${id}/notes`, { comment: note }), { success: "Заметка добавлена", invalidate: [["employee", id!], ["hr-records"]], onDone: () => setNote("") });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const e = data.item;
  return (
    <>
      <PageHeader
        title={e.nickname}
        description={<span className="flex flex-wrap items-center gap-2">{e.rank} · {e.position} <DictBadge dict={EMPLOYEE_STATUS} value={e.status} /> {e.isDemo && <DemoBadge />}</span>}
        actions={<>{can("employees.manage") && <button className="btn-primary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Изменить</button>}<Link to="/portal/employees" className="btn-secondary">К составу</Link></>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Panel title="Карточка сотрудника">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
            <dt className="text-muted">Звание</dt><dd>{e.rank}</dd>
            <dt className="text-muted">Должность</dt><dd>{e.position}</dd>
            <dt className="text-muted">Подразделение</dt><dd>{e.division ? <Link className="link" to={`/portal/divisions/${e.division.id}`}>{e.division.name}</Link> : "—"}</dd>
            {e.headOf && (<><dt className="text-muted">Руководит</dt><dd><Badge tone="gold">{e.headOf.name}</Badge></dd></>)}
            <dt className="text-muted">В составе с</dt><dd>{fmtDate(e.joinedAt)}</dd>
            <dt className="text-muted">Учётная запись</dt><dd>{e.user ? `${e.user.nickname} (${e.user.login})` : "Не привязана"}</dd>
          </dl>
          <p className="mt-4 text-[12.5px] text-muted">Игровой персонаж проекта «Кемерово РП». Реальные персональные данные не хранятся.</p>
        </Panel>
        <Panel title="Кадровая история" pad={false}>
          {!e.hrRecords ? (
            <p className="p-5 text-sm text-muted">История доступна кадровой службе и руководству.</p>
          ) : e.hrRecords.length === 0 ? <EmptyState title="Записей нет" /> : (
            <ol className="relative ml-5 border-l border-line py-3">
              {e.hrRecords.map((r) => (
                <li key={r.id} className="relative py-2.5 pl-5 pr-5">
                  <span className="absolute -left-[5px] top-4 h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary" />
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                    <DictBadge dict={HR_TYPE} value={r.type} /> {fmtDateTime(r.createdAt)} · {r.actorName}{r.orderRef && ` · приказ № ${r.orderRef}`}
                  </div>
                  {(r.fromValue || r.toValue) && <p className="mt-1 text-sm">{r.fromValue && <span className="text-muted line-through decoration-muted/50">{r.fromValue}</span>}{r.fromValue && r.toValue && " → "}{r.toValue}</p>}
                  {r.comment && <p className="mt-0.5 text-sm text-muted">{r.comment}</p>}
                </li>
              ))}
            </ol>
          )}
          {can("hr.manage") && (
            <form className="flex gap-2 border-t border-line p-4" onSubmit={(ev) => { ev.preventDefault(); addNote.run(); }}>
              <input className="input" placeholder="Кадровая заметка…" value={note} onChange={(ev) => setNote(ev.target.value)} />
              <button className="btn-secondary" disabled={addNote.pending || note.trim().length < 3}>Добавить</button>
            </form>
          )}
        </Panel>
      </div>
      {edit && <EmployeeForm employee={e} onClose={() => setEdit(false)} />}
    </>
  );
}
