import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Download, ImagePlus, KeyRound, LogOut, MessagesSquare, RotateCcw, ShieldAlert, Trash2, Upload, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { Emblem } from "../../components/brand/Emblem";
import { Badge, Checkbox, DictBadge, EmptyState, ErrorState, FilterSelect, Loading, Modal, PageHeader, Panel, SearchBox, SelectInput, Tabs, TableWrap, TextArea, TextInput, useConfirm } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useSettings } from "../../context/SettingsContext";
import { api, del, get, patch, post, qs } from "../../lib/api";
import { fmtDate, fmtDateTime, fmtRelative } from "../../lib/format";
import { useAction, useDebounced } from "../../lib/hooks";
import { APPEAL_CATEGORY, APPEAL_STATUS, APPLICATION_STATUS, ORDER_CATEGORY, ROLE, options, RANKS } from "../../lib/labels";
import { ChangePasswordPage } from "../public/Auth";
import { AppealThread } from "../cabinet/Cabinet";
import { useDivisionOptions } from "../portal/Employees";

// ─────────── Настройки портала ───────────
type S = {
  portalName: string; subtitle: string; description: string; contacts: string; logoUrl: string | null;
  addressEnabled: boolean; addressTitle: string; addressBody: string; addressAuthor: string; registrationOpen: boolean; applicationsOpen: boolean;
};

export function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["admin-settings"], queryFn: () => get<{ settings: S }>("/admin/settings") });
  const [v, setV] = useState<S | null>(null);
  useEffect(() => { if (data && !v) setV(data.settings); }, [data, v]);
  const save = useAction(() => {
    const { logoUrl: _l, ...rest } = v!;
    const keys = ["portalName", "subtitle", "description", "contacts", "addressEnabled", "addressTitle", "addressBody", "addressAuthor", "registrationOpen", "applicationsOpen"] as const;
    return patch("/admin/settings", Object.fromEntries(keys.map((k) => [k, rest[k]])));
  }, { success: "Настройки портала сохранены", invalidate: [["admin-settings"], ["public-settings"]] });
  const fileRef = useRef<HTMLInputElement>(null);
  if (isLoading || !v) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const set = (k: keyof S) => (e: { target: { value: string } }) => setV((x) => ({ ...x!, [k]: e.target.value }));
  const fe = save.fieldErrors;

  const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const form = new FormData();
    form.append("file", f);
    try {
      const r = await api<{ url: string }>("/admin/settings/logo", { method: "POST", form });
      setV((x) => ({ ...x!, logoUrl: r.url }));
      await qc.invalidateQueries({ queryKey: ["public-settings"] });
      toast.success("Эмблема обновлена");
    } catch (err) { toast.error(err); }
  };
  const resetLogo = async () => {
    if (!(await confirm({ title: "Вернуть стандартную эмблему?", text: "Загруженное изображение будет удалено." }))) return;
    try { await del("/admin/settings/logo"); setV((x) => ({ ...x!, logoUrl: null })); await qc.invalidateQueries({ queryKey: ["public-settings"] }); toast.success("Стандартная эмблема восстановлена"); } catch (err) { toast.error(err); }
  };

  return (
    <>
      <PageHeader title="Настройки портала" description="Название, описание, обращение администрации, контакты сообщества и доступ к регистрации." actions={<button className="btn-primary" disabled={save.pending} onClick={() => save.run()}>Сохранить настройки</button>} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title="Основное">
            <div className="grid gap-4">
              <TextInput label="Название портала" value={v.portalName} onChange={set("portalName")} error={fe.portalName} />
              <TextInput label="Подзаголовок" value={v.subtitle} onChange={set("subtitle")} error={fe.subtitle} />
              <TextArea label="Описание" rows={3} value={v.description} onChange={set("description")} />
              <TextArea label="Контакты игрового сообщества" hint="Discord, форум и т. п. Показываются в подвале сайта" rows={3} value={v.contacts} onChange={set("contacts")} />
            </div>
          </Panel>
          <Panel title="Обращение администрации">
            <div className="grid gap-4">
              <Checkbox label="Показывать обращение на главной странице и в портале" checked={v.addressEnabled} onChange={(b) => setV((x) => ({ ...x!, addressEnabled: b }))} />
              <TextInput label="Заголовок" value={v.addressTitle} onChange={set("addressTitle")} placeholder="Обращение администрации" />
              <TextArea label="Текст обращения" rows={6} value={v.addressBody} onChange={set("addressBody")} error={fe.addressBody} />
              <TextInput label="Подпись" value={v.addressAuthor} onChange={set("addressAuthor")} placeholder="Администрация УМВД | Кемерово RP" />
            </div>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Эмблема проекта">
            <div className="flex items-center gap-5">
              <Emblem size={72} logoUrl={v.logoUrl} />
              <div className="flex flex-col gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadLogo} />
                <button className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" /> Загрузить</button>
                {v.logoUrl && <button className="btn-ghost btn-sm" onClick={resetLogo}><Trash2 className="h-4 w-4" /> Стандартная</button>}
              </div>
            </div>
            <p className="mt-3 text-[12.5px] text-muted">PNG, JPEG или WebP до 8 МБ. Не используйте официальную государственную символику.</p>
          </Panel>
          <Panel title="Доступ">
            <div className="space-y-4">
              <Checkbox label="Открыта регистрация" checked={v.registrationOpen} onChange={(b) => setV((x) => ({ ...x!, registrationOpen: b }))} />
              <Checkbox label="Принимаются анкеты кандидатов" checked={v.applicationsOpen} onChange={(b) => setV((x) => ({ ...x!, applicationsOpen: b }))} />
            </div>
          </Panel>
          <DataPanel />
          <Panel title="Справочники">
            <p className="text-sm text-muted">Подразделения — в разделе <Link to="/admin/divisions" className="link">«Подразделения»</Link>. Шаблоны документов — в <Link to="/admin/documents" className="link">«Документы»</Link>. Категории приказов фиксированы: {Object.values(ORDER_CATEGORY).map((c) => c.label.toLowerCase()).join(", ")}. Тема и эффекты — в <Link to="/admin/design" className="link">«Дизайн и оформление»</Link>.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}

// ─────────── Безопасность ───────────
type Login = { id: string; login: string; success: boolean; reason: string | null; ip: string | null; userAgent: string | null; adminArea: boolean; createdAt: string };
type Sess = { id: string; createdAt: string; lastSeenAt: string; expiresAt: string; ip: string | null; userAgent: string | null; user: { id: string; nickname: string; login: string; role: string } };

export function SecurityPage() {
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  const [tab, setTab] = useState<"logins" | "sessions" | "password">("logins");
  const [result, setResult] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const logins = useQuery({ queryKey: ["sec-logins", result, dq], queryFn: () => get<{ items: Login[] }>(`/admin/security/logins${qs({ result, q: dq })}`), enabled: tab === "logins" });
  const sessions = useQuery({ queryKey: ["sec-sessions"], queryFn: () => get<{ items: Sess[] }>("/admin/security/sessions"), enabled: tab === "sessions" });
  const revoke = useAction((id: string) => post<{ ok: true; self: boolean }>(`/admin/security/sessions/${id}/revoke`), { success: "Сессия завершена", invalidate: [["sec-sessions"]], onDone: (r) => r.self && logout() });
  const failed24 = logins.data?.items.filter((l) => !l.success && Date.now() - new Date(l.createdAt).getTime() < 86400_000).length ?? 0;
  return (
    <>
      <PageHeader title="Безопасность" description={<>Журнал входов, активные сессии и смена пароля. Ваш последний вход: {fmtDateTime(user?.lastLoginAt)}.</>} />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} items={[{ value: "logins", label: "Журнал входов" }, { value: "sessions", label: "Активные сессии" }, { value: "password", label: "Мой пароль" }]} /></div>
      {tab === "logins" && (
        <Panel pad={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
            <SearchBox className="min-w-[200px] flex-1" value={q} onChange={setQ} placeholder="Логин" />
            <FilterSelect label="Результат" value={result} onChange={setResult} all="Все попытки" options={[{ value: "fail", label: "Неудачные" }, { value: "ok", label: "Успешные" }]} />
            {failed24 > 0 && <Badge tone="warn"><ShieldAlert className="h-3 w-3" /> Неудачных за сутки в выборке: {failed24}</Badge>}
          </div>
          {logins.isLoading ? <Loading /> : logins.data!.items.length === 0 ? <EmptyState title="Записей нет" /> : (
            <div className="p-4 pt-0 sm:p-5 sm:pt-0">
              <TableWrap>
                <table className="table-base">
                  <thead><tr><th>Время</th><th>Логин</th><th>Результат</th><th className="hidden md:table-cell">IP</th><th className="hidden lg:table-cell">Браузер</th></tr></thead>
                  <tbody>
                    {logins.data!.items.map((l) => (
                      <tr key={l.id}>
                        <td className="whitespace-nowrap text-muted">{fmtDateTime(l.createdAt)}</td>
                        <td>{l.login}{l.adminArea && <span className="ml-1.5 text-[12px] text-gold">админ</span>}</td>
                        <td>{l.success ? <Badge tone="ok">Успешно</Badge> : <Badge tone="bad">{l.reason ?? "Отказ"}</Badge>}</td>
                        <td className="hidden text-muted md:table-cell">{l.ip ?? "—"}</td>
                        <td className="hidden max-w-[280px] truncate text-[12.5px] text-muted lg:table-cell" title={l.userAgent ?? ""}>{l.userAgent ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          )}
        </Panel>
      )}
      {tab === "sessions" && (
        <Panel pad={false}>
          {sessions.isLoading ? <Loading /> : sessions.data!.items.length === 0 ? <EmptyState title="Активных сессий нет" /> : (
            <div className="p-4 sm:p-5">
              <TableWrap>
                <table className="table-base">
                  <thead><tr><th>Пользователь</th><th>Активность</th><th className="hidden md:table-cell">Начало</th><th className="hidden lg:table-cell">IP / браузер</th><th /></tr></thead>
                  <tbody>
                    {sessions.data!.items.map((s) => (
                      <tr key={s.id}>
                        <td>{s.user.nickname} <DictBadge dict={ROLE} value={s.user.role} />{s.user.id === user?.id && <span className="ml-1 text-[12px] text-primary">вы</span>}</td>
                        <td className="text-muted">{fmtRelative(s.lastSeenAt)}</td>
                        <td className="hidden text-muted md:table-cell">{fmtDateTime(s.createdAt)}</td>
                        <td className="hidden max-w-[260px] truncate text-[12.5px] text-muted lg:table-cell">{s.ip} · {s.userAgent}</td>
                        <td className="text-right">
                          <button className="btn-ghost btn-sm text-bad" onClick={async () => (await confirm({ title: "Завершить сессию?", text: `${s.user.nickname} будет разлогинен(а) на этом устройстве.`, danger: true, confirm: "Завершить" })) && revoke.run(s.id)}><LogOut className="h-4 w-4" /> Завершить</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          )}
        </Panel>
      )}
      {tab === "password" && <div className="max-w-md"><Panel title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Смена пароля</span>}><ChangePasswordPage embedded /></Panel></div>}
      <p className="mt-6 text-[12.5px] text-muted">Пароли хранятся только в виде хеша PBKDF2 и нигде не отображаются. В интерфейсе нет функций изменения или очистки журналов.</p>
    </>
  );
}

// ─────────── Заявки кандидатов ───────────
type App = { id: string; nickname: string; age: number; contact: string; divisionId: string | null; experience: string; motivation: string; status: string; reviewComment: string | null; createdAt: string; user: { login: string; nickname: string; createdAt: string } };

export function ApplicationsAdmin() {
  const [status, setStatus] = useState("PENDING");
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["applications", status], queryFn: () => get<{ items: App[]; divisions: { id: string; shortName: string }[] }>(`/applications${qs({ status })}`) });
  const [open, setOpen] = useState<App | null>(null);
  const div = (id: string | null) => data?.divisions.find((d) => d.id === id)?.shortName ?? "Не важно";
  return (
    <>
      <PageHeader title="Заявки кандидатов" description="Анкеты на вступление в состав. При одобрении автоматически создаётся карточка сотрудника и запись в кадровой истории." />
      <div className="mb-4"><Tabs value={status} onChange={setStatus} items={[{ value: "PENDING", label: "Новые" }, { value: "INTERVIEW", label: "Собеседование" }, { value: "APPROVED", label: "Одобренные" }, { value: "REJECTED", label: "Отклонённые" }, { value: "", label: "Все" }]} /></div>
      <Panel pad={false}>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorState error={error} onRetry={refetch} /></div> : data!.items.length === 0 ? <EmptyState icon={<UserPlus />} title="Заявок нет" /> : (
          <div className="p-4 sm:p-5">
            <TableWrap>
              <table className="table-base">
                <thead><tr><th>Кандидат</th><th>Подразделение</th><th className="hidden md:table-cell">Контакт</th><th className="hidden sm:table-cell">Подана</th><th>Статус</th></tr></thead>
                <tbody>
                  {data!.items.map((a) => (
                    <tr key={a.id} className="cursor-pointer" onClick={() => setOpen(a)}>
                      <td><p className="font-medium">{a.nickname}</p><p className="text-[12.5px] text-muted">{a.user.login}, {a.age} лет</p></td>
                      <td>{div(a.divisionId)}</td>
                      <td className="hidden text-muted md:table-cell">{a.contact}</td>
                      <td className="hidden text-muted sm:table-cell">{fmtDate(a.createdAt)}</td>
                      <td><DictBadge dict={APPLICATION_STATUS} value={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}
      </Panel>
      {open && <ApplicationReview app={open} divisionName={div(open.divisionId)} onClose={() => setOpen(null)} />}
    </>
  );
}

function ApplicationReview({ app, divisionName, onClose }: { app: App; divisionName: string; onClose: () => void }) {
  const divs = useDivisionOptions();
  const [v, setV] = useState({ comment: "", rank: RANKS[0], position: "Стажёр", divisionId: app.divisionId ?? "" });
  const review = useAction((status: string) => post(`/applications/${app.id}/review`, { status, comment: v.comment || undefined, rank: v.rank, position: v.position, divisionId: v.divisionId || null }), {
    success: "Решение по заявке сохранено, кандидат получил уведомление",
    invalidate: [["applications"], ["employees"], ["admin-overview"]],
    onDone: onClose,
  });
  const open = ["PENDING", "INTERVIEW"].includes(app.status);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open onClose={onClose} wide title={`Анкета: ${app.nickname}`}
      footer={open && <>
        <button className="btn-secondary" disabled={review.pending} onClick={() => review.run("REJECTED")}>Отклонить</button>
        {app.status === "PENDING" && <button className="btn-secondary" disabled={review.pending} onClick={() => review.run("INTERVIEW")}>Пригласить на собеседование</button>}
        <button className="btn-primary" disabled={review.pending} onClick={() => review.run("APPROVED")}>Одобрить и зачислить</button>
      </>}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2"><DictBadge dict={APPLICATION_STATUS} value={app.status} /><span className="text-muted">Учётная запись {app.user.login} от {fmtDate(app.user.createdAt)} · возраст {app.age} · {app.contact} · желаемое подразделение: {divisionName}</span></div>
        <div><p className="font-medium">Игровой опыт</p><p className="mt-1 whitespace-pre-line">{app.experience}</p></div>
        <div><p className="font-medium">Мотивация</p><p className="mt-1 whitespace-pre-line">{app.motivation}</p></div>
        {app.reviewComment && <p className="rounded-item bg-surface2 p-3">Комментарий: {app.reviewComment}</p>}
        {open && (
          <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
            <TextInput label="Звание при зачислении" list="ranks2" value={v.rank} onChange={set("rank")} />
            <datalist id="ranks2">{RANKS.map((r) => <option key={r} value={r} />)}</datalist>
            <TextInput label="Должность" value={v.position} onChange={set("position")} />
            <SelectInput label="Подразделение" value={v.divisionId} onChange={set("divisionId")} placeholder="Без подразделения" options={(divs.data?.items ?? []).map((d) => ({ value: d.id, label: d.shortName }))} />
            <TextArea className="sm:col-span-3" label="Комментарий кандидату" hint="Обязателен при отказе" rows={3} value={v.comment} onChange={set("comment")} error={review.fieldErrors.comment} />
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─────────── Обращения (админ) ───────────
type AppealRow = { id: string; subject: string; category: string; status: string; updatedAt: string; author: { nickname: string; login: string }; _count: { messages: number } };

function AppealsList() {
  const [status, setStatus] = useState("OPEN");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["appeals", status, category, dq], queryFn: () => get<{ items: AppealRow[] }>(`/appeals${qs({ status, category, q: dq })}`) });
  return (
    <>
      <PageHeader title="Обращения пользователей" description="Вопросы, жалобы, предложения и обжалования, адресованные администрации." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={status} onChange={setStatus} items={[{ value: "OPEN", label: "Ожидают ответа" }, { value: "IN_PROGRESS", label: "В работе" }, { value: "ANSWERED", label: "Отвеченные" }, { value: "CLOSED", label: "Закрытые" }, { value: "", label: "Все" }]} />
        <SearchBox className="min-w-[200px] flex-1" value={q} onChange={setQ} placeholder="Тема или автор" />
        <FilterSelect label="Категория" value={category} onChange={setCategory} all="Все категории" options={options(APPEAL_CATEGORY)} />
      </div>
      <Panel pad={false}>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorState error={error} onRetry={refetch} /></div> : data!.items.length === 0 ? <EmptyState icon={<MessagesSquare />} title="Обращений нет" /> : (
          <ul>
            {data!.items.map((a) => (
              <li key={a.id}>
                <Link to={`/admin/appeals/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-5 py-3.5 hover:bg-primary/5">
                  <div className="min-w-0"><p className="truncate font-medium">{a.subject}</p><p className="text-[13px] text-muted">{a.author.nickname} · {APPEAL_CATEGORY[a.category]?.label} · {fmtRelative(a.updatedAt)} · сообщений: {a._count.messages}</p></div>
                  <DictBadge dict={APPEAL_STATUS} value={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

export function AppealsAdmin() {
  return (
    <Routes>
      <Route index element={<AppealsList />} />
      <Route path=":id" element={<AppealThread staff />} />
    </Routes>
  );
}

export { Modal };

// ─────────── Данные портала (резервная копия) ───────────
function DataPanel() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [word, setWord] = useState("");
  const owner = user?.role === "OWNER";
  const { mode } = useSettings();
  const purge = async () => {
    if (!(await confirm({ title: "Удалить демо-данные?", text: "Будут удалены все записи с пометкой «Демо»: вымышленные сотрудники и их кадровая история, демо-приказы, новости, мероприятия, документы и отчёты. Ваши собственные записи не затрагиваются.", danger: true, confirm: "Удалить" }))) return;
    try {
      const r = await post<{ total: number }>("/admin/data/purge-demo", {});
      await qc.invalidateQueries();
      toast.success(r.total ? `Удалено демо-записей: ${r.total}` : "Демо-данных не найдено");
    } catch (e) { toast.error(e); }
  };

  const exportData = async () => {
    try {
      const data = await get<object>("/admin/data/export");
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `umvd-portal-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Резервная копия сохранена в папку загрузок");
    } catch (e) { toast.error(e); }
  };
  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!(await confirm({ title: "Восстановить данные из копии?", text: "Все текущие данные портала в этом браузере будут заменены содержимым файла. Перед этим рекомендуется скачать текущую копию.", danger: true, confirm: "Восстановить" }))) return;
    try {
      const json = JSON.parse(await f.text());
      const r = await post<{ ok: true; relogin: boolean }>("/admin/data/import", json);
      toast.success("Данные восстановлены");
      if (r.relogin) window.location.hash = "#/admin/login";
      await qc.invalidateQueries();
    } catch (err) { toast.error(err instanceof SyntaxError ? new Error("Файл повреждён или это не JSON") : err); }
  };
  const reset = async () => {
    try {
      await post("/admin/data/reset", { confirm: word.trim() });
      setResetOpen(false);
      toast.success("Портал сброшен к начальному состоянию");
      window.location.hash = "#/admin/login";
      await qc.invalidateQueries();
    } catch (err) { toast.error(err); }
  };

  return (
    <Panel title={<span className="flex items-center gap-2"><Database className="h-4 w-4" /> Данные портала</span>}>
      <p className="text-sm text-muted">{mode === "server"
        ? "Данные хранятся в общей базе на сервере и видны всем пользователям портала. Резервная копия пригодится для архива или переноса."
        : "Автономный режим: данные хранятся только в этом браузере. Делайте резервную копию регулярно — по ней же можно перенести данные на сайт в интернете."}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary btn-sm" onClick={exportData}><Download className="h-4 w-4" /> Скачать копию</button>
        <button className="btn-secondary btn-sm" onClick={purge}><Trash2 className="h-4 w-4" /> Удалить демо-данные</button>
        {owner && <>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importData} />
          <button className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Восстановить из копии</button>
          <button className="btn-ghost btn-sm text-bad" onClick={() => { setWord(""); setResetOpen(true); }}><RotateCcw className="h-4 w-4" /> Сбросить</button>
        </>}
      </div>
      {!owner && <p className="mt-2 text-[12.5px] text-muted">Восстановление и сброс доступны только владельцу.</p>}
      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Сбросить портал?" footer={<><button className="btn-secondary" onClick={() => setResetOpen(false)}>Отмена</button><button className="btn-danger" disabled={word.trim() !== "СБРОС"} onClick={reset}>Сбросить всё</button></>}>
        <p className="text-sm">Будут удалены все пользователи, сотрудники, документы и настройки{mode === "server" ? " для всех пользователей портала" : " в этом браузере"}. Портал вернётся к начальному состоянию, владелец SAMER — к первоначальному паролю.</p>
        <TextInput className="mt-4" label="Для подтверждения введите слово СБРОС" value={word} onChange={(e) => setWord(e.target.value)} />
      </Modal>
    </Panel>
  );
}
