import { useQuery } from "@tanstack/react-query";
import { Archive, Pencil, Plus, Printer, RotateCcw, ScrollText, Send } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DemoBadge, DictBadge, EmptyState, ErrorState, FilterSelect, Loading, Modal, PageHeader, Panel, SearchBox, SelectInput, TableWrap, TextArea, TextInput, useConfirm } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { get, patch, post, qs } from "../../lib/api";
import { fmtDate, fmtLong } from "../../lib/format";
import { useAction, useDebounced } from "../../lib/hooks";
import { ORDER_CATEGORY, PUBLISH_STATUS, options } from "../../lib/labels";
import { Emblem } from "../../components/brand/Emblem";

type Order = { id: string; number: string; title: string; category: string; status: string; content: string; publishedAt: string | null; createdAt: string; isDemo: boolean; authorId: string | null; author: { id: string; nickname: string } | null };

export function OrdersPage({ admin = false }: { admin?: boolean }) {
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const dq = useDebounced(q);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["orders", dq, category, status], queryFn: () => get<{ items: Order[] }>(`/orders${qs({ q: dq, category, status })}`) });
  const [edit, setEdit] = useState<Order | "new" | null>(null);
  const publisher = can("orders.publish");
  return (
    <>
      <PageHeader
        title={admin ? "Управление приказами" : "Приказы и распоряжения"}
        description="Реестр игровых приказов УМВД. Публикуют приказы уполномоченные руководители."
        actions={can("orders.create") && <button className="btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Новый приказ</button>}
      />
      <Panel pad={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-4">
          <SearchBox className="min-w-[220px] flex-1" value={q} onChange={setQ} placeholder="Номер, название или текст" />
          <FilterSelect label="Категория" value={category} onChange={setCategory} all="Все категории" options={options(ORDER_CATEGORY)} />
          {(publisher || can("orders.create")) && <FilterSelect label="Статус" value={status} onChange={setStatus} all="Все статусы" options={options(PUBLISH_STATUS)} />}
        </div>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorState error={error} onRetry={refetch} /></div> : data!.items.length === 0 ? (
          <EmptyState icon={<ScrollText />} title="Приказы не найдены" text={can("orders.create") ? "Создайте первый приказ или измените фильтры." : "Измените условия поиска."} />
        ) : (
          <div className="p-4 pt-0 sm:p-5 sm:pt-0">
            <TableWrap>
              <table className="table-base">
                <thead><tr><th>№</th><th>Название</th><th className="hidden md:table-cell">Категория</th><th className="hidden sm:table-cell">Дата публикации</th><th className="hidden lg:table-cell">Автор</th><th>Статус</th><th /></tr></thead>
                <tbody>
                  {data!.items.map((o) => (
                    <tr key={o.id}>
                      <td className="whitespace-nowrap font-medium tabular-nums">{o.number}</td>
                      <td><Link className="hover:text-primary" to={`/portal/orders/${o.id}`}>{o.title}</Link> {o.isDemo && <DemoBadge />}</td>
                      <td className="hidden md:table-cell"><DictBadge dict={ORDER_CATEGORY} value={o.category} /></td>
                      <td className="hidden text-muted sm:table-cell">{fmtDate(o.publishedAt)}</td>
                      <td className="hidden text-muted lg:table-cell">{o.author?.nickname ?? "Руководство"}</td>
                      <td><DictBadge dict={PUBLISH_STATUS} value={o.status} /></td>
                      <td className="text-right"><Link to={`/portal/orders/${o.id}`} className="btn-ghost btn-sm">Открыть</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}
      </Panel>
      {edit && <OrderForm order={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function OrderForm({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const { can } = useAuth();
  const [v, setV] = useState({ number: order?.number ?? "", title: order?.title ?? "", category: order?.category ?? "GENERAL", content: order?.content ?? "" });
  const save = useAction(
    (publish: boolean) => order ? patch(`/orders/${order.id}`, { ...v, number: v.number || undefined }) : post("/orders", { ...v, number: v.number || undefined, publish }),
    { success: (/* r */) => (order ? "Приказ сохранён" : "Приказ создан"), invalidate: [["orders"], ["order"], ["dashboard"]], onDone: onClose },
  );
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const fe = save.fieldErrors;
  return (
    <Modal open onClose={onClose} wide title={order ? `Приказ № ${order.number}` : "Новый приказ"}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Отмена</button>
        <button className={order || !can("orders.publish") ? "btn-primary" : "btn-secondary"} disabled={save.pending} onClick={() => save.run(false)}>{order ? "Сохранить" : "Сохранить черновик"}</button>
        {!order && can("orders.publish") && <button className="btn-primary" disabled={save.pending} onClick={() => save.run(true)}><Send className="h-4 w-4" /> Опубликовать</button>}
      </>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput label="Номер" value={v.number} onChange={set("number")} hint={order ? undefined : "Пусто — присвоится автоматически"} error={fe.number} />
        <SelectInput className="sm:col-span-2" label="Категория" value={v.category} onChange={set("category")} options={options(ORDER_CATEGORY)} />
        <TextInput className="sm:col-span-3" label="Название" value={v.title} onChange={set("title")} error={fe.title} required />
        <TextArea className="sm:col-span-3" label="Текст приказа" rows={10} value={v.content} onChange={set("content")} error={fe.content} required />
      </div>
    </Modal>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const { can, user } = useAuth();
  const confirm = useConfirm();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["order", id], queryFn: () => get<{ item: Order }>(`/orders/${id}`) });
  const [edit, setEdit] = useState(false);
  const act = useAction((a: string) => post(`/orders/${id}/${a}`), { success: "Статус приказа обновлён", invalidate: [["order", id!], ["orders"], ["dashboard"]] });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const o = data.item;
  const canEdit = can("orders.publish") || (o.authorId === user?.id && o.status === "DRAFT");
  return (
    <>
      <PageHeader
        title={`Приказ № ${o.number}`}
        description={<span className="flex flex-wrap items-center gap-2"><DictBadge dict={ORDER_CATEGORY} value={o.category} /><DictBadge dict={PUBLISH_STATUS} value={o.status} />{o.isDemo && <DemoBadge />}</span>}
        actions={
          <>
            {canEdit && <button className="btn-secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Изменить</button>}
            {can("orders.publish") && o.status === "DRAFT" && <button className="btn-primary" onClick={async () => (await confirm({ title: "Опубликовать приказ?", text: "Приказ станет виден всему личному составу." })) && act.run("publish")}><Send className="h-4 w-4" /> Опубликовать</button>}
            {can("orders.publish") && o.status === "PUBLISHED" && <button className="btn-secondary" onClick={async () => (await confirm({ title: "Отправить в архив?", text: "Приказ перестанет отображаться в списке действующих. Его можно будет восстановить.", danger: true, confirm: "В архив" })) && act.run("archive")}><Archive className="h-4 w-4" /> В архив</button>}
            {can("orders.publish") && o.status === "ARCHIVED" && <button className="btn-secondary" onClick={() => act.run("restore")}><RotateCcw className="h-4 w-4" /> Восстановить</button>}
            <button className="btn-secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Печать</button>
          </>
        }
      />
      <article className="print-area mx-auto max-w-3xl rounded-panel border border-line bg-white px-6 py-10 text-[#16181d] shadow-panel sm:px-14">
        <div className="flex flex-col items-center text-center">
          <Emblem size={52} />
          <p className="mt-3 font-serif text-sm font-bold">УМВД | КЕМЕРОВО RP</p>
          <p className="text-[12px] text-[#5b616e]">игровое подразделение ролевого проекта «Кемерово РП»</p>
          <p className="mt-6 font-serif text-xl font-bold tracking-wide">ПРИКАЗ</p>
          <div className="mt-2 flex w-full justify-between text-sm"><span>{o.publishedAt ? fmtLong(o.publishedAt) : "Проект (не опубликован)"}</span><span>№ {o.number}</span></div>
        </div>
        <h2 className="mt-6 text-center font-serif text-lg font-bold text-[#16181d]">{o.title}</h2>
        <div className="mt-5 whitespace-pre-line font-serif text-[16px] leading-[1.8]">{o.content}</div>
        <div className="mt-10 flex justify-between text-sm"><span>Подготовил(а)</span><span className="font-serif italic">{o.author?.nickname ?? "Руководство УМВД"}</span></div>
        <p className="mt-10 border-t border-dashed border-[#c9ccd3] pt-3 text-center text-[11px] text-[#7a808c]">Документ ролевой игры. Не является официальным документом органов внутренних дел.</p>
      </article>
      {edit && <OrderForm order={o} onClose={() => setEdit(false)} />}
    </>
  );
}
