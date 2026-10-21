import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DemoBadge, DictBadge, EmptyState, ErrorState, FilterSelect, Loading, Modal, PageHeader, Panel, SearchBox, SelectInput, Stat, TableWrap, TextArea, TextInput } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { get, patch, post, qs } from "../../lib/api";
import { fmtDate, fmtDateTime, toDateInput } from "../../lib/format";
import { useAction, useDebounced } from "../../lib/hooks";
import { REPORT_STATUS, options } from "../../lib/labels";
import { useDivisionOptions } from "./Employees";

type Report = {
  id: string; title: string; divisionId: string; periodFrom: string; periodTo: string; tasksDone: string; participants: number; results: string; headComment: string | null;
  status: string; authorId: string; isDemo: boolean; createdAt: string; division: { id: string; shortName: string; name: string }; author: { nickname: string };
};
type Summary = { total: number; participants: number; byStatus: Record<string, number> };

export function ReportsPage({ admin = false }: { admin?: boolean }) {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [division, setDivision] = useState("");
  const [status, setStatus] = useState(admin ? "PENDING" : "");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const divs = useDivisionOptions();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["reports", division, status, dq], queryFn: () => get<{ items: Report[]; summary: Summary }>(`/reports${qs({ division, status, q: dq })}`) });
  const [open, setOpen] = useState<Report | null>(null);
  const [edit, setEdit] = useState<Report | "new" | null>(null);
  useEffect(() => {
    if (params.get("new") === "1") { setEdit("new"); setParams({}, { replace: true }); }
  }, [params, setParams]);
  const s = data?.summary;
  return (
    <>
      <PageHeader
        title={admin ? "Проверка отчётов" : "Отчётность"}
        description={can("reports.review") ? "Отчёты подразделений о проделанной работе. Сводка считается по выбранным фильтрам." : "Ваши отчёты о деятельности подразделения."}
        actions={can("reports.create") && <button className="btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Подать отчёт</button>}
      />
      {s && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Отчётов" value={s.total} icon={<ClipboardList />} />
          <Stat label="На проверке" value={s.byStatus.PENDING ?? 0} tone="warn" />
          <Stat label="Утверждено" value={s.byStatus.APPROVED ?? 0} tone="ok" icon={<CheckCircle2 />} />
          <Stat label="Участников в мероприятиях" value={s.participants} tone="gold" hint="сумма по отчётам" />
        </div>
      )}
      <Panel pad={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-4">
          <SearchBox className="min-w-[200px] flex-1" value={q} onChange={setQ} placeholder="Название или описание задач" />
          <FilterSelect label="Подразделение" value={division} onChange={setDivision} all="Все подразделения" options={(divs.data?.items ?? []).map((d) => ({ value: d.id, label: d.shortName }))} />
          <FilterSelect label="Статус проверки" value={status} onChange={setStatus} all="Все статусы" options={options(REPORT_STATUS)} />
        </div>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorState error={error} onRetry={refetch} /></div> : data!.items.length === 0 ? (
          <EmptyState icon={<ClipboardList />} title="Отчётов нет" text="По выбранным условиям отчёты не найдены." />
        ) : (
          <div className="p-4 pt-0 sm:p-5 sm:pt-0">
            <TableWrap>
              <table className="table-base">
                <thead><tr><th>Отчёт</th><th>Подразделение</th><th className="hidden md:table-cell">Период</th><th className="hidden lg:table-cell">Автор</th><th className="hidden sm:table-cell">Участников</th><th>Статус</th></tr></thead>
                <tbody>
                  {data!.items.map((r) => (
                    <tr key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                      <td className="font-medium">{r.title} {r.isDemo && <DemoBadge />}</td>
                      <td>{r.division.shortName}</td>
                      <td className="hidden whitespace-nowrap text-muted md:table-cell">{fmtDate(r.periodFrom)} – {fmtDate(r.periodTo)}</td>
                      <td className="hidden text-muted lg:table-cell">{r.author.nickname}</td>
                      <td className="hidden tabular-nums sm:table-cell">{r.participants}</td>
                      <td><DictBadge dict={REPORT_STATUS} value={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}
      </Panel>
      {open && <ReportDetail report={open} onClose={() => setOpen(null)} onEdit={() => { setEdit(open); setOpen(null); }} />}
      {edit && <ReportForm report={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ReportDetail({ report: r, onClose, onEdit }: { report: Report; onClose: () => void; onEdit: () => void }) {
  const { user, can } = useAuth();
  const [comment, setComment] = useState(r.headComment ?? "");
  const review = useAction((status: string) => post(`/reports/${r.id}/review`, { status, headComment: comment || undefined }), { success: "Решение по отчёту сохранено", invalidate: [["reports"], ["dashboard"]], onDone: onClose });
  const own = r.authorId === user?.id;
  const canReview = can("reports.review") && !own && r.status === "PENDING";
  return (
    <Modal open onClose={onClose} wide title={r.title}
      footer={<>
        {own && ["PENDING", "REVISION"].includes(r.status) && <button className="btn-secondary" onClick={onEdit}><Pencil className="h-4 w-4" /> Исправить</button>}
        {canReview && <>
          <button className="btn-secondary" disabled={review.pending} onClick={() => review.run("REJECTED")}>Отклонить</button>
          <button className="btn-secondary" disabled={review.pending} onClick={() => review.run("REVISION")}>На доработку</button>
          <button className="btn-primary" disabled={review.pending} onClick={() => review.run("APPROVED")}>Утвердить</button>
        </>}
      </>}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2"><DictBadge dict={REPORT_STATUS} value={r.status} />{r.isDemo && <DemoBadge />}<span className="text-muted">{r.division.name} · {fmtDate(r.periodFrom)} – {fmtDate(r.periodTo)} · {r.author.nickname} · подан {fmtDateTime(r.createdAt)}</span></div>
        <div><p className="font-medium">Выполненные задачи</p><p className="mt-1 whitespace-pre-line text-ink/90">{r.tasksDone}</p></div>
        <div><p className="font-medium">Результаты</p><p className="mt-1 whitespace-pre-line text-ink/90">{r.results}</p></div>
        <p><span className="text-muted">Количество участников:</span> {r.participants}</p>
        {canReview ? (
          <TextArea label="Комментарий руководителя" hint="Обязателен при возврате или отклонении" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} error={review.fieldErrors.headComment} />
        ) : r.headComment && (
          <div className="rounded-item border border-line bg-surface2 p-3"><p className="font-medium">Комментарий руководителя</p><p className="mt-1">{r.headComment}</p></div>
        )}
      </div>
    </Modal>
  );
}

function ReportForm({ report, onClose }: { report: Report | null; onClose: () => void }) {
  const { user } = useAuth();
  const divs = useDivisionOptions();
  const weekAgo = new Date(Date.now() - 6 * 86400_000);
  const [v, setV] = useState({
    divisionId: report?.divisionId ?? user?.divisionId ?? "", title: report?.title ?? "", periodFrom: toDateInput(report?.periodFrom ?? weekAgo), periodTo: toDateInput(report?.periodTo ?? new Date()),
    tasksDone: report?.tasksDone ?? "", participants: String(report?.participants ?? ""), results: report?.results ?? "",
  });
  const save = useAction(() => {
    const body = { ...v, participants: v.participants === "" ? undefined : Number(v.participants) };
    return report ? patch(`/reports/${report.id}`, body) : post("/reports", body);
  }, { success: report ? "Отчёт исправлен и отправлен повторно" : "Отчёт подан на проверку", invalidate: [["reports"], ["dashboard"]], onDone: onClose });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const fe = save.fieldErrors;
  return (
    <Modal open onClose={onClose} wide title={report ? "Исправление отчёта" : "Новый отчёт о деятельности"} footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button><button className="btn-primary" disabled={save.pending} onClick={() => save.run()}>Отправить на проверку</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput label="Подразделение" value={v.divisionId} onChange={set("divisionId")} error={fe.divisionId} placeholder="Выберите…" required options={(divs.data?.items ?? []).map((d) => ({ value: d.id, label: d.name }))} />
        <TextInput label="Количество участников" type="number" min={0} value={v.participants} onChange={set("participants")} error={fe.participants} required />
        <TextInput className="sm:col-span-2" label="Название отчёта" value={v.title} onChange={set("title")} error={fe.title} required />
        <TextInput label="Период с" type="date" value={v.periodFrom} onChange={set("periodFrom")} error={fe.periodFrom} required />
        <TextInput label="Период по" type="date" value={v.periodTo} onChange={set("periodTo")} error={fe.periodTo} required />
        <TextArea className="sm:col-span-2" label="Выполненные задачи" rows={5} value={v.tasksDone} onChange={set("tasksDone")} error={fe.tasksDone} required />
        <TextArea className="sm:col-span-2" label="Результаты мероприятий" rows={4} value={v.results} onChange={set("results")} error={fe.results} required />
      </div>
    </Modal>
  );
}
