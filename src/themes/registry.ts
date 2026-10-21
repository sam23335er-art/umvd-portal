import registry from "./themes.json";

export type ThemeDef = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  mode: "dark" | "light";
  effect: "leaves" | "snow" | "sun" | "petals" | "none";
  palette: string[];
};

/** Реестр тем (src/themes/themes.json). */
export const THEMES = registry.themes as ThemeDef[];
export const DEFAULT_THEME = registry.defaultTheme;
export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME)!;
