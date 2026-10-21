import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CHANGE_EVENT, get, getMode, type Mode } from "../lib/api";
import { reloadLocal, SESSION_KEY, STORAGE_KEY } from "../local";
import { DEFAULT_THEME, themeById, THEMES, type ThemeDef } from "../themes/registry";

export type PortalSettings = {
  portalName: string;
  subtitle: string;
  description: string;
  contacts: string;
  logoUrl: string | null;
  activeTheme: string;
  effectsEnabled: boolean;
  cursorGlow: boolean;
  themeBackgrounds: Record<string, string>;
  address: { title: string; body: string; author: string; updatedAt: string } | null;
  registrationOpen: boolean;
  applicationsOpen: boolean;
  version: number;
};

// Безопасные значения, если настройки не загрузились
const FALLBACK: PortalSettings = {
  portalName: "УМВД | Служебный портал",
  subtitle: "Единая система управления и координации подразделений",
  description: "",
  contacts: "",
  logoUrl: null,
  activeTheme: DEFAULT_THEME,
  effectsEnabled: true,
  cursorGlow: true,
  themeBackgrounds: {},
  address: null,
  registrationOpen: true,
  applicationsOpen: true,
  version: 0,
};

type Ctx = {
  settings: PortalSettings;
  loaded: boolean;
  /** Тема, которая сейчас отображается (с учётом локального предпросмотра). */
  theme: ThemeDef;
  /** Глобальная тема, сохранённая на сервере. */
  globalTheme: ThemeDef;
  preview: string | null;
  setPreview: (id: string | null) => void;
  /** server — общая база на Vercel, local — данные в этом браузере. */
  mode: Mode;
  themes: ThemeDef[];
};

const SettingsContext = createContext<Ctx | null>(null);
let modeRef: Mode = "local";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isSuccess } = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => get<{ settings: PortalSettings }>("/public/settings"),
    refetchOnWindowFocus: true,
    // На сервере тему могут сменить другие администраторы — перепроверяем каждые 20 секунд
    refetchInterval: () => (modeRef === "server" ? 20_000 : false),
    retry: 2,
  });
  const [mode, setMode] = useState<Mode>("local");
  useEffect(() => {
    getMode().then((m) => {
      modeRef = m;
      setMode(m);
    });
  }, []);
  // Предпросмотр хранится только в памяти вкладки — другим пользователям он не виден.
  const [preview, setPreview] = useState<string | null>(null);

  // Синхронизация: в этой вкладке — по событию хранилища, в других вкладках — по событию storage.
  useEffect(() => {
    const onLocal = (e: Event) => {
      if ((e as CustomEvent<{ settings: boolean }>).detail?.settings) qc.invalidateQueries({ queryKey: ["public-settings"] });
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY && e.key !== SESSION_KEY) return;
      reloadLocal();
      qc.invalidateQueries(); // данные изменили в другой вкладке — перечитываем всё
    };
    window.addEventListener(CHANGE_EVENT, onLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onLocal);
      window.removeEventListener("storage", onStorage);
    };
  }, [qc]);

  const settings = data?.settings ?? FALLBACK;
  const globalTheme = themeById(settings.activeTheme);
  const theme = preview ? themeById(preview) : globalTheme;

  useEffect(() => {
    document.documentElement.dataset.theme = theme.id;
    document.documentElement.style.colorScheme = theme.mode;
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--glow-on", settings.cursorGlow ? "1" : "0");
  }, [settings.cursorGlow]);

  const value = useMemo(
    () => ({ settings, loaded: isSuccess, theme, globalTheme, preview, setPreview, themes: THEMES, mode }),
    [settings, isSuccess, theme, globalTheme, preview, mode],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings вне SettingsProvider");
  return ctx;
}
