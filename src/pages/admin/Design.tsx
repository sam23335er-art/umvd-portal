import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, ImagePlus, Paintbrush, Trash2 } from "lucide-react";
import { useRef } from "react";
import { CityScape } from "../../components/brand/CityScape";
import { Badge, Checkbox, ErrorState, Loading, PageHeader, Panel, useConfirm } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { useToast } from "../../context/ToastContext";
import { api, del, get, patch, put } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { useAction } from "../../lib/hooks";
import type { ThemeDef } from "../../themes/registry";

type AdminSettings = { activeTheme: string; effectsEnabled: boolean; cursorGlow: boolean; themeBackgrounds: Record<string, string>; updatedAt: string; updatedBy: string | null };

/** Миниатюра темы: применяет токены темы только к своему блоку через data-theme. */
function ThemeThumb({ theme, bg }: { theme: ThemeDef; bg?: string }) {
  return (
    <div data-theme={theme.id} className="relative h-40 overflow-hidden rounded-t-panel" style={{ background: "rgb(var(--c-bg))" }}>
      {bg ? <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" /> : <CityScape season={theme.id} className="absolute inset-0 h-full w-full" />}
      <div className="absolute inset-y-3 left-3 w-14 rounded-md" style={{ background: "rgb(var(--c-sidebar) / 0.95)" }}>
        <div className="mx-2 mt-3 h-1.5 rounded-full" style={{ background: "rgb(var(--c-gold))" }} />
        {[0, 1, 2, 3].map((i) => <div key={i} className="mx-2 mt-2 h-1 rounded-full" style={{ background: `rgb(var(--c-sidebar-text) / ${i === 0 ? 0.8 : 0.35})` }} />)}
      </div>
      <div className="absolute right-3 top-3 w-[55%] rounded-md p-2.5 shadow-lg" style={{ background: "rgb(var(--c-surface) / 0.95)", border: "1px solid rgb(var(--c-border))" }}>
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: "rgb(var(--c-text) / 0.8)" }} />
        <div className="mt-1.5 h-1 w-full rounded-full" style={{ background: "rgb(var(--c-muted) / 0.5)" }} />
        <div className="mt-1 h-1 w-4/5 rounded-full" style={{ background: "rgb(var(--c-muted) / 0.5)" }} />
        <div className="mt-2.5 h-3.5 w-14 rounded" style={{ background: "rgb(var(--c-primary))" }} />
      </div>
    </div>
  );
}

export function DesignPage() {
  const { can } = useAuth();
  const { themes, globalTheme, preview, setPreview } = useSettings();
  const confirm = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["admin-settings"], queryFn: () => get<{ settings: AdminSettings }>("/admin/settings") });
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string>("");
  const invalidate = [["admin-settings"], ["public-settings"]];
  const effects = useAction((body: Partial<AdminSettings>) => patch("/admin/settings/effects", body), { success: "Эффекты оформления сохранены", invalidate });
  const removeBg = useAction((id: string) => del(`/admin/settings/backgrounds/${id}`), { success: "Восстановлен стандартный фон", invalidate });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const s = data.settings;

  const apply = async (t: ThemeDef) => {
    const ok = await confirm({
      title: `Применить тему «${t.name}»?`,
      text: <>Оформление сменится на всех страницах сайта для всех посетителей: публичные разделы, регистрация, кабинеты, портал и админ-панель. Сейчас активна тема «{globalTheme.emoji} {globalTheme.name}».</>,
      confirm: "Применить тему",
    });
    if (!ok) return;
    try {
      await put("/admin/settings/theme", { theme: t.id, confirm: true });
      setPreview(null);
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));
      toast.success(`Тема «${t.name}» применена для всего сайта`);
    } catch (e) {
      toast.error(e);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const form = new FormData();
    form.append("file", f);
    try {
      await api(`/admin/settings/backgrounds/${uploadFor.current}`, { method: "POST", form });
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));
      toast.success("Фон темы загружен");
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      <PageHeader
        title="Дизайн и оформление"
        description={<>Глобальная тема меняет дизайн всего сайта. Предпросмотр видите только вы. Последнее изменение: {fmtDateTime(s.updatedAt)}{s.updatedBy && `, ${s.updatedBy}`}.</>}
      />
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {themes.map((t) => {
          const active = t.id === s.activeTheme;
          const previewing = preview === t.id;
          const bg = s.themeBackgrounds[t.id];
          return (
            <article key={t.id} className={`panel flex flex-col overflow-hidden ${active ? "ring-2 ring-gold" : ""}`}>
              <ThemeThumb theme={t} bg={bg} />
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-serif text-xl font-bold">{t.emoji} {t.name}</h2>
                  {active ? <Badge tone="gold"><Check className="h-3 w-3" /> Активна</Badge> : previewing ? <Badge tone="info">Предпросмотр</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-muted">{t.description}</p>
                <div className="mt-3 flex overflow-hidden rounded-md border border-line" aria-label="Палитра">
                  {t.palette.map((c) => <span key={c} className="h-6 flex-1" style={{ background: c }} title={c} />)}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                  <span>{t.mode === "dark" ? "Тёмная основа" : "Светлая основа"}</span>
                  <span>· эффект: {{ leaves: "листопад", snow: "снегопад", sun: "блики", petals: "лепестки", none: "нет" }[t.effect]}</span>
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <button className="btn-secondary btn-sm" onClick={() => setPreview(previewing ? null : t.id)} disabled={active && !preview}>
                    <Eye className="h-4 w-4" /> {previewing ? "Выйти из предпросмотра" : "Предпросмотр"}
                  </button>
                  <button className="btn-primary btn-sm" disabled={active || !can("design.manage")} onClick={() => apply(t)}><Paintbrush className="h-4 w-4" /> Применить тему</button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                  <button className="btn-ghost btn-sm" onClick={() => { uploadFor.current = t.id; fileRef.current?.click(); }}><ImagePlus className="h-4 w-4" /> {bg ? "Заменить фон" : "Свой фон"}</button>
                  {bg && <button className="btn-ghost btn-sm text-bad" onClick={async () => (await confirm({ title: "Удалить загруженный фон?", text: "Тема вернётся к стандартной панораме Кемерово.", danger: true, confirm: "Удалить" })) && removeBg.run(t.id)}><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Эффекты">
          <div className="space-y-4">
            <Checkbox checked={s.effectsEnabled} onChange={(v) => effects.run({ effectsEnabled: v })} label="Сезонные частицы" hint="Снегопад, листопад, лепестки или блики — по теме. Лежат под содержимым и не мешают работе; отключаются у посетителей с настройкой «уменьшить движение»." />
            <Checkbox checked={s.cursorGlow} onChange={(v) => effects.run({ cursorGlow: v })} label="Свечение курсора" hint="Мягкий свет за указателем мыши и подсветка рамок панелей. Цвет свечения меняется вместе с темой. На сенсорных экранах не показывается." />
          </div>
        </Panel>
        <Panel title="Фоны тем: снимки Кемерово RP">
          <p className="text-sm text-muted">
            По умолчанию каждая тема использует иллюстрированную панораму Кемерово (Томь, мост, телебашня, собор) в сезонных цветах. Можно загрузить собственный скриншот из игры
            для каждой темы — PNG, JPEG или WebP до 8 МБ (сжимается автоматически). Он появится на главной странице, страницах входа и фоном портала.
          </p>
        </Panel>
      </div>
    </>
  );
}
