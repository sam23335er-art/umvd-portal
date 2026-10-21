import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, List, MapPin, Pencil, Plus, UserCheck, UserMinus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { DemoBadge, DictBadge, EmptyState, ErrorState, FilterSelect, Loading, Modal, PageHeader, Panel, SelectInput, Tabs, TextArea, TextInput } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { get, patch, post, qs } from "../../lib/api";
import { fmtDateTime, fmtTime, toLocalInput } from "../../lib/format";
import { useAction } from "../../lib/hooks";
import { EVENT_STATUS, EVENT_TYPE, options } from "../../lib/labels";
import { useDivisionOptions } from "./Employees";

type Event = {
  id: string; title: string; type: string; startsAt: string; endsAt: string | null; location: string; description: string; status: string; isDemo: boolean; divisionId: string | null;
  organizer: { nickname: string } | null; division: { shortName: string } | null; _count: { participants: number }; joined: boolean;
};
type EventFull = Omit<Event, "_count" | "division"> & { division: { id: string; shortName: string; name: string } | null; participants: { userId: string; user: { nickname: string; employee: { rank: string } | null } }[] };

const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const typeDot: Record<string, string> = { FORMATION: "bg-primary", BRIEFING: "bg-info", INSPECTION: "bg-warn", TRAINING: "bg-ok", MEETING: "bg-muted", OPERATION: "bg-bad" };

export function EventsPage({ admin = false }: { admin?: boolean }) {
  const { can } = useAuth();
  const [mode, setMode] = useState<"calendar" | "list">(admin ? "list" : "calendar");
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const range = useMemo(() => {
    if (mode === "list") return { from: status ? undefined : new Date(Date.now() - 86400_000).toISOString() };
    const from = new Date(month); from.setDate(from.getDate() - 7);
    const to = new Date(month); to.setMonth(to.getMonth() + 1); to.setDate(to.getDate() + 7);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [mode, month, status]);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["events", range, type, status], queryFn: () => get<{ items: Event[] }>(`/events${qs({ ...range, type, status })}`) });
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Event | EventFull | "new" | null>(null);

  return (
    <>
      <PageHeader
        title={admin ? "Управление мероприятиями" : "Расписание мероприятий"}
        description="Построения, инструктажи, проверки, учения, совещания и RP-операции. Место указывается в игровом мире."
        actions={can("events.manage") && <button className="btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Новое мероприятие</button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={mode} onChange={setMode} items={[{ value: "calendar", label: "Календарь" }, { value: "list", label: "Список" }]} />
        <FilterSelect label="Тип" value={type} onChange={setType} all="Все типы" options={options(EVENT_TYPE)} />
        {mode === "list" && <FilterSelect label="Статус" value={status} onChange={setStatus} all="Предстоящие и текущие" options={options(EVENT_STATUS)} />}
        {mode === "calendar" && (
          <div className="ml-auto flex items-center gap-1">
            <button className="btn-ghost btn-sm" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Предыдущий месяц"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-[150px] text-center font-serif text-lg font-bold">{(() => { const t = month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }); return t[0].toUpperCase() + t.slice(1); })()}</span>
            <button className="btn-ghost btn-sm" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Следующий месяц"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : mode === "calendar" ? (
        <Calendar month={month} events={data!.items} onOpen={setOpen} />
      ) : data!.items.length === 0 ? (
        <Panel><EmptyState icon={<List />} title="Мероприятий нет" text="Измените фильтры или создайте мероприятие." /></Panel>
      ) : (
        <div className="space-y-3">
          {data!.items.map((e) => <EventRow key={e.id} e={e} onOpen={() => setOpen(e.id)} />)}
        </div>
      )}
      {open && <EventDetail id={open} onClose={() => setOpen(null)} onEdit={(e) => { setOpen(null); setEdit(e); }} />}
      {edit && <EventForm event={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function EventRow({ e, onOpen }: { e: Event; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="panel glow flex w-full items-start gap-4 p-4 text-left">
      <div className="relative z-[1] w-14 shrink-0 text-center">
        <p className="font-serif text-2xl font-bold leading-none text-primary">{new Date(e.startsAt).getDate()}</p>
        <p className="text-[12px] text-muted">{new Date(e.startsAt).toLocaleDateString("ru-RU", { month: "short" })}</p>
      </div>
      <div className="relative z-[1] min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{e.title}</p>
          <DictBadge dict={EVENT_TYPE} value={e.type} />
          {e.status !== "PLANNED" && <DictBadge dict={EVENT_STATUS} value={e.status} />}
          {e.joined && <span className="text-[12.5px] text-ok">Вы участвуете</span>}
          {e.isDemo && <DemoBadge />}
        </div>
        <p className="mt-0.5 text-[13px] text-muted">{fmtTime(e.startsAt)}{e.endsAt && `–${fmtTime(e.endsAt)}`} · {e.location}{e.division && ` · ${e.division.shortName}`} · участников: {e._count.participants}</p>
      </div>
    </button>
  );
}

function Calendar({ month, events, onOpen }: { month: Date; events: Event[]; onOpen: (id: string) => void }) {
  const days = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const byDay = useMemo(() => {
    const m = new Map<string, Event[]>();
    for (const e of events) { const k = key(new Date(e.startsAt)); m.set(k, [...(m.get(k) ?? []), e]); }
    return m;
  }, [events]);
  const today = key(new Date());
  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line text-center text-[12.5px] font-medium text-muted">{WEEK.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const list = byDay.get(key(d)) ?? [];
          const inMonth = d.getMonth() === month.getMonth();
          return (
            <div key={i} className={`min-h-[76px] border-b border-r border-line/60 p-1.5 sm:min-h-[108px] ${inMonth ? "" : "opacity-40"} ${i % 7 === 6 ? "border-r-0" : ""}`}>
              <p className={`mb-1 text-right text-[12.5px] ${key(d) === today ? "font-bold text-primary" : "text-muted"}`}>
                {key(d) === today ? <span className="inline-block rounded-full bg-primary px-1.5 text-primary-fg">{d.getDate()}</span> : d.getDate()}
              </p>
              <div className="space-y-1">
                {list.slice(0, 3).map((e) => (
                  <button key={e.id} onClick={() => onOpen(e.id)} className={`flex w-full items-center gap-1.5 truncate rounded-[4px] bg-surface2 px-1.5 py-0.5 text-left text-[12px] hover:bg-primary/15 ${e.status === "CANCELLED" ? "line-through opacity-60" : ""}`} title={e.title}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${typeDot[e.type]}`} />
                    <span className="hidden tabular-nums text-muted sm:inline">{fmtTime(e.startsAt)}</span>
                    <span className="truncate">{e.title}</span>
                  </button>
                ))}
                {list.length > 3 && <p className="px-1 text-[11.5px] text-muted">ещё {list.length - 3}</p>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 border-t border-line px-4 py-2.5 text-[12.5px] text-muted">
        {Object.entries(EVENT_TYPE).map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${typeDot[k]}`} />{v.label}</span>)}
      </div>
    </div>
  );
}

function EventDetail({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (e: EventFull) => void }) {
  const { can } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["event", id], queryFn: () => get<{ item: EventFull }>(`/events/${id}`) });
  const join = useAction((j: boolean) => post(`/events/${id}/${j ? "join" : "leave"}`), { success: (/**/) => "Отметка участия обновлена", invalidate: [["event", id], ["events"], ["dashboard"]] });
  const e = data?.item;
  return (
    <Modal open onClose={onClose} wide title={e?.title ?? "Мероприятие"}
      footer={e && <>
        {can("events.manage") && <button className="btn-secondary" onClick={() => onEdit(e)}><Pencil className="h-4 w-4" /> Изменить</button>}
        {can("events.join") && e.status === "PLANNED" && (e.joined
          ? <button className="btn-secondary" disabled={join.pending} onClick={() => join.run(false)}><UserMinus className="h-4 w-4" /> Отменить участие</button>
          : <button className="btn-primary" disabled={join.pending} onClick={() => join.run(true)}><UserCheck className="h-4 w-4" /> Отметить участие</button>)}
      </>}>
      {isLoading || !e ? <Loading /> : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2"><DictBadge dict={EVENT_TYPE} value={e.type} /><DictBadge dict={EVENT_STATUS} value={e.status} />{e.isDemo && <DemoBadge />}</div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="flex gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-muted" /><div><dt className="text-muted">Дата и время</dt><dd>{fmtDateTime(e.startsAt)}{e.endsAt && ` – ${fmtTime(e.endsAt)}`}</dd></div></div>
            <div className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-muted" /><div><dt className="text-muted">Место в игровом мире</dt><dd>{e.location}</dd></div></div>
            <div><dt className="text-muted">Организатор</dt><dd>{e.organizer?.nickname ?? "Руководство"}</dd></div>
            <div><dt className="text-muted">Подразделение</dt><dd>{e.division?.name ?? "Все подразделения"}</dd></div>
          </dl>
          {e.description && <p className="whitespace-pre-line">{e.description}</p>}
          <div>
            <p className="mb-2 flex items-center gap-2 font-medium"><Users className="h-4 w-4" /> Участники · {e.participants.length}</p>
            {e.participants.length === 0 ? <p className="text-muted">Пока никто не отметился.</p> : (
              <div className="flex flex-wrap gap-1.5">{e.participants.map((p) => <span key={p.userId} className="rounded-full border border-line bg-surface2 px-2.5 py-0.5 text-[13px]">{p.user.employee?.rank ? `${p.user.employee.rank.split(" ")[0]} ` : ""}{p.user.nickname}</span>)}</div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function EventForm({ event, onClose }: { event: Event | EventFull | null; onClose: () => void }) {
  const divs = useDivisionOptions();
  const { user } = useAuth();
  const scoped = user?.role === "DIV_HEAD";
  const [v, setV] = useState({
    title: event?.title ?? "", type: event?.type ?? "FORMATION", startsAt: toLocalInput(event?.startsAt), endsAt: toLocalInput(event?.endsAt),
    location: event?.location ?? "", description: event?.description ?? "", divisionId: event?.divisionId ?? (scoped ? user?.divisionId ?? "" : ""), status: event?.status ?? "PLANNED",
  });
  const save = useAction(
    () => {
      const body = { ...v, startsAt: v.startsAt ? new Date(v.startsAt).toISOString() : "", endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : null, divisionId: v.divisionId || null };
      return event ? patch(`/events/${event.id}`, body) : post("/events", { ...body, status: undefined });
    },
    { success: event ? "Мероприятие сохранено" : "Мероприятие создано", invalidate: [["events"], ["event"], ["dashboard"]], onDone: onClose },
  );
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const fe = save.fieldErrors;
  return (
    <Modal open onClose={onClose} wide title={event ? "Изменение мероприятия" : "Новое мероприятие"} footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button><button className="btn-primary" disabled={save.pending} onClick={() => save.run()}>Сохранить</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput className="sm:col-span-2" label="Название" value={v.title} onChange={set("title")} error={fe.title} required />
        <SelectInput label="Тип" value={v.type} onChange={set("type")} options={options(EVENT_TYPE)} />
        <SelectInput label="Подразделение" value={v.divisionId} onChange={set("divisionId")} disabled={scoped} placeholder="Все подразделения" options={(divs.data?.items ?? []).map((d) => ({ value: d.id, label: d.name }))} />
        <TextInput label="Начало" type="datetime-local" value={v.startsAt} onChange={set("startsAt")} error={fe.startsAt} required />
        <TextInput label="Окончание" type="datetime-local" value={v.endsAt} onChange={set("endsAt")} error={fe.endsAt} />
        <TextInput className="sm:col-span-2" label="Место в игровом мире" value={v.location} onChange={set("location")} error={fe.location} required />
        <TextArea className="sm:col-span-2" label="Описание" rows={4} value={v.description} onChange={set("description")} />
        {event && <SelectInput label="Статус" value={v.status} onChange={set("status")} options={options(EVENT_STATUS)} />}
      </div>
    </Modal>
  );
}
