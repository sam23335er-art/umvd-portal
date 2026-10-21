import { useEffect, useRef } from "react";
import { useSettings } from "../../context/SettingsContext";
import { CityScape } from "./CityScape";

/**
 * Сезонные частицы (снег, листья, лепестки, солнечные блики).
 * Холст лежит ПОД содержимым и не перехватывает клики: текст, формы и кнопки не перекрываются.
 * Отключается настройкой портала, при prefers-reduced-motion и на скрытой вкладке.
 */
export function SeasonEffects() {
  const { theme, settings } = useSettings();
  const ref = useRef<HTMLCanvasElement>(null);
  const effect = settings.effectsEnabled ? theme.effect : "none";

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || effect === "none") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0, h = 0;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Цвета берём из реестра темы (а не из CSS), чтобы не зависеть от порядка применения data-theme.
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(",");
    const leafColors = theme.palette.slice(2, 5).map(hex);
    const glow = theme.effect === "sun" ? "255,236,170" : hex(theme.palette[3]);

    const count = effect === "snow" ? Math.min(110, Math.floor(w / 13)) : effect === "sun" ? 26 : 28;
    type P = { x: number; y: number; r: number; vx: number; vy: number; a: number; rot: number; vr: number; phase: number; c: string };
    const make = (initial: boolean): P => ({
      x: Math.random() * w,
      y: initial ? Math.random() * h : effect === "sun" ? h + 20 : -20,
      r: effect === "snow" ? 1 + Math.random() * 2.6 : effect === "sun" ? 20 + Math.random() * 60 : 4 + Math.random() * 5,
      vx: (Math.random() - 0.5) * 0.4,
      vy: effect === "snow" ? 0.35 + Math.random() * 0.8 : effect === "sun" ? -(0.08 + Math.random() * 0.15) : 0.5 + Math.random() * 0.7,
      a: effect === "sun" ? 0.04 + Math.random() * 0.06 : 0.45 + Math.random() * 0.45,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.03,
      phase: Math.random() * Math.PI * 2,
      c: leafColors[Math.floor(Math.random() * leafColors.length)],
    });
    const ps = Array.from({ length: count }, () => make(true));

    let raf = 0, t = 0;
    const draw = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.x += p.vx + Math.sin(t * 0.01 + p.phase) * (effect === "snow" ? 0.3 : 0.8);
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > h + 30 || p.y < -100 || p.x < -60 || p.x > w + 60) ps[i] = make(false);
        if (effect === "snow") {
          ctx.fillStyle = `rgba(255,255,255,${p.a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else if (effect === "sun") {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          g.addColorStop(0, `rgba(${glow},${p.a})`);
          g.addColorStop(1, `rgba(${glow},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.abs(Math.sin(t * 0.03 + p.phase)) * 0.6 + 0.4);
          ctx.fillStyle = effect === "petals" ? `rgba(250,${215 + Math.floor(p.phase * 4)},228,${p.a})` : `rgba(${p.c},${p.a})`;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          if (effect === "leaves") {
            ctx.strokeStyle = `rgba(0,0,0,${p.a * 0.25})`;
            ctx.beginPath();
            ctx.moveTo(-p.r, 0);
            ctx.lineTo(p.r, 0);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      ctx.clearRect(0, 0, w, h);
    };
  }, [effect, theme]);

  if (effect === "none") return null;
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-80" aria-hidden="true" />;
}

/**
 * Свечение за курсором мыши. Цвет — токен --c-glow текущей темы,
 * поэтому при смене темы меняется и свечение. Координаты используются
 * также рамками панелей (.glow). На сенсорных экранах не показывается.
 */
export function CursorGlow() {
  const { settings } = useSettings();
  useEffect(() => {
    if (!settings.cursorGlow || window.matchMedia("(pointer: coarse)").matches) return;
    const root = document.documentElement;
    let raf = 0, x = -999, y = -999;
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(() => {
        root.style.setProperty("--mx", `${x}px`);
        root.style.setProperty("--my", `${y}px`);
        raf = 0;
      });
    };
    const onLeave = () => {
      root.style.setProperty("--mx", "-999px");
      root.style.setProperty("--my", "-999px");
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
      onLeave();
    };
  }, [settings.cursorGlow]);

  if (!settings.cursorGlow) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 hidden [@media(pointer:fine)]:block"
      style={{ background: "radial-gradient(560px circle at var(--mx, -999px) var(--my, -999px), rgb(var(--c-glow) / 0.13), transparent 60%)" }}
    />
  );
}

/** Фон страниц портала: панорама или загруженный администратором снимок Кемерово RP. */
export function Backdrop({ strong = false }: { strong?: boolean }) {
  const { theme, settings } = useSettings();
  const photo = settings.themeBackgrounds?.[theme.id];
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {photo ? (
        <img src={photo} alt="" className={`absolute inset-0 h-full w-full object-cover ${strong ? "opacity-60" : "opacity-[0.16]"}`} />
      ) : (
        <BackdropScape strong={strong} season={theme.id} />
      )}
      <div className="absolute inset-0" style={{ background: strong ? "linear-gradient(180deg, rgb(var(--c-bg) / 0.35), rgb(var(--c-bg) / 0.92) 75%)" : "linear-gradient(180deg, rgb(var(--c-bg)) 30%, rgb(var(--c-bg) / 0.6))" }} />
    </div>
  );
}

function BackdropScape({ strong, season }: { strong: boolean; season: string }) {
  return <CityScape season={season} className={`absolute bottom-0 left-0 h-[70vh] w-full ${strong ? "opacity-100" : "opacity-[0.22]"}`} />;
}
