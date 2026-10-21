import { useQuery } from "@tanstack/react-query";
import { Archive, CheckCircle2, Download, FilePlus2, FileText, Pencil, Printer, Send, Undo2 } from "lucide-react";
import { forwardRef, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Emblem } from "../../components/brand/Emblem";
import { DemoBadge, DictBadge, EmptyState, ErrorState, FilterSelect, Loading, Modal, PageHeader, Panel, SearchBox, SelectInput, Tabs, TableWrap, TextArea, TextInput, useConfirm } from "../../components/ui";
import { useAuth, type Me } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { get, patch, post, qs } from "../../lib/api";
import { fmtDateTime, fmtLong } from "../../lib/format";
import { useAction, useDebounced } from "../../lib/hooks";
import { DOCUMENT_STATUS, options } from "../../lib/labels";

export type TemplateField = { key: string; label: string; type: "text" | "textarea" | "date" | "number" | "select"; required?: boolean; max?: number; options?: string[]; placeholder?: string };
export type Template = { type: string; name: string; description: string; fields: TemplateField[]; enabled: boolean; sortOrder: number };
type Author = { id: string; nickname: string; employee: { rank: string; position: string; division: { name: string; shortName: string } | null } | null };
type Doc = { id: string; type: string; title: string; data: Record<string, string>; status: string; reviewComment: string | null; createdAt: string; updatedAt: string; isDemo: boolean; authorId: string; author: Author };

export const useTemplates = () => useQuery({ queryKey: ["templates"], queryFn: () => get<{ items: Template[] }>("/documents/templates"), staleTime: 60_000 });

export function DocumentsPage({ admin = false }: { admin?: boolean }) {
  const { can } = useAuth();
  const reviewer = can("documents.review");
  const [scope, setScope] = useState<"mine" | "all">(admin && reviewer ? "all" : "mine");
  const [status, setStatus] = useState(admin ? "SUBMITTED" : "");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const templates = useTemplates();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["documents", scope, status, type, dq], queryFn: () => get<{ items: Doc[] }>(`/documents${qs({ scope, status, type, q: dq })}`) });
  const [pick, setPick] = useState(false);
  const tName = (t: string) => templates.data?.items.find((x) => x.type === t)?.name ?? t;

  return (
    <>
      <PageHeader
        title={admin ? "Документы сотрудников" : "Документооборот"}
        description="Рапорты, записки, заявления и отчёты. Все документы — материалы ролевого проекта и помечаются соответствующим образом."
        actions={can("documents.create") && <button className="btn-primary" onClick={() => setPick(true)}><FilePlus2 className="h-4 w-4" /> Создать документ</button>}
      />
      {admin && can("templates.manage") && <TemplatesAdmin />}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {reviewer && <Tabs value={scope} onChange={setScope} items={[{ value: "mine", label: "Мои документы" }, { value: "all", label: "Документы сотрудников" }]} />}
        <SearchBox className="min-w-[200px] flex-1" value={q} onChange={setQ} placeholder="Заголовок или автор" />
        <FilterSelect label="Тип" value={type} onChange={setType} all="Все типы" options={(templates.data?.items ?? []).map((t) => ({ value: t.type, label: t.name }))} />
        <FilterSelect label="Статус" value={status} onChange={setStatus} all="Все статусы" options={options(DOCUMENT_STATUS)} />
      </div>
      <Panel pad={false}>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorState error={error} onRetry={refetch} /></div> : data!.items.length === 0 ? (
          <EmptyState icon={<FileText />} title="Документов нет" text={scope === "mine" ? "Создайте рапорт, записку или заявление по шаблону." : "Нет документов с такими условиями."} action={scope === "mine" && can("documents.create") ? <button className="btn-primary" onClick={() => setPick(true)}>Создать документ</button> : undefined} />
        ) : (
          <div className="p-4 pt-0 sm:p-5 sm:pt-0">
            <TableWrap>
              <table className="table-base">
                <thead><tr><th>Документ</th><th className="hidden sm:table-cell">Тип</th>{scope === "all" && <th>Автор</th>}<th className="hidden md:table-cell">Изменён</th><th>Статус</th></tr></thead>
                <tbody>
                  {data!.items.map((d) => (
                    <tr key={d.id}>
                      <td><Link className="font-medium hover:text-primary" to={`/portal/documents/${d.id}`}>{d.title}</Link> {d.isDemo && <DemoBadge />}</td>
                      <td className="hidden text-muted sm:table-cell">{tName(d.type)}</td>
                      {scope === "all" && <td className="text-muted">{d.author.nickname}</td>}
                      <td className="hidden text-muted md:table-cell">{fmtDateTime(d.updatedAt)}</td>
                      <td><DictBadge dict={DOCUMENT_STATUS} value={d.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}
      </Panel>
      <Modal open={pick} onClose={() => setPick(false)} wide title="Выберите шаблон документа">
        <div className="grid gap-3 sm:grid-cols-2">
          {(templates.data?.items ?? []).filter((t) => t.enabled).map((t) => (
            <Link key={t.type} to={`/portal/documents/new/${t.type}`} className="rounded-panel border border-line p-4 transition-colors hover:border-primary/60 hover:bg-primary/5">
              <p className="font-serif text-lg font-bold">{t.name}</p>
              <p className="mt-1 text-sm text-muted">{t.description}</p>
            </Link>
          ))}
        </div>
      </Modal>
    </>
  );
}

function TemplatesAdmin() {
  const { data } = useTemplates();
  const [edit, setEdit] = useState<Template | null>(null);
  const [v, setV] = useState({ name: "", description: "", enabled: true });
  const save = useAction(() => patch(`/documents/templates/${edit!.type}`, v), { success: "Шаблон сохранён", invalidate: [["templates"]], onDone: () => setEdit(null) });
  return (
    <Panel title="Шаблоны документов" className="mb-6" pad={false}>
      <ul className="divide-y divide-line/60">
        {(data?.items ?? []).map((t) => (
          <li key={t.type} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="font-medium">{t.name} {!t.enabled && <span className="text-[12.5px] text-warn">· отключён</span>}</p>
              <p className="text-[13px] text-muted">{t.description} · полей: {t.fields.length}</p>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => { setEdit(t); setV({ name: t.name, description: t.description, enabled: t.enabled }); }}><Pencil className="h-4 w-4" /> Изменить</button>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">Состав полей шаблона задаётся в server/prisma/seed.ts (редактор полей в интерфейсе не реализован).</p>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Шаблон документа" footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Отмена</button><button className="btn-primary" disabled={save.pending} onClick={() => save.run()}>Сохранить</button></>}>
        <div className="space-y-4">
          <TextInput label="Название" value={v.name} onChange={(e) => setV((x) => ({ ...x, name: e.target.value }))} error={save.fieldErrors.name} />
          <TextArea label="Описание" rows={3} value={v.description} onChange={(e) => setV((x) => ({ ...x, description: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-primary))]" checked={v.enabled} onChange={(e) => setV((x) => ({ ...x, enabled: e.target.checked }))} /> Доступен сотрудникам</label>
        </div>
      </Modal>
    </Panel>
  );
}

// ─────────── Бланк документа (предпросмотр, печать, PDF) ───────────
type PaperProps = { template: Template; title: string; data: Record<string, string>; author: { nickname: string; rank?: string; position?: string; division?: string }; date?: string; status?: string };

export const DocumentPaper = forwardRef<HTMLDivElement, PaperProps>(function DocumentPaper({ template, title, data, author, date, status }, ref) {
  return (
    <div ref={ref} className="print-area relative overflow-hidden rounded-[4px] bg-white text-[#16181d] shadow-panel" style={{ fontFamily: '"PT Serif", Georgia, serif' }}>
      {/* полоса в цвете текущей темы — оформление документов следует за сезоном */}
      <div className="h-2" style={{ background: "linear-gradient(90deg, rgb(var(--c-primary)), rgb(var(--c-gold)))" }} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="-rotate-[28deg] select-none whitespace-nowrap text-[42px] font-bold text-black/[0.045] sm:text-[56px]">МАТЕРИАЛ RP-ПРОЕКТА</span>
      </div>
      <div className="relative px-7 py-8 sm:px-12 sm:py-10">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-3">
            <Emblem size={40} />
            <div className="text-[12px] leading-snug">
              <b className="text-[13px]">УМВД | КЕМЕРОВО RP</b>
              <br />игровое подразделение
            </div>
          </div>
          <div className="max-w-[55%] text-right text-[13px] leading-snug">
            {data.to && <p>{data.to}</p>}
            <p className="mt-1">от {author.rank ? `${author.rank.toLowerCase()} ` : ""}{author.nickname}</p>
            {author.position && <p className="text-[#5b616e]">{author.position}{author.division ? `, ${author.division}` : ""}</p>}
          </div>
        </div>
        <p className="mt-8 text-center text-[19px] font-bold uppercase tracking-[0.08em]">{template.name}</p>
        {title && <p className="mt-1 text-center text-[15px]">{title}</p>}
        <div className="mt-6 space-y-4 text-[15px] leading-[1.75]">
          {template.fields.filter((f) => f.key !== "to" && f.key !== "date").map((f) => {
            const val = data[f.key];
            if (f.type === "textarea") return <div key={f.key}>{template.fields.filter((x) => x.type === "textarea").length > 1 && <p className="text-[13px] font-bold">{f.label}</p>}<p className="whitespace-pre-line indent-8">{val || <span className="text-[#9aa0ab]">[{f.label}]</span>}</p></div>;
            return <p key={f.key}><span className="text-[#5b616e]">{f.label}:</span> {f.type === "date" && val ? fmtLong(val) : val || <span className="text-[#9aa0ab]">—</span>}</p>;
          })}
        </div>
        <div className="mt-12 flex items-end justify-between text-[14px]">
          <span>{data.date ? fmtLong(data.date) : date ? fmtLong(date) : "«___» ________ 20__ г."}</span>
          <span className="text-right">
            <span className="block min-w-[160px] border-b border-[#16181d]/50 pb-1 italic">{author.nickname}</span>
            <span className="text-[11px] text-[#7a808c]">подпись (игровая)</span>
          </span>
        </div>
        {status && <p className="mt-6 text-[12px] text-[#5b616e]">Статус в системе: {DOCUMENT_STATUS[status]?.label ?? status}</p>}
        <p className="mt-8 border-t border-dashed border-[#c9ccd3] pt-3 text-center text-[10.5px] text-[#7a808c]">
          Документ сформирован на служебном портале ролевого проекта «Кемерово РП» и не является официальным документом органов внутренних дел.
        </p>
      </div>
    </div>
  );
});

/** Экспорт бланка в PDF (растр через html2canvas, поэтому кириллица сохраняется как есть). */
export async function exportPdf(node: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
  const margin = 10, w = pw - margin * 2;
  const h = (canvas.height * w) / canvas.width;
  const img = canvas.toDataURL("image/jpeg", 0.92);
  let y = 0;
  pdf.addImage(img, "JPEG", margin, margin, w, h);
  while (h - y > ph - margin * 2) {
    y += ph - margin * 2;
    pdf.addPage();
    pdf.addImage(img, "JPEG", margin, margin - y, w, h);
  }
  pdf.save(`${filename.replace(/[^\p{L}\p{N}_ -]+/gu, "").slice(0, 60) || "document"}.pdf`);
}

const authorOf = (u: Me | Author | null, employee?: Author["employee"]) => ({
  nickname: u?.nickname ?? "",
  rank: employee?.rank,
  position: employee?.position,
  division: employee?.division?.name,
});

// ─────────── Редактор ───────────
export function DocumentEditorPage() {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const templates = useTemplates();
  const existing = useQuery({ queryKey: ["document", id], queryFn: () => get<{ item: Doc; template: Template }>(`/documents/${id}`), enabled: !!id });
  const me = useQuery({ queryKey: ["employee", user?.employeeId], queryFn: () => get<{ item: { rank: string; position: string; division: { name: string } | null } }>(`/employees/${user!.employeeId}`), enabled: !!user?.employeeId });
  const template = id ? existing.data?.template : templates.data?.items.find((t) => t.type === type);
  const [title, setTitle] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, string> | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const initialData = useMemo(() => {
    if (existing.data) return existing.data.item.data;
    const d: Record<string, string> = {};
    template?.fields.forEach((f) => (f.type === "date" && f.key === "date" ? (d[f.key] = today) : null));
    return d;
  }, [existing.data, template, today]);
  const values = data ?? initialData;
  const docTitle = title ?? existing.data?.item.title ?? "";
  const paperRef = useRef<HTMLDivElement>(null);

  const save = useAction(
    (submit: boolean): Promise<{ id?: string }> =>
      id ? patch(`/documents/${id}`, { title: docTitle, data: values, submit }) : post<{ id: string }>("/documents", { type, title: docTitle, data: values, submit }),
    {
      success: "Документ сохранён",
      invalidate: [["documents"], ["document", id ?? ""], ["dashboard"]],
      onDone: (r) => navigate(`/portal/documents/${r.id ?? id}`),
    },
  );

  if ((id && existing.isLoading) || (!id && templates.isLoading)) return <Loading />;
  if (!template) return <ErrorState error={new Error("Шаблон документа не найден или отключён")} />;
  const fe = save.fieldErrors;
  const author = authorOf(user, me.data?.item ? { rank: me.data.item.rank, position: me.data.item.position, division: me.data.item.division ? { name: me.data.item.division.name, shortName: "" } : null } : null);

  return (
    <>
      <PageHeader title={id ? `Редактирование: ${template.name}` : `Новый документ: ${template.name}`} description={template.description} actions={<Link to="/portal/documents" className="btn-secondary">К документам</Link>} />
      {existing.data?.item.status === "RETURNED" && existing.data.item.reviewComment && (
        <div className="mb-5 rounded-panel border border-bad/30 bg-bad/10 px-4 py-3 text-sm"><b className="text-bad">Возвращён на доработку:</b> {existing.data.item.reviewComment}</div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Panel title="Заполнение">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.run(true); }} noValidate>
            <TextInput label="Заголовок документа" value={docTitle} onChange={(e) => setTitle(e.target.value)} error={fe.title} required hint="Кратко: о чём документ" />
            {template.fields.map((f) => {
              const common = { label: f.label, required: f.required, value: values[f.key] ?? "", error: fe[`data.${f.key}`], placeholder: f.placeholder };
              const onChange = (e: { target: { value: string } }) => setData({ ...values, [f.key]: e.target.value });
              if (f.type === "textarea") return <TextArea key={f.key} {...common} rows={5} onChange={onChange} maxLength={f.max} />;
              if (f.type === "select") return <SelectInput key={f.key} {...common} onChange={onChange} placeholder="Выберите…" options={(f.options ?? []).map((o) => ({ value: o, label: o }))} />;
              return <TextInput key={f.key} {...common} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} onChange={onChange} maxLength={f.max} />;
            })}
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <button type="button" className="btn-secondary" disabled={save.pending} onClick={() => save.run(false)}>Сохранить черновик</button>
              <button className="btn-primary" disabled={save.pending}><Send className="h-4 w-4" /> Подать на проверку</button>
            </div>
            <p className="text-[12.5px] text-muted">Черновик сохраняется без проверки обязательных полей. При подаче документ проверяется полностью.</p>
          </form>
        </Panel>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-muted">Предварительный просмотр</p>
            <div className="flex gap-1">
              <button className="btn-ghost btn-sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Печать</button>
              <button className="btn-ghost btn-sm" onClick={() => paperRef.current && exportPdf(paperRef.current, docTitle || template.name)}><Download className="h-4 w-4" /> PDF</button>
            </div>
          </div>
          <DocumentPaper ref={paperRef} template={template} title={docTitle} data={values} author={author} />
        </div>
      </div>
    </>
  );
}

// ─────────── Просмотр ───────────
export function DocumentViewPage() {
  const { id } = useParams();
  const { user, can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["document", id], queryFn: () => get<{ item: Doc; template: Template }>(`/documents/${id}`) });
  const [review, setReview] = useState<"ACCEPTED" | "RETURNED" | null>(null);
  const [comment, setComment] = useState("");
  const doReview = useAction(() => post(`/documents/${id}/review`, { status: review, comment: comment || undefined }), { success: "Решение по документу сохранено", invalidate: [["document", id!], ["documents"]], onDone: () => setReview(null) });
  const archive = useAction(() => post(`/documents/${id}/archive`), { success: "Документ в архиве", invalidate: [["document", id!], ["documents"]] });
  const ref = useRef<HTMLDivElement>(null);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const { item: d, template } = data;
  const own = d.authorId === user?.id;
  return (
    <>
      <PageHeader
        title={d.title}
        description={<span className="flex flex-wrap items-center gap-2">{template.name} · {d.author.nickname} · {fmtDateTime(d.updatedAt)} <DictBadge dict={DOCUMENT_STATUS} value={d.status} /> {d.isDemo && <DemoBadge />}</span>}
        actions={
          <>
            {own && ["DRAFT", "RETURNED"].includes(d.status) && <Link to={`/portal/documents/${d.id}/edit`} className="btn-primary"><Pencil className="h-4 w-4" /> Редактировать</Link>}
            {!own && can("documents.review") && d.status === "SUBMITTED" && (
              <>
                <button className="btn-primary" onClick={() => setReview("ACCEPTED")}><CheckCircle2 className="h-4 w-4" /> Принять</button>
                <button className="btn-secondary" onClick={() => setReview("RETURNED")}><Undo2 className="h-4 w-4" /> Вернуть</button>
              </>
            )}
            <button className="btn-secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Печать</button>
            <button className="btn-secondary" onClick={async () => { if (ref.current) { await exportPdf(ref.current, d.title); toast.success("PDF сохранён"); } }}><Download className="h-4 w-4" /> PDF</button>
            {(own || can("documents.review")) && d.status !== "ARCHIVED" && <button className="btn-ghost" onClick={async () => (await confirm({ title: "Отправить документ в архив?", text: "Документ останется доступен для просмотра." })) && archive.run()}><Archive className="h-4 w-4" /></button>}
          </>
        }
      />
      {d.reviewComment && <div className="mb-5 rounded-panel border border-line bg-surface2 px-4 py-3 text-sm"><b>Комментарий проверяющего:</b> {d.reviewComment}</div>}
      <div className="mx-auto max-w-3xl">
        <DocumentPaper ref={ref} template={template} title={d.title} data={d.data} author={authorOf(d.author, d.author.employee)} date={d.createdAt} status={d.status} />
      </div>
      <Modal open={!!review} onClose={() => setReview(null)} title={review === "ACCEPTED" ? "Принять документ" : "Вернуть на доработку"} footer={<><button className="btn-secondary" onClick={() => setReview(null)}>Отмена</button><button className={review === "ACCEPTED" ? "btn-primary" : "btn-danger"} disabled={doReview.pending} onClick={() => doReview.run()}>{review === "ACCEPTED" ? "Принять" : "Вернуть"}</button></>}>
        <TextArea label={review === "ACCEPTED" ? "Комментарий (необязательно)" : "Что нужно исправить"} rows={4} value={comment} onChange={(e) => setComment(e.target.value)} error={doReview.fieldErrors.comment} required={review === "RETURNED"} />
      </Modal>
    </>
  );
}
