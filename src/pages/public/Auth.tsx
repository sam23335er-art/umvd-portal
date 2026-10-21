import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { CityScape } from "../../components/brand/CityScape";
import { Emblem } from "../../components/brand/Emblem";
import { CursorGlow, SeasonEffects } from "../../components/brand/Effects";
import { TextInput } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { useToast } from "../../context/ToastContext";
import { ApiError, post } from "../../lib/api";

/** Общий каркас страниц входа: панорама слева, форма справа. Тема — глобальная. */
function AuthFrame({ title, subtitle, children, admin }: { title: string; subtitle: string; children: ReactNode; admin?: boolean }) {
  const { theme, settings } = useSettings();
  const photo = settings.themeBackgrounds?.[theme.id];
  return (
    <div className="relative grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <SeasonEffects />
      <CursorGlow />
      <div className="relative hidden overflow-hidden lg:block">
        {photo ? <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <CityScape season={theme.id} className="absolute inset-0 h-full w-full" />}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(var(--c-bg) / 0.15), rgb(var(--c-bg) / 0.75))" }} />
        <div className="absolute bottom-10 left-10 right-10">
          <p className="font-serif text-3xl font-bold leading-tight text-ink">{admin ? "Управление порталом" : "Служебный портал УМВД"}</p>
          <p className="mt-2 max-w-md text-muted">Ролевой проект «Кемерово РП». Сведения на портале игровые и не относятся к реальным органам власти.</p>
        </div>
      </div>
      <div className="relative z-10 flex items-center justify-center px-4 py-12" style={{ background: "rgb(var(--c-bg) / 0.9)" }}>
        <div className="w-full max-w-[400px]">
          <Link to="/" className="mb-8 flex items-center gap-3">
            <Emblem size={44} logoUrl={settings.logoUrl} />
            <div className="leading-tight">
              <div className="font-serif text-lg font-bold">УМВД | Кемерово RP</div>
              <div className="text-[13px] text-muted">{admin ? "Административная панель" : settings.subtitle}</div>
            </div>
          </Link>
          <h1 className="font-serif text-[1.75rem] font-bold">{title}</h1>
          <p className="mt-1 text-muted">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}

function useLoginFlow(admin: boolean) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (login: string, password: string) => {
    setPending(true);
    setError("");
    try {
      const r = await post<{ ok: true; mustChangePassword: boolean }>("/auth/login", { login, password, adminArea: admin || undefined });
      await qc.invalidateQueries();
      const next = params.get("next");
      navigate(r.mustChangePassword ? "/change-password" : next && next.startsWith("/") ? next : admin ? "/admin" : "/cabinet", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось войти");
    } finally {
      setPending(false);
    }
  };
  return { submit, pending, error };
}

function LoginForm({ admin }: { admin: boolean }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const { submit, pending, error } = useLoginFlow(admin);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(login.trim(), password);
  };
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <TextInput label="Логин" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus />
      <TextInput label="Пароль" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="rounded-item border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">{error}</p>}
      <button className="btn-primary w-full py-2.5" disabled={pending || !login || !password}>
        {admin ? <ShieldCheck className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
        {pending ? "Проверяем…" : "Войти"}
      </button>
    </form>
  );
}

export function LoginPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  if (user) return <Navigate to="/cabinet" replace />;
  return (
    <AuthFrame title="Вход" subtitle="Для сотрудников, кандидатов и зарегистрированных пользователей.">
      <LoginForm admin={false} />
      <p className="mt-6 text-sm text-muted">
        {settings.registrationOpen ? <>Нет учётной записи? <Link to="/register" className="link">Зарегистрируйтесь</Link></> : "Регистрация временно закрыта."}
      </p>
    </AuthFrame>
  );
}

export function AdminLoginPage() {
  const { user, can } = useAuth();
  if (user && can("admin.access")) return <Navigate to="/admin" replace />;
  return (
    <AuthFrame admin title="Вход в админ-панель" subtitle="Доступ только для учётных записей с административными полномочиями.">
      <LoginForm admin />
      <p className="mt-6 text-sm text-muted">Попытки входа фиксируются в журнале безопасности. После 5 неудачных попыток вход блокируется на 15 минут.</p>
    </AuthFrame>
  );
}

export function RegisterPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({ login: "", nickname: "", password: "", repeat: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  if (user) return <Navigate to="/cabinet" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (v.password !== v.repeat) local.repeat = "Пароли не совпадают";
    if (v.password.length < 10) local.password = "Не короче 10 символов";
    setErrors(local);
    if (Object.keys(local).length) return;
    setPending(true);
    try {
      await post("/auth/register", { login: v.login.trim(), nickname: v.nickname.trim(), password: v.password });
      await qc.invalidateQueries();
      toast.success("Учётная запись создана. Добро пожаловать!");
      navigate("/cabinet");
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      toast.error(err);
    } finally {
      setPending(false);
    }
  };
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  return (
    <AuthFrame title="Регистрация" subtitle="После регистрации вы сможете подать анкету кандидата и писать обращения администрации.">
      {!settings.registrationOpen ? (
        <p className="text-muted">Регистрация временно закрыта администрацией.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <TextInput label="Логин" hint="Латиница, цифры, точка, дефис и подчёркивание" autoComplete="username" value={v.login} onChange={set("login")} error={errors.login} required />
          <TextInput label="Игровой ник" hint="Как в игре, например Ivan_Petrov" value={v.nickname} onChange={set("nickname")} error={errors.nickname} required />
          <TextInput label="Пароль" type="password" autoComplete="new-password" hint="Не короче 10 символов, буквы и цифры" value={v.password} onChange={set("password")} error={errors.password} required />
          <TextInput label="Повторите пароль" type="password" autoComplete="new-password" value={v.repeat} onChange={set("repeat")} error={errors.repeat} required />
          <button className="btn-primary w-full py-2.5" disabled={pending}>{pending ? "Создаём…" : "Зарегистрироваться"}</button>
          <p className="text-[12.5px] text-muted">Не используйте настоящие персональные данные — портал относится к ролевой игре.</p>
        </form>
      )}
      <p className="mt-6 text-sm text-muted">Уже есть учётная запись? <Link to="/login" className="link">Войдите</Link></p>
    </AuthFrame>
  );
}

export function ChangePasswordPage({ embedded = false }: { embedded?: boolean }) {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [v, setV] = useState({ currentPassword: "", newPassword: "", repeat: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  if (!user) return <Navigate to="/login" replace />;
  const forced = user.mustChangePassword;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (v.newPassword !== v.repeat) return setErrors({ repeat: "Пароли не совпадают" });
    setPending(true);
    setErrors({});
    try {
      await post("/auth/change-password", { currentPassword: v.currentPassword, newPassword: v.newPassword });
      toast.success("Пароль изменён. Остальные сеансы завершены.");
      await refresh();
      setV({ currentPassword: "", newPassword: "", repeat: "" });
      if (forced) navigate(user.permissions.includes("admin.access") ? "/admin" : "/cabinet", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      toast.error(err);
    } finally {
      setPending(false);
    }
  };
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const form = (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <TextInput label="Текущий пароль" type="password" autoComplete="current-password" value={v.currentPassword} onChange={set("currentPassword")} error={errors.currentPassword} required />
      <TextInput label="Новый пароль" type="password" autoComplete="new-password" hint="Не короче 10 символов, буквы и цифры" value={v.newPassword} onChange={set("newPassword")} error={errors.newPassword} required />
      <TextInput label="Повторите новый пароль" type="password" autoComplete="new-password" value={v.repeat} onChange={set("repeat")} error={errors.repeat} required />
      <button className="btn-primary w-full py-2.5" disabled={pending}>{pending ? "Сохраняем…" : "Сменить пароль"}</button>
    </form>
  );
  if (embedded) return form;
  return (
    <AuthFrame title="Смена пароля" subtitle={forced ? "Вы вошли с первоначальным паролем. Чтобы продолжить работу, задайте собственный пароль." : "Задайте новый пароль учётной записи."}>
      {form}
      {forced && <button className="btn-ghost mt-4 w-full" onClick={logout}>Выйти</button>}
    </AuthFrame>
  );
}
