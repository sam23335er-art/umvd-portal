import { useQuery } from "@tanstack/react-query";
import { Archive, Network, Pencil, Plus, RotateCcw, Users } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, DemoBadge, DictBadge, EmptyState, ErrorState, Loading, Modal, PageHeader, Panel, SelectInput, TextArea, TextInput, Checkbox, useConfirm } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { get, patch, post } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { useAction } from "../../lib/hooks";
import { DIVISION_STATUS, EMPLOYEE_STATUS, EVENT_TYPE, options } from "../../lib/labels";

type Emp = { id: string; nickname: string; rank: string; position: string; status: string; isDemo: boolean };
export type Division = {
  id: string; code: string; name: string; shortName: string; description: string; tasks: string; status: string; enabled: boolean; sortOrder: number;
  headId: string | null; head: Emp | null; _count: { employees: number; reports: number };
};

export function DivisionsPage({ admin = false }: { admin?: boolean }) {
  const { can } = useAuth();
  const manage = can("divisions.manage");
  const confirm = useConfirm();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["divisions", admin],
    queryFn: () => get<{ items: Division[] }>(`/divisions${admin && manage ? "?all=1" : ""}`),
  });
  const [edit, setEdit] = useState<Division | "new" | null>(null);
  const archive = useAction((d: Division) => post(`/divisions/${d.id}/${d.enabled ? "archive" : "restore"}`), { success: "Статус подразделения обновлён", invalidate: [["divisions"]] });

  return (
    <>
      <PageHeader
        title="Подразделения"
        description="Каталог игровых подразделений УМВД. Структура и полномочия определены правилами проекта «Кемерово РП»."
        actions={manage && <button className="btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Добавить подразделение</button>}
      />
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : data!.items.length === 0 ? (
        <Panel><EmptyState icon={<Network />} title="Подразделений пока нет" text={manage ? "Создайте первое подразделение." : undefined} /></Panel>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data!.items.map((d) => (
            <article key={d.id} className={`panel glow flex flex-col ${d.enabled ? "" : "opacity-60"}`}>
              <div className="relative z-[1] flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-serif text-[1.6rem] font-bold leading-none text-primary">{d.shortName}</p>
                    <h2 className="mt-1 font-medium">{d.name}</h2>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <DictBadge dict={DIVISION_STATUS} value={d.status} />
                    {!d.enabled && <Badge>В архиве</Badge>}
                  </div>
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-muted">{d.description}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-[12.5px] text-muted">Руководитель</dt><dd className="truncate">{d.head ? `${d.head.nickname}` : "Не назначен"}</dd></div>
                  <div><dt className="text-[12.5px] text-muted">Сотрудников</dt><dd>{d._count.employees}</dd></div>
                </dl>
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Link to={`/portal/divisions/${d.id}`} className="btn-secondary btn-sm"><Users className="h-4 w-4" /> Подробнее</Link>
                  {manage && <button className="btn-ghost btn-sm" onClick={() => setEdit(d)}><Pencil className="h-4 w-4" /> Изменить</button>}
                  {manage && admin && (
                    <button
                      className="btn-ghost btn-sm"
                      onClick={async () => (await confirm({
                        title: d.enabled ? "Отправить в архив?" : "Восстановить подразделение?",
                        text: d.enabled ? `«${d.name}» будет скрыто из каталога. Сотрудники и история сохранятся.` : `«${d.name}» снова появится в каталоге.`,
                        danger: d.enabled,
                        confirm: d.enabled ? "В архив" : "Восстановить",
                      })) && archive.run(d)}
                    >
                      {d.enabled ? <><Archive className="h-4 w-4" /> В архив</> : <><RotateCcw className="h-4 w-4" /> Восстановить</>}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {edit && <DivisionForm division={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function DivisionForm({ division, onClose }: { division: Division | null; onClose: () => void }) {
  const detail = useQuery({ queryKey: ["division", division?.id], queryFn: () => get<{ item: { employees: Emp[] } }>(`/divisions/${division!.id}`), enabled: !!division });
  const [v, setV] = useState({
    code: division?.code ?? "", name: division?.name ?? "", shortName: division?.shortName ?? "", description: division?.description ?? "",
    tasks: division?.tasks ?? "", status: division?.status ?? "ACTIVE", sortOrder: String(division?.sortOrder ?? 10), headId: division?.headId ?? "", enabled: division?.enabled ?? true,
  });
  const save = useAction(
    () => {
      const body = { ...v, sortOrder: Number(v.sortOrder) || 0, headId: v.headId || null, code: v.code.toUpperCase() };
      return division ? patch(`/divisions/${division.id}`, body) : post("/divisions", body);
    },
    { success: division ? "Подразделение сохранено" : "Подразделение создано", invalidate: [["divisions"], ["division"], ["dashboard"]], onDone: onClose },
  );
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const fe = save.fieldErrors;
  return (
    <Modal open onClose={onClose} wide title={division ? `Подразделение «${division.shortName}»` : "Новое подразделение"} footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button><button className="btn-primary" disabled={save.pending} onClick={() => save.run()}>Сохранить</button></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput label="Код" value={v.code} onChange={set("code")} error={fe.code} hint="Например DPS" required />
        <TextInput label="Краткое название" value={v.shortName} onChange={set("shortName")} error={fe.shortName} required />
        <TextInput label="Порядок в списке" type="number" value={v.sortOrder} onChange={set("sortOrder")} />
        <TextInput className="sm:col-span-3" label="Полное название" value={v.name} onChange={set("name")} error={fe.name} required />
        <TextArea className="sm:col-span-3" label="Описание" rows={3} value={v.description} onChange={set("description")} error={fe.description} required />
        <TextArea className="sm:col-span-3" label="Текущие задачи" hint="Каждая задача с новой строки" rows={3} value={v.tasks} onChange={set("tasks")} />
        <SelectInput label="Статус активности" value={v.status} onChange={set("status")} options={options(DIVISION_STATUS)} />
        {division && (
          <SelectInput className="sm:col-span-2" label="Руководитель" value={v.headId} onChange={set("headId")} error={fe.headId} placeholder="Не назначен"
            options={(detail.data?.item.employees ?? []).map((e) => ({ value: e.id, label: `${e.nickname} — ${e.position}` }))} />
        )}
        <div className="sm:col-span-3"><Checkbox label="Показывать в каталоге" checked={v.enabled} onChange={(b) => setV((x) => ({ ...x, enabled: b }))} /></div>
      </div>
    </Modal>
  );
}

type DivisionFull = Division & { employees: Emp[]; events: { id: string; title: string; startsAt: string; type: string }[] };

export function DivisionDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["division", id], queryFn: () => get<{ item: DivisionFull }>(`/divisions/${id}`) });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const d = data.item;
  const tasks = d.tasks.split("\n").map((t) => t.trim()).filter(Boolean);
  return (
    <>
      <PageHeader title={d.name} description={<span className="flex items-center gap-2"><span className="font-serif font-bold text-primary">{d.shortName}</span><DictBadge dict={DIVISION_STATUS} value={d.status} /></span>} actions={<Link to="/portal/divisions" className="btn-secondary">Все подразделения</Link>} />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Panel title="О подразделении"><p className="whitespace-pre-line text-ink">{d.description}</p></Panel>
          <Panel title={`Личный состав · ${d.employees.length}`} pad={false}>
            {d.employees.length === 0 ? <EmptyState icon={<Users />} title="В подразделении нет сотрудников" /> : (
              <table className="table-base">
                <thead><tr><th>Сотрудник</th><th>Звание</th><th className="hidden sm:table-cell">Должность</th><th>Статус</th></tr></thead>
                <tbody>
                  {d.employees.map((e) => (
                    <tr key={e.id}>
                      <td>{can("employees.view") ? <Link className="link" to={`/portal/employees/${e.id}`}>{e.nickname}</Link> : e.nickname} {e.id === d.headId && <Badge tone="gold">Руководитель</Badge>} {e.isDemo && <DemoBadge />}</td>
                      <td className="text-muted">{e.rank}</td>
                      <td className="hidden text-muted sm:table-cell">{e.position}</td>
                      <td><DictBadge dict={EMPLOYEE_STATUS} value={e.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Руководитель">
            {d.head ? <div><p className="font-medium">{d.head.nickname}</p><p className="text-sm text-muted">{d.head.rank}, {d.head.position}</p></div> : <p className="text-muted">Не назначен</p>}
          </Panel>
          <Panel title="Текущие задачи">
            {tasks.length ? <ul className="list-disc space-y-1.5 pl-5 text-sm">{tasks.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="text-sm text-muted">Задачи не указаны</p>}
          </Panel>
          <Panel title="Ближайшие мероприятия">
            {d.events.length ? (
              <ul className="space-y-2 text-sm">{d.events.map((e) => <li key={e.id} className="flex items-center justify-between gap-2"><span>{e.title}<span className="block text-[12.5px] text-muted">{fmtDateTime(e.startsAt)}</span></span><DictBadge dict={EVENT_TYPE} value={e.type} /></li>)}</ul>
            ) : <p className="text-sm text-muted">Не запланировано</p>}
          </Panel>
        </div>
      </div>
    </>
  );
}
