/** Все цвета берутся из CSS-переменных темы (src/styles/themes.css). */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        surface2: v("surface-2"),
        line: v("border"),
        ink: v("text"),
        muted: v("muted"),
        primary: v("primary"),
        "primary-fg": v("primary-fg"),
        accent: v("accent"),
        gold: v("gold"),
        side: v("sidebar"),
        "side-ink": v("sidebar-text"),
        "side-muted": v("sidebar-muted"),
        ok: v("success"),
        warn: v("warning"),
        bad: v("danger"),
        info: v("info"),
      },
      fontFamily: {
        sans: ['"Golos Text"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        serif: ['"PT Serif"', "Georgia", "Times New Roman", "serif"],
      },
      opacity: { 8: "0.08", 12: "0.12", 35: "0.35", 45: "0.45", 55: "0.55", 65: "0.65", 85: "0.85" },
      borderRadius: { panel: "10px", item: "6px" },
      boxShadow: {
        panel: "0 1px 0 rgb(var(--c-border) / 0.6), 0 8px 24px -12px rgb(var(--c-shadow) / 0.35)",
        pop: "0 20px 50px -12px rgb(var(--c-shadow) / 0.55)",
      },
    },
  },
  plugins: [],
};
