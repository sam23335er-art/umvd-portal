import { useQuery } from "@tanstack/react-query";
import { Archive, Megaphone, Pencil, Pin, PinOff, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge, Checkbox, DemoBadge, DictBadge, EmptyState, ErrorState, FilterSelect, Loading, Modal, PageHeader, Panel, SearchBox, SelectInput, Tabs, TextArea, TextInput, useConfirm } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { get, patch, post, qs } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { useAction, useDebounced } from "../../lib/hooks";
import { NEWS_CATEGORY, options } from "../../lib/labels";

type News = { id: string; title: string; body: string; category: string; pinned: boolean; isPublic: boolean; status: string; createdAt: string; isDemo: boolean; author: { nickname: string } | null };

export function NewsPage({ admin = false }: { admin?: boolean }) {
  const { can } = useAuth();
  const manage = can("news.manage");
  const confirm = useConfirm();
  const [view, setView] = useState<"active" | "archive" | "drafts">("active");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const dq = useDebounced(q);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["news", view, dq, category], queryFn: () => get<{ items: News[] }>(`/news${qs({ view, q: dq, category })}`) });
  const [edit, setEdit] = useState<News | "new" | null>(null);
  const pin = useAction((n: News) => post(`/news/${n.id}/pin`), { success: "Закрепление обновлено", invalidate: [["news"], ["dashboard"], ["public-home"]] });
  const arch = useAction((n: News) => post(`/news/${n.id}/archive`), { success: "Публикация перемещена", invalidate: [["news"], ["dashboard"], ["public-home"]] });

  return (
    <>
      <PageHeader title={admin ? "Управление новостями" : "Новости и объявления"} description="Публикации руководства, важные уведомления и внутренние объявления." actions={manage && <button className="btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Новая публикация</button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={view} onChange={setView} items={[{ value: "active", label: "Актуальные" }, ...(manage ? [{ value: "drafts" as const, label: "Черновики" }] : []), { value: "archive", label: "Архив" }]} />
        <SearchBox className="min-w-[200px] flex-1" value={q} onChange={setQ} placeholder="Поиск по публикациям" />
        <FilterSelect label="Категория" value={category} onChange={setCategory} all="Все категории" options={options(NEWS_CATEGORY)} />
      </div>
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : data!.items.length === 0 ? (
        <Panel><EmptyState icon={<Megaphone />} title={view === "archive" ? "Архив пуст" : "Публикаций нет"} /></Panel>
      ) : (
        <div className="space-y-4">
          {data!.items.map((n) => (
            <article key={n.id} className={`panel glow ${n.pinned ? "border-gold/50" : ""}`}>
              <div className="relative z-[1] p-5">
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                  <DictBadge dict={NEWS_CATEGORY} value={n.category} />
                  {n.pinned && <Badge tone="gold"><Pin className="h-3 w-3" /> Закреплено</Badge>}
                  {n.isPublic && <Badge tone="info">На главной странице</Badge>}
                  {n.isDemo && <DemoBadge />}
                  <span>{fmtDateTime(n.createdAt)} · {n.author?.nickname ?? "Руководство"}</span>
                </div>
                <h2 className="mt-2 font-serif text-xl font-bold">{n.title}</h2>
                <p className="mt-2 whitespace-pre-line text-ink/90">{n.body}</p>
                {manage && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                    <button className="btn-ghost btn-sm" onClick={() => setEdit(n)}><Pencil className="h-4 w-4" /> Изменить</button>
                    {n.status === "PUBLISHED" && <button className="btn-ghost btn-sm" onClick={() => pin.run(n)}>{n.pinned ? <><PinOff className="h-4 w-4" /> Открепить</> : <><Pin className="h-4 w-4" /> Закрепить</>}</button>}
                    <button className="btn-ghost btn-sm" onClick={async () => (n.status === "ARCHIVED" || (await confirm({ title: "Перенести в архив?", text: "Публикация исчезнет из ленты, но останется в архиве." }))) && arch.run(n)}>
                      {n.status === "ARCHIVED" ? <><RotateCcw className="h-4 w-4" /> Восстановить</> : <><Archive className="h-4 w-4" /> В архив</>}
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {edit && <NewsForm item={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function NewsForm({ item, onClose }: { item: News | null; onClose: () => void }) {
  const [v, setV] = useState({ title: item?.title ?? "", body: item?.body ?? "", category: item?.category ?? "NEWS", pinned: item?.pinned ?? false, isPublic: item?.isPublic ?? false, status: item?.status === "DRAFT" ? "DRAFT" : "PUBLISHED" });
  const save = useAction(() => (item ? patch(`/news/${item.id}`, v) : post("/news", v)), { success: v.status === "DRAFT" ? "Черновик сохранён" : "Опубликовано", invalidate: [["news"], ["dashboard"], ["public-home"]], onDone: onClose });
  const set = (k: "title" | "body" | "category" | "status") => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open onClose={onClose} wide title={item ? "Редактирование публикации" : "Новая публикация"} footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button><button className="btn-primary" disabled={save.pending} onClick={() => save.run()}>{v.status === "DRAFT" ? "Сохранить черновик" : "Опубликовать"}</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput className="sm:col-span-2" label="Заголовок" value={v.title} onChange={set("title")} error={save.fieldErrors.title} required />
        <SelectInput label="Категория" value={v.category} onChange={set("category")} options={options(NEWS_CATEGORY)} />
        <SelectInput label="Статус" value={v.status} onChange={set("status")} options={[{ value: "PUBLISHED", label: "Опубликовать" }, { value: "DRAFT", label: "Черновик" }]} />
        <TextArea className="sm:col-span-2" label="Текст" rows={8} value={v.body} onChange={set("body")} error={save.fieldErrors.body} required />
        <Checkbox label="Закрепить вверху ленты" checked={v.pinned} onChange={(b) => setV((x) => ({ ...x, pinned: b }))} />
        <Checkbox label="Показывать на публичной главной странице" hint="Видно всем посетителям без входа" checked={v.isPublic} onChange={(b) => setV((x) => ({ ...x, isPublic: b }))} />
      </div>
    </Modal>
  );
}
