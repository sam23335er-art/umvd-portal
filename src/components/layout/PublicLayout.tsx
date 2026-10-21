import { LayoutDashboard, LogIn, Menu, ShieldCheck, UserSquare2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { CursorGlow, SeasonEffects } from "../brand/Effects";
import { Emblem, Wordmark } from "../brand/Emblem";
import { PreviewBar } from "./Shell";

export function PublicLayout() {
  const { user, can } = useAuth();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const navigate = useNavigate();
  // Прокрутка к разделу главной страницы (маршрутизация через #, поэтому якоря делаем вручную)
  const goSection = (id: string) => {
    const scroll = () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    if (loc.pathname !== "/") {
      navigate("/");
      setTimeout(scroll, 150);
    } else scroll();
  };

  const links = (
    <>
      <NavLink to="/" end className={({ isActive }) => `px-3 py-2 text-sm ${isActive ? "text-ink" : "text-muted hover:text-ink"}`}>Главная</NavLink>
      <button onClick={() => goSection("divisions")} className="px-3 py-2 text-left text-sm text-muted hover:text-ink">Подразделения</button>
      <button onClick={() => goSection("news")} className="px-3 py-2 text-left text-sm text-muted hover:text-ink">Новости</button>
      <NavLink to="/apply" className={({ isActive }) => `px-3 py-2 text-sm ${isActive ? "text-ink" : "text-muted hover:text-ink"}`}>Вступить в состав</NavLink>
    </>
  );

  return (
    <div className="relative flex min-h-screen flex-col">
      <SeasonEffects />
      <CursorGlow />
      <div className="relative z-10 flex min-h-screen flex-col">
        <PreviewBar />
        <header className="sticky top-0 z-30 border-b border-line/70" style={{ background: "rgb(var(--c-bg) / 0.78)", backdropFilter: "blur(12px)" }}>
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
            <Link to="/" className="flex items-center gap-3">
              <Emblem size={32} logoUrl={settings.logoUrl} />
              <Wordmark />
            </Link>
            <nav className="ml-6 hidden flex-1 items-center md:flex" aria-label="Основная навигация">{links}</nav>
            <div className="ml-auto flex items-center gap-2">
              {user ? (
                <>
                  {can("admin.access") && <Link to="/admin" className="btn-ghost hidden sm:inline-flex"><ShieldCheck className="h-4 w-4" /> Админ-панель</Link>}
                  {can("portal.view") && <Link to="/portal" className="btn-secondary hidden sm:inline-flex"><LayoutDashboard className="h-4 w-4" /> Портал</Link>}
                  <Link to="/cabinet" className="btn-primary"><UserSquare2 className="h-4 w-4" /> Кабинет</Link>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn-ghost"><LogIn className="h-4 w-4" /> Войти</Link>
                  {settings.registrationOpen && <Link to="/register" className="btn-primary hidden sm:inline-flex">Регистрация</Link>}
                </>
              )}
              <button className="btn-ghost h-9 w-9 p-0 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Меню">
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
          {open && <nav className="flex flex-col border-t border-line px-3 py-2 md:hidden">{links}</nav>}
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
        <footer className="border-t border-line/70" style={{ background: "rgb(var(--c-bg) / 0.85)" }}>
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div className="max-w-md">
              <div className="flex items-center gap-2.5 text-ink">
                <Emblem size={24} logoUrl={settings.logoUrl} />
                <span className="font-serif font-bold">{settings.portalName}</span>
              </div>
              <p className="mt-2">
                Портал ролевого подразделения игрового проекта «Кемерово РП». Не является официальным сайтом МВД России. Все звания, приказы и документы — игровые.
              </p>
            </div>
            {settings.contacts && <p className="max-w-xs whitespace-pre-line">{settings.contacts}</p>}
          </div>
        </footer>
      </div>
    </div>
  );
}
