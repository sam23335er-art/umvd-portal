import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Megaphone, Network, Pin, Users } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CityScape } from "../../components/brand/CityScape";
import { Emblem } from "../../components/brand/Emblem";
import { Badge, DemoBadge, DictBadge, Loading } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { get } from "../../lib/api";
import { fmtLong } from "../../lib/format";
import { DIVISION_STATUS, NEWS_CATEGORY } from "../../lib/labels";

type HomeData = {
  news: { id: string; title: string; body: string; category: string; pinned: boolean; createdAt: string; isDemo: boolean; author: { nickname: string } | null }[];
  divisions: { id: string; code: string; name: string; shortName: string; description: string; status: string; _count: { employees: number } }[];
  stats: { employees: number; divisions: number; upcomingEvents: number };
};

export function HomePage() {
  const { settings, theme } = useSettings();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["public-home"], queryFn: () => get<HomeData>("/public/home") });
  const photo = settings.themeBackgrounds?.[theme.id];
  useEffect(() => {
    document.title = `${settings.portalName} — Кемерово RP`;
  }, [settings.portalName]);

  return (
    <>
      {/* ── Герой: панорама Кемерово в цветах текущего сезона ── */}
      <section className="relative isolate overflow-hidden border-b border-line/60">
        <div className="absolute inset-0 -z-10">
          {photo ? <img src={photo} alt="Кемерово RP" className="h-full w-full object-cover" /> : <CityScape season={theme.id} className="h-full w-full" />}
          <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgb(var(--c-bg) / 0.92) 0%, rgb(var(--c-bg) / 0.72) 45%, rgb(var(--c-bg) / 0.05) 100%)" }} />
          <div className="absolute inset-x-0 bottom-0 h-24" style={{ background: "linear-gradient(transparent, rgb(var(--c-bg)))" }} />
        </div>
        <div className="mx-auto flex min-h-[560px] max-w-6xl flex-col justify-center px-4 py-20 sm:px-6 md:min-h-[640px]">
          <div className="max-w-2xl">
            <div className="mb-6 flex items-center gap-3">
              <Emblem size={56} logoUrl={settings.logoUrl} />
              <div className="text-sm leading-snug text-muted">
                Игровое подразделение
                <br />
                <span className="text-ink">проекта «Кемерово РП»</span>
              </div>
            </div>
            <h1 className="font-serif text-[2.6rem] font-bold leading-[1.08] tracking-tight sm:text-[3.6rem]">Служебный портал УМВД</h1>
            <p className="mt-5 max-w-xl text-lg text-muted">{settings.subtitle}. Приказы, документы, кадры и расписание — в одном месте для всего личного состава.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {user ? (
                <Link to="/cabinet" className="btn-primary px-5 py-2.5 text-[15px]">Перейти в личный кабинет</Link>
              ) : (
                <>
                  <Link to="/apply" className="btn-primary px-5 py-2.5 text-[15px]">Подать заявку на вступление</Link>
                  <Link to="/login" className="btn-secondary px-5 py-2.5 text-[15px]">Вход для сотрудников</Link>
                </>
              )}
            </div>
          </div>
          {data && (
            <dl className="mt-14 grid max-w-xl grid-cols-3 gap-6 border-t border-line/70 pt-6">
              <div>
                <dt className="text-[13px] text-muted">Сотрудников в строю</dt>
                <dd className="mt-1 font-serif text-3xl font-bold">{data.stats.employees}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted">Подразделений</dt>
                <dd className="mt-1 font-serif text-3xl font-bold">{data.stats.divisions}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted">Ближайших мероприятий</dt>
                <dd className="mt-1 font-serif text-3xl font-bold">{data.stats.upcomingEvents}</dd>
              </div>
            </dl>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-16 px-4 py-14 sm:px-6">
        {/* ── Обращение администрации ── */}
        {settings.address && (
          <section aria-labelledby="address-title" className="panel glow overflow-hidden">
            <div className="relative z-[1] grid gap-6 p-6 sm:p-8 md:grid-cols-[220px_1fr]">
              <div className="border-l-[3px] border-gold pl-4">
                <h2 id="address-title" className="font-serif text-xl font-bold">{settings.address.title || "Обращение администрации"}</h2>
                <p className="mt-1 text-sm text-muted">{fmtLong(settings.address.updatedAt)}</p>
              </div>
              <div>
                <p className="whitespace-pre-line font-serif text-[17px] leading-[1.75] text-ink">{settings.address.body}</p>
                {settings.address.author && <p className="mt-4 text-right font-serif italic text-muted">{settings.address.author}</p>}
              </div>
            </div>
          </section>
        )}

        {/* ── Подразделения ── */}
        <section id="divisions" aria-labelledby="div-title" className="scroll-mt-24">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 id="div-title" className="font-serif text-[1.75rem] font-bold">Подразделения</h2>
              <p className="mt-1 max-w-2xl text-muted">Структура игрового УМВД. Полномочия подразделений определены правилами проекта и не повторяют реальный территориальный орган.</p>
            </div>
            <Network className="hidden h-8 w-8 text-muted/60 sm:block" />
          </div>
          {isLoading ? (
            <Loading />
          ) : (
            <div className="grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {data?.divisions.map((d) => (
                <article key={d.id} className="bg-surface p-5 transition-colors hover:bg-surface2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-serif text-2xl font-bold text-primary">{d.shortName}</p>
                      <h3 className="mt-0.5 font-medium">{d.name}</h3>
                    </div>
                    <DictBadge dict={DIVISION_STATUS} value={d.status} />
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm text-muted">{d.description}</p>
                  <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
                    <Users className="h-3.5 w-3.5" /> {d._count.employees} в составе
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* ── Новости ── */}
        <section id="news" aria-labelledby="news-title" className="scroll-mt-24">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 id="news-title" className="font-serif text-[1.75rem] font-bold">Новости и объявления</h2>
            <Megaphone className="hidden h-8 w-8 text-muted/60 sm:block" />
          </div>
          {data && data.news.length === 0 && <p className="text-muted">Публичных новостей пока нет.</p>}
          <div className="grid gap-5 md:grid-cols-2">
            {data?.news.map((n, idx) => (
              <article key={n.id} className={`panel glow p-5 ${idx === 0 ? "md:col-span-2" : ""}`}>
                <div className="relative z-[1]">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                    <DictBadge dict={NEWS_CATEGORY} value={n.category} />
                    {n.pinned && <Badge tone="gold"><Pin className="h-3 w-3" /> Закреплено</Badge>}
                    {n.isDemo && <DemoBadge />}
                    <span>{fmtLong(n.createdAt)}</span>
                  </div>
                  <h3 className={`mt-3 font-serif font-bold ${idx === 0 ? "text-2xl" : "text-lg"}`}>{n.title}</h3>
                  <p className={`mt-2 text-muted ${idx === 0 ? "" : "line-clamp-4 text-sm"}`}>{n.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── Вступление ── */}
        <section className="grid items-center gap-8 rounded-panel border border-line p-6 sm:p-10 md:grid-cols-[1fr_auto]" style={{ background: "linear-gradient(120deg, rgb(var(--c-primary) / 0.14), rgb(var(--c-surface) / 0.7))" }}>
          <div>
            <h2 className="font-serif text-2xl font-bold">Хотите служить в УМВД Кемерово RP?</h2>
            <p className="mt-2 max-w-2xl text-muted">
              Зарегистрируйтесь, заполните анкету кандидата и дождитесь приглашения на собеседование. Решение по заявке придёт уведомлением в личный кабинет.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/apply" className="btn-primary px-5 py-2.5"><CalendarDays className="h-4 w-4" /> Заполнить анкету</Link>
          </div>
        </section>
      </div>
    </>
  );
}
