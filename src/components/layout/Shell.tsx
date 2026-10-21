import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell, CalendarDays, ChevronDown, ClipboardList, Eye, FileText, Gauge, History, Inbox, KeyRound, LayoutDashboard, LogOut, Megaphone,
  Menu, MessagesSquare, Network, Palette, ScrollText, Settings, Shield, ShieldCheck, UserCog, UserPlus, Users, UserSquare2, X, BookUser,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { useToast } from "../../context/ToastContext";
import { get, post, put } from "../../lib/api";
import { fmtRelative } from "../../lib/format";
import { Backdrop, CursorGlow, SeasonEffects } from "../brand/Effects";
import { Emblem } from "../brand/Emblem";
import { useConfirm } from "../ui";

type NavItem = { to: string; label: string; icon: ReactNode; perms?: string[]; end?: boolean };
type NavGroup = { title?: string; items: NavItem[] };

const i = (C: typeof Bell) => <C className="h-[18px] w-[18px]" />;

export const PORTAL_NAV: NavGroup[] = [
  {
    items: [
      { to: "/portal", label: "Главная", icon: i(LayoutDashboard), end: true },
      { to: "/portal/divisions", label: "Подразделения", icon: i(Network) },
      { to: "/portal/employees", label: "Состав сотрудников", icon: i(Users), perms: ["employees.view"] },
      { to: "/portal/orders", label: "Приказы и распоряжения", icon: i(ScrollText) },
      { to: "/portal/documents", label: "Документооборот", icon: i(FileText), perms: ["documents.create", "documents.review"] },
      { to: "/portal/hr", label: "Кадровый раздел", icon: i(BookUser), perms: ["hr.view"] },
      { to: "/portal/events", label: "Мероприятия", icon: i(CalendarDays) },
      { to: "/portal/news", label: "Новости и объявления", icon: i(Megaphone) },
      { to: "/portal/reports", label: "Отчётность", icon: i(ClipboardList), perms: ["reports.create", "reports.review"] },
      { to: "/portal/audit", label: "Журнал действий", icon: i(History), perms: ["audit.view"] },
    ],
  },
];

export const ADMIN_NAV: NavGroup[] = [
  {
    items: [
      { to: "/admin", label: "Обзор", icon: i(Gauge), end: true },
      { to: "/admin/employees", label: "Сотрудники", icon: i(Users), perms: ["employees.manage"] },
      { to: "/admin/divisions", label: "Подразделения", icon: i(Network), perms: ["divisions.manage"] },
      { to: "/admin/applications", label: "Заявки кандидатов", icon: i(UserPlus), perms: ["applications.review"] },
    ],
  },
  {
    title: "Доступ",
    items: [
      { to: "/admin/access", label: "Администраторы и доступ", icon: i(UserCog), perms: ["users.manage", "admins.manage"] },
      { to: "/admin/roles", label: "Роли и права доступа", icon: i(ShieldCheck), perms: ["roles.manage", "admins.manage"] },
    ],
  },
  {
    title: "Контент",
    items: [
      { to: "/admin/orders", label: "Приказы и распоряжения", icon: i(ScrollText), perms: ["orders.create", "orders.publish"] },
      { to: "/admin/documents", label: "Документы", icon: i(FileText), perms: ["templates.manage", "documents.review"] },
      { to: "/admin/news", label: "Новости и объявления", icon: i(Megaphone), perms: ["news.manage"] },
      { to: "/admin/events", label: "Мероприятия", icon: i(CalendarDays), perms: ["events.manage"] },
      { to: "/admin/reports", label: "Отчётность", icon: i(ClipboardList), perms: ["reports.review"] },
      { to: "/admin/appeals", label: "Обращения", icon: i(MessagesSquare), perms: ["appeals.handle"] },
    ],
  },
  {
    title: "Система",
    items: [
      { to: "/admin/audit", label: "Журнал действий", icon: i(History), perms: ["audit.view"] },
      { to: "/admin/settings", label: "Настройки портала", icon: i(Settings), perms: ["settings.manage"] },
      { to: "/admin/design", label: "Дизайн и оформление", icon: i(Palette), perms: ["design.manage"] },
      { to: "/admin/security", label: "Безопасность", icon: i(Shield), perms: ["security.manage"] },
    ],
  },
];

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hidden text-right leading-tight md:block">
      <div className="text-sm font-semibold tabular-nums text-ink">{now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</div>
      <div className="text-[12px] capitalize text-muted">{now.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}</div>
    </div>
  );
}

type Notification = { id: string; title: string; body: string; link: string | null; read: boolean; createdAt: string };

function Notifications() {
  const { user, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => get<{ items: Notification[] }>("/auth/notifications"), enabled: open });
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const unread = user?.unreadNotifications ?? 0;
  const readAll = async () => {
    await post("/auth/notifications/read-all");
    await qc.invalidateQueries({ queryKey: ["notifications"] });
    refresh();
  };
  const openItem = async (n: Notification) => {
    if (!n.read) await post(`/auth/notifications/${n.id}/read`);
    refresh();
    qc.invalidateQueries({ queryKey: ["notifications"] });
    setOpen(false);
    if (n.link) navigate(n.link);
  };
  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost relative h-9 w-9 p-0" onClick={() => setOpen((o) => !o)} aria-label={`Уведомления${unread ? `: ${unread} новых` : ""}`}>
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-bad px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="panel absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-2rem))] shadow-pop" style={{ background: "rgb(var(--c-surface))" }}>
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold">Уведомления</span>
            {unread > 0 && <button className="text-[13px] text-primary hover:underline" onClick={readAll}>Прочитать все</button>}
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {!data ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Загрузка…</p>
            ) : data.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">Новых уведомлений нет</p>
            ) : (
              data.items.map((n) => (
                <button key={n.id} onClick={() => openItem(n)} className={`block w-full border-b border-line/60 px-4 py-3 text-left hover:bg-primary/5 ${n.read ? "opacity-70" : ""}`}>
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{n.title}</p>
                      <p className="line-clamp-2 text-[13px] text-muted">{n.body}</p>
                      <p className="mt-0.5 text-[12px] text-muted/80">{fmtRelative(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ admin }: { admin: boolean }) {
  const { user, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-2 rounded-item px-1.5 py-1 hover:bg-primary/10" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">{user.nickname.slice(0, 1).toUpperCase()}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[140px] truncate text-sm font-medium text-ink">{user.nickname}</span>
          <span className="block text-[12px] text-muted">{user.roleLabel}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      {open && (
        <div className="panel absolute right-0 top-12 z-50 w-56 py-1.5 shadow-pop" style={{ background: "rgb(var(--c-surface))" }} onClick={() => setOpen(false)}>
          <Link to="/cabinet" className="flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-primary/8"><UserSquare2 className="h-4 w-4" /> Личный кабинет</Link>
          {admin && can("portal.view") && <Link to="/portal" className="flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-primary/8"><LayoutDashboard className="h-4 w-4" /> Служебный портал</Link>}
          {!admin && can("admin.access") && <Link to="/admin" className="flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-primary/8"><ShieldCheck className="h-4 w-4" /> Админ-панель</Link>}
          <Link to="/cabinet/password" className="flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-primary/8"><KeyRound className="h-4 w-4" /> Сменить пароль</Link>
          <Link to="/cabinet/appeals" className="flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-primary/8"><Inbox className="h-4 w-4" /> Мои обращения</Link>
          <div className="my-1 border-t border-line" />
          <button onClick={logout} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-bad hover:bg-bad/8"><LogOut className="h-4 w-4" /> Выйти</button>
        </div>
      )}
    </div>
  );
}

/** Полоса предпросмотра темы — видна только тому, кто включил предпросмотр. */
export function PreviewBar() {
  const { preview, setPreview, theme, globalTheme } = useSettings();
  const { can } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();
  if (!preview) return null;
  const apply = async () => {
    const ok = await confirm({
      title: "Применить тему для всех?",
      text: <>Тема «{theme.emoji} {theme.name}» заменит «{globalTheme.name}» на всех страницах сайта для всех посетителей.</>,
      confirm: "Применить тему",
    });
    if (!ok) return;
    try {
      await put("/admin/settings/theme", { theme: theme.id, confirm: true });
      await qc.invalidateQueries({ queryKey: ["public-settings"] });
      setPreview(null);
      toast.success(`Тема «${theme.name}» применена для всего сайта`);
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <div className="no-print relative z-40 flex flex-wrap items-center justify-center gap-3 border-b border-gold/40 bg-gold/15 px-4 py-2 text-sm backdrop-blur" role="status">
      <Eye className="h-4 w-4 text-gold" />
      <span className="text-ink">
        Предпросмотр темы «{theme.emoji} {theme.name}». Его видите только вы — у остальных сохраняется «{globalTheme.name}».
      </span>
      {can("design.manage") && <button className="btn-primary btn-sm" onClick={apply}>Применить тему</button>}
      <button className="btn-secondary btn-sm" onClick={() => setPreview(null)}>Выйти из предпросмотра</button>
    </div>
  );
}

export function Shell({ nav, admin = false }: { nav: NavGroup[]; admin?: boolean }) {
  const { can, logout, user } = useAuth();
  const { settings } = useSettings();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const groups = nav
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.perms || it.perms.some(can)) }))
    .filter((g) => g.items.length);

  const sidebar = (
    <nav className="flex h-full flex-col bg-side text-side-ink" aria-label={admin ? "Меню админ-панели" : "Меню портала"}>
      <Link to={admin ? "/admin" : "/portal"} className="flex items-center gap-3 px-5 pb-5 pt-5">
        <Emblem size={36} logoUrl={settings.logoUrl} />
        <div className="leading-tight">
          <div className="font-serif text-[16px] font-bold">УМВД</div>
          <div className="text-[12px] text-side-muted">{admin ? "Административная панель" : "Служебный портал"}</div>
        </div>
      </Link>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.title && <div className="mb-1.5 px-3 text-[12px] font-medium text-side-muted">{g.title}</div>}
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.end}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-item px-3 py-2 text-[14px] transition-colors ${
                        isActive ? "bg-primary/20 text-side-ink" : "text-side-ink/75 hover:bg-white/5 hover:text-side-ink"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gold" />}
                        <span className={isActive ? "text-gold" : "text-side-muted group-hover:text-side-ink"}>{it.icon}</span>
                        {it.label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-3 py-3">
        {admin ? (
          can("portal.view") && <Link to="/portal" className="flex items-center gap-3 rounded-item px-3 py-2 text-[14px] text-side-ink/75 hover:bg-white/5"><LayoutDashboard className="h-[18px] w-[18px]" /> Служебный портал</Link>
        ) : (
          can("admin.access") && <Link to="/admin" className="flex items-center gap-3 rounded-item px-3 py-2 text-[14px] text-side-ink/75 hover:bg-white/5"><ShieldCheck className="h-[18px] w-[18px]" /> Админ-панель</Link>
        )}
        <Link to="/cabinet" className="flex items-center gap-3 rounded-item px-3 py-2 text-[14px] text-side-ink/75 hover:bg-white/5"><UserSquare2 className="h-[18px] w-[18px]" /> Личный кабинет</Link>
        {admin && <button onClick={logout} className="flex w-full items-center gap-3 rounded-item px-3 py-2 text-left text-[14px] text-side-ink/75 hover:bg-white/5"><LogOut className="h-[18px] w-[18px]" /> Выход</button>}
        <p className="mt-2 px-3 text-[11.5px] leading-snug text-side-muted">Ролевой проект «Кемерово РП». Не является ресурсом МВД России.</p>
      </div>
    </nav>
  );

  return (
    <div className="relative min-h-screen">
      <Backdrop />
      <SeasonEffects />
      <CursorGlow />
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-black/20 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/55" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-pop">
            <button className="absolute right-3 top-4 z-10 text-side-ink" onClick={() => setMobileOpen(false)} aria-label="Закрыть меню"><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="relative z-10 lg:pl-64">
        <PreviewBar />
        <header className="no-print sticky top-0 z-30 border-b border-line" style={{ background: "rgb(var(--c-bg) / 0.82)", backdropFilter: "blur(12px)" }}>
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button className="btn-ghost h-9 w-9 p-0 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Открыть меню"><Menu className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1">
              <div className="truncate font-serif text-[15px] font-bold sm:text-base">{settings.portalName}</div>
              <div className="hidden truncate text-[12.5px] text-muted sm:block">{admin ? "Административная панель" : settings.subtitle}</div>
            </div>
            <Clock />
            <Notifications />
            {user && <ProfileMenu admin={admin} />}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
