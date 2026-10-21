import { useQuery } from "@tanstack/react-query";
import { Bell, FileSignature, Inbox, KeyRound, LayoutDashboard, ShieldCheck, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { CursorGlow, Backdrop, SeasonEffects } from "../../components/brand/Effects";
import { PreviewBar } from "../../components/layout/Shell";
import { Badge, DictBadge, EmptyState, ErrorState, Loading, PageHeader, Panel, SelectInput, TextArea, TextInput, useConfirm } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { get, post } from "../../lib/api";
import { fmtDate, fmtDateTime, fmtRelative } from "../../lib/format";
import { useAction } from "../../lib/hooks";
import { APPEAL_CATEGORY, APPEAL_STATUS, APPLICATION_STATUS, options } from "../../lib/labels";
import { ChangePasswordPage } from "../public/Auth";
import { Emblem } from "../../components/brand/Emblem";

/** Каркас личного кабинета (использует глобальную тему, как и все остальные страницы). */
export function CabinetLayout() {
  const { user, can, logout } = useAuth();
  const { settings } = useSettings();
  const tab = (to: string, label: string, icon: React.ReactNode, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => `flex items-center gap-2 whitespace-nowrap rounded-item px-3 py-2 text-sm ${isActive ? "bg-primary/15 text-ink" : "text-muted hover:text-ink"}`}>
      {icon}
      {label}
    </NavLink>
  );
  return (
    <div className="relative min-h-screen">
      <Backdrop />
      <SeasonEffects />
      <CursorGlow />
      <div className="relative z-10">
        <PreviewBar />
        <header className="border-b border-line" style={{ background: "rgb(var(--c-bg) / 0.82)", backdropFilter: "blur(12px)" }}>
          <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
            <Link to="/" className="flex items-center gap-2.5">
              <Emblem size={30} logoUrl={settings.logoUrl} />
              <span className="font-serif font-bold">Личный кабинет</span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              {can("portal.view") && <Link to="/portal" className="btn-secondary btn-sm"><LayoutDashboard className="h-4 w-4" /> Портал</Link>}
              {can("admin.access") && <Link to="/admin" className="btn-secondary btn-sm"><ShieldCheck className="h-4 w-4" /> Админ-панель</Link>}
              <button className="btn-ghost btn-sm" onClick={logout}>Выйти</button>
            </div>
          </div>
          <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6" aria-label="Разделы кабинета">
            {tab("/cabinet", "Профиль", <Bell className="h-4 w-4" />, true)}
            {!user?.employeeId && tab("/apply", "Анкета кандидата", <UserPlus className="h-4 w-4" />)}
            {tab("/cabinet/appeals", "Обращения", <Inbox className="h-4 w-4" />)}
            {tab("/cabinet/password", "Пароль", <KeyRound className="h-4 w-4" />)}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

type Notification = { id: string; title: string; body: string; link: string | null; read: boolean; createdAt: string };
type Application = { id: string; nickname: string; status: string; reviewComment: string | null; createdAt: string; updatedAt: string };

export function CabinetHome() {
  const { user, can } = useAuth();
  const notes = useQuery({ queryKey: ["notifications"], queryFn: () => get<{ items: Notification[] }>("/auth/notifications") });
  const apps = useQuery({ queryKey: ["my-applications"], queryFn: () => get<{ items: Application[] }>("/applications/my") });
  if (!user) return null;
  const last = apps.data?.items[0];
  return (
    <>
      <PageHeader title={`Здравствуйте, ${user.nickname}`} description="Ваш профиль, статус заявки и уведомления портала." />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-5">
          <Panel title="Учётная запись">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
              <dt className="text-muted">Логин</dt><dd>{user.login}</dd>
              <dt className="text-muted">Игровой ник</dt><dd>{user.nickname}</dd>
              <dt className="text-muted">Роль</dt><dd><Badge tone={user.role === "OWNER" ? "gold" : "primary"}>{user.roleLabel}</Badge></dd>
              <dt className="text-muted">Зарегистрирован</dt><dd>{fmtDate(user.createdAt)}</dd>
              <dt className="text-muted">Последний вход</dt><dd>{fmtDateTime(user.lastLoginAt)}</dd>
              {user.adminSince && (<><dt className="text-muted">Администратор с</dt><dd>{fmtDate(user.adminSince)}</dd></>)}
            </dl>
            {user.employeeId && can("employees.view") && <Link to={`/portal/employees/${user.employeeId}`} className="btn-secondary btn-sm mt-4">Моя карточка сотрудника</Link>}
          </Panel>
          {!user.employeeId && (
            <Panel title="Вступление в состав">
              {apps.isLoading ? <Loading /> : last ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2"><span>Анкета «{last.nickname}» от {fmtDate(last.createdAt)}</span><DictBadge dict={APPLICATION_STATUS} value={last.status} /></div>
                  {last.reviewComment && <p className="rounded-item bg-surface2 p-3 text-muted">Комментарий: {last.reviewComment}</p>}
                  <Link to="/apply" className="link">Подробнее</Link>
                </div>
              ) : (
                <EmptyState icon={<FileSignature />} title="Анкета не подана" text="Заполните анкету кандидата — администрация рассмотрит её и пригласит на собеседование." action={<Link to="/apply" className="btn-primary">Заполнить анкету</Link>} />
              )}
            </Panel>
          )}
        </div>
        <Panel title="Уведомления" pad={false}>
          {notes.isLoading ? <Loading /> : notes.data?.items.length ? (
            <ul>
              {notes.data.items.map((n) => (
                <li key={n.id} className="border-b border-line/60 px-5 py-3 last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className={`text-sm font-medium ${n.read ? "text-muted" : "text-ink"}`}>{n.title}</p>
                    <span className="shrink-0 text-[12px] text-muted">{fmtRelative(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                  {n.link && <Link to={n.link} className="link text-[13px]">Открыть</Link>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Bell />} title="Уведомлений нет" text="Здесь появятся решения по заявкам, ответы на обращения и кадровые изменения." />
          )}
        </Panel>
      </div>
    </>
  );
}

export function PasswordTab() {
  return (
    <>
      <PageHeader title="Смена пароля" description="После смены пароля все остальные сеансы завершатся автоматически." />
      <div className="max-w-md"><Panel><ChangePasswordPage embedded /></Panel></div>
    </>
  );
}

// ─────────── Анкета кандидата ───────────
export function ApplyPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const confirm = useConfirm();
  const divisions = useQuery({ queryKey: ["public-home"], queryFn: () => get<{ divisions: { id: string; name: string }[] }>("/public/home") });
  const apps = useQuery({ queryKey: ["my-applications"], queryFn: () => get<{ items: Application[] }>("/applications/my"), enabled: !!user });
  const [v, setV] = useState({ nickname: user?.nickname ?? "", age: "", contact: "", divisionId: "", experience: "", motivation: "" });
  const submit = useAction((body: unknown) => post("/applications", body), { success: "Анкета отправлена. Решение придёт уведомлением.", invalidate: [["my-applications"], ["me"]] });
  const withdraw = useAction((id: string) => post(`/applications/${id}/withdraw`), { success: "Заявка отозвана", invalidate: [["my-applications"], ["me"]] });

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <PageHeader title="Анкета кандидата" description="Чтобы подать анкету, войдите или зарегистрируйтесь на портале." />
        <div className="flex gap-3"><Link to="/register" className="btn-primary">Зарегистрироваться</Link><Link to="/login?next=/apply" className="btn-secondary">Войти</Link></div>
      </div>
    );
  }
  if (user.employeeId) return <Navigate to="/cabinet" replace />;
  const active = apps.data?.items.find((a) => a.status === "PENDING" || a.status === "INTERVIEW");
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit.run({ ...v, age: Number(v.age) || v.age, divisionId: v.divisionId || null });
  };
  const fe = submit.fieldErrors;

  return (
    <>
      <PageHeader title="Анкета кандидата" description="Анкета рассматривается кадровой службой игрового УМВД. Указывайте только игровые данные." />
      {apps.isLoading ? <Loading /> : active ? (
        <Panel title="Ваша заявка на рассмотрении">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">Анкета «{active.nickname}» от {fmtDate(active.createdAt)}</p>
            <DictBadge dict={APPLICATION_STATUS} value={active.status} />
          </div>
          <p className="mt-3 text-sm text-muted">{active.status === "INTERVIEW" ? "Вас пригласили на собеседование. Следите за объявлениями в игре и уведомлениями портала." : "Кадровая служба рассмотрит анкету в ближайшее время."}</p>
          <button
            className="btn-secondary btn-sm mt-4"
            disabled={withdraw.pending}
            onClick={async () => (await confirm({ title: "Отозвать заявку?", text: "Анкета будет снята с рассмотрения. Подать новую можно в любое время.", confirm: "Отозвать", danger: true })) && withdraw.run(active.id)}
          >
            Отозвать заявку
          </button>
        </Panel>
      ) : !settings.applicationsOpen ? (
        <Panel><p className="text-muted">Приём анкет временно закрыт. Следите за новостями на главной странице.</p></Panel>
      ) : (
        <Panel>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <TextInput label="Игровой ник" value={v.nickname} onChange={set("nickname")} error={fe.nickname} required />
            <TextInput label="Возраст (OOC)" type="number" min={14} max={99} value={v.age} onChange={set("age")} error={fe.age} required />
            <TextInput label="Discord или другой контакт" value={v.contact} onChange={set("contact")} error={fe.contact} required />
            <SelectInput label="Желаемое подразделение" value={v.divisionId} onChange={set("divisionId")} placeholder="Не важно" options={(divisions.data?.divisions ?? []).map((d) => ({ value: d.id, label: d.name }))} />
            <TextArea className="sm:col-span-2" label="Игровой опыт" rows={3} value={v.experience} onChange={set("experience")} error={fe.experience} required hint="Где и сколько играли, опыт в гос. структурах RP" />
            <TextArea className="sm:col-span-2" label="Почему вы хотите служить в УМВД" rows={4} value={v.motivation} onChange={set("motivation")} error={fe.motivation} required />
            <div className="sm:col-span-2 flex justify-end">
              <button className="btn-primary" disabled={submit.pending}>{submit.pending ? "Отправляем…" : "Отправить анкету"}</button>
            </div>
          </form>
        </Panel>
      )}
      {apps.data && apps.data.items.filter((a) => a !== active).length > 0 && (
        <Panel title="История заявок" className="mt-5" pad={false}>
          <ul>
            {apps.data.items.filter((a) => a !== active).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 px-5 py-3 text-sm last:border-0">
                <span>{fmtDate(a.createdAt)} — {a.nickname}{a.reviewComment && <span className="text-muted"> · {a.reviewComment}</span>}</span>
                <DictBadge dict={APPLICATION_STATUS} value={a.status} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

// ─────────── Обращения ───────────
type Appeal = { id: string; subject: string; category: string; status: string; createdAt: string; updatedAt: string; _count: { messages: number } };

export function MyAppealsPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["my-appeals"], queryFn: () => get<{ items: Appeal[] }>("/appeals/my") });
  return (
    <>
      <PageHeader title="Обращения к администрации" description="Вопросы, жалобы, предложения и обжалование взысканий." actions={<Link to="/cabinet/appeals/new" className="btn-primary">Новое обращение</Link>} />
      <Panel pad={false}>
        {isLoading ? <Loading /> : error ? <div className="p-5"><ErrorState error={error} onRetry={refetch} /></div> : data!.items.length === 0 ? (
          <EmptyState icon={<Inbox />} title="Обращений пока нет" text="Если у вас вопрос к руководству или администрации — напишите, ответ придёт сюда." action={<Link to="/cabinet/appeals/new" className="btn-primary">Написать обращение</Link>} />
        ) : (
          <ul>
            {data!.items.map((a) => (
              <li key={a.id}>
                <Link to={`/cabinet/appeals/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-5 py-3.5 hover:bg-primary/5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.subject}</p>
                    <p className="text-[13px] text-muted">{APPEAL_CATEGORY[a.category]?.label} · обновлено {fmtRelative(a.updatedAt)} · сообщений: {a._count.messages}</p>
                  </div>
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

export function NewAppealPage() {
  const navigate = useNavigate();
  const [v, setV] = useState({ category: "QUESTION", subject: "", body: "" });
  const create = useAction((b: typeof v) => post<{ id: string }>("/appeals", b), {
    success: "Обращение отправлено",
    invalidate: [["my-appeals"]],
    onDone: (r) => navigate(`/cabinet/appeals/${r.id}`),
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <>
      <PageHeader title="Новое обращение" description="Обращение увидят только вы и сотрудники администрации, работающие с обращениями." />
      <Panel>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.run(v); }} noValidate>
          <SelectInput label="Категория" value={v.category} onChange={set("category")} options={options(APPEAL_CATEGORY)} />
          <TextInput label="Тема" value={v.subject} onChange={set("subject")} error={create.fieldErrors.subject} required />
          <TextArea label="Текст обращения" rows={7} value={v.body} onChange={set("body")} error={create.fieldErrors.body} required />
          <div className="flex justify-end gap-2">
            <Link to="/cabinet/appeals" className="btn-secondary">Отмена</Link>
            <button className="btn-primary" disabled={create.pending}>Отправить обращение</button>
          </div>
        </form>
      </Panel>
    </>
  );
}

type AppealFull = Appeal & { author: { id: string; nickname: string }; assignee: string | null; messages: { id: string; body: string; isStaff: boolean; createdAt: string; author: { nickname: string } | null }[] };

/** Переписка по обращению. Используется и в кабинете, и в админ-панели (staff = true). */
export function AppealThread({ staff = false }: { staff?: boolean }) {
  const { id } = useParams();
  const confirm = useConfirm();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["appeal", id], queryFn: () => get<{ item: AppealFull }>(`/appeals/${id}`) });
  const [body, setBody] = useState("");
  const send = useAction((b: string) => post(`/appeals/${id}/messages`, { body: b }), { success: "Сообщение отправлено", invalidate: [["appeal", id!], ["my-appeals"], ["appeals"]], onDone: () => setBody("") });
  const setStatus = useAction((s: string) => post(`/appeals/${id}/status`, { status: s }), { success: "Статус обновлён", invalidate: [["appeal", id!], ["appeals"]] });
  const close = useAction(() => post(`/appeals/${id}/close`), { success: "Обращение закрыто", invalidate: [["appeal", id!], ["my-appeals"]] });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const a = data.item;
  return (
    <>
      <PageHeader
        title={a.subject}
        description={<>{APPEAL_CATEGORY[a.category]?.label} · от {a.author.nickname} · {fmtDateTime(a.createdAt)}{a.assignee && <> · ответственный: {a.assignee}</>}</>}
        actions={
          <>
            <DictBadge dict={APPEAL_STATUS} value={a.status} />
            {staff && a.status !== "CLOSED" && a.status !== "IN_PROGRESS" && <button className="btn-secondary btn-sm" onClick={() => setStatus.run("IN_PROGRESS")}>Взять в работу</button>}
            {staff && a.status !== "CLOSED" && <button className="btn-secondary btn-sm" onClick={async () => (await confirm({ title: "Закрыть обращение?", text: "Автор получит уведомление о закрытии." })) && setStatus.run("CLOSED")}>Закрыть</button>}
            {!staff && a.status !== "CLOSED" && <button className="btn-secondary btn-sm" onClick={async () => (await confirm({ title: "Закрыть обращение?", text: "Вопрос решён? После закрытия писать в обращение нельзя." })) && close.run()}>Вопрос решён</button>}
            <Link to={staff ? "/admin/appeals" : "/cabinet/appeals"} className="btn-ghost btn-sm">К списку</Link>
          </>
        }
      />
      <div className="space-y-3">
        {a.messages.map((m) => (
          <div key={m.id} className={`flex ${m.isStaff ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] rounded-panel border px-4 py-3 sm:max-w-[70%] ${m.isStaff ? "border-gold/40 bg-gold/10" : "border-line bg-surface"}`}>
              <p className="text-[12.5px] text-muted">
                {m.isStaff ? <span className="font-medium text-gold">Администрация · {m.author?.nickname ?? "—"}</span> : m.author?.nickname} · {fmtDateTime(m.createdAt)}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-ink">{m.body}</p>
            </div>
          </div>
        ))}
      </div>
      {a.status !== "CLOSED" ? (
        <Panel className="mt-5">
          <form onSubmit={(e) => { e.preventDefault(); if (body.trim()) send.run(body); }} className="space-y-3">
            <TextArea label={staff ? "Ответ администрации" : "Ваше сообщение"} rows={4} value={body} onChange={(e) => setBody(e.target.value)} error={send.fieldErrors.body} />
            <div className="flex justify-end"><button className="btn-primary" disabled={send.pending || !body.trim()}>{staff ? "Отправить ответ" : "Отправить"}</button></div>
          </form>
        </Panel>
      ) : (
        <p className="mt-5 text-center text-sm text-muted">Обращение закрыто.</p>
      )}
    </>
  );
}
