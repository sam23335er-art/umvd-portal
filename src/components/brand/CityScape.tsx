import { useId, useMemo } from "react";

/**
 * Иллюстрированная панорама игрового Кемерово: Томь, мост, телебашня, купола собора,
 * трубы промзоны. Все цвета — переменные темы, поэтому вид меняется вместе с сезоном.
 * Сезонные детали (снег на крышах, кроны деревьев, солнце/луна) зависят от темы.
 */
type Props = { season: string; className?: string };

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const C = (name: string, a = 1) => `rgb(var(--c-${name}) / ${a})`;

export function CityScape({ season, className = "" }: Props) {
  // уникальные id градиентов: на странице может быть несколько панорам разных тем
  const uid = useId().replace(/:/g, "");
  const { buildings, windows, trees } = useMemo(() => {
    const r = rng(42);
    const b: { x: number; w: number; h: number }[] = [];
    let x = 0;
    while (x < 1600) {
      const w = 26 + Math.floor(r() * 46);
      const center = Math.abs(x - 820) < 420;
      const h = (center ? 70 : 40) + Math.floor(r() * (center ? 120 : 70));
      if (!(x > 560 && x < 640) && !(x > 1010 && x < 1060)) b.push({ x, w, h });
      x += w + 2 + Math.floor(r() * 6);
    }
    const win: { x: number; y: number }[] = [];
    for (const bd of b) {
      for (let wy = 392 - bd.h + 10; wy < 382; wy += 12) {
        for (let wx = bd.x + 5; wx < bd.x + bd.w - 6; wx += 9) if (r() > 0.62) win.push({ x: wx, y: wy });
      }
    }
    const t: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < 46; i++) t.push({ x: Math.floor(r() * 1600), y: 520 + Math.floor(r() * 50), r: 14 + Math.floor(r() * 18) });
    return { buildings: b, windows: win, trees: t.sort((a, z) => a.y - z.y) };
  }, []);

  const winter = season === "winter";
  const autumn = season === "autumn";
  const night = winter || autumn;

  return (
    <svg viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`cs-sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C("sky-top")} />
          <stop offset="1" stopColor={C("sky-bottom")} />
        </linearGradient>
        <linearGradient id={`cs-water-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C("water", 0.95)} />
          <stop offset="1" stopColor={C("city", 0.9)} />
        </linearGradient>
        <radialGradient id={`cs-sun-${uid}`}>
          <stop offset="0" stopColor={night ? C("glow", 0.9) : "rgb(255 240 190 / 0.95)"} />
          <stop offset="0.35" stopColor={night ? C("glow", 0.35) : "rgb(255 240 190 / 0.4)"} />
          <stop offset="1" stopColor={night ? C("glow", 0) : "rgb(255 240 190 / 0)"} />
        </radialGradient>
      </defs>

      <rect width="1600" height="600" fill={`url(#cs-sky-${uid})`} />

      {/* Солнце / луна */}
      <circle cx={autumn ? 1180 : winter ? 1260 : 1320} cy={autumn ? 300 : winter ? 120 : 110} r="190" fill={`url(#cs-sun-${uid})`} />
      <circle cx={autumn ? 1180 : winter ? 1260 : 1320} cy={autumn ? 300 : winter ? 120 : 110} r={winter ? 26 : 38} fill={winter ? "rgb(236 244 255)" : autumn ? "rgb(255 190 110)" : "rgb(255 238 180)"} />

      {/* Дальние холмы правого берега */}
      <path d="M0 330 C180 290 320 310 480 285 C640 262 760 300 920 280 C1100 258 1260 300 1420 276 C1500 266 1560 280 1600 284 V420 H0 Z" fill={C("far", 0.85)} />
      {winter && <path d="M0 330 C180 290 320 310 480 285 C640 262 760 300 920 280 C1100 258 1260 300 1420 276 C1500 266 1560 280 1600 284 V296 C1450 290 1300 310 1100 272 C900 300 700 278 480 297 C300 318 150 300 0 342 Z" fill="rgb(240 246 255 / 0.55)" />}

      {/* Трубы промзоны с дымом */}
      {[150, 190, 1460].map((x, i) => (
        <g key={x}>
          <rect x={x} y={250 - i * 6} width="11" height="150" fill={C("city")} />
          <rect x={x} y={262 - i * 6} width="11" height="5" fill={C("bad", 0.7)} />
          <ellipse cx={x + 22} cy={232 - i * 6} rx="30" ry="12" fill={night ? "rgb(200 200 210 / 0.18)" : "rgb(255 255 255 / 0.45)"} />
          <ellipse cx={x + 54} cy={218 - i * 6} rx="40" ry="14" fill={night ? "rgb(200 200 210 / 0.12)" : "rgb(255 255 255 / 0.3)"} />
        </g>
      ))}

      {/* Городские кварталы */}
      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={392 - b.h} width={b.w} height={b.h + 8} fill={C("city")} />
          {winter && <rect x={b.x - 1} y={392 - b.h - 3} width={b.w + 2} height="5" rx="2" fill="rgb(240 246 255 / 0.9)" />}
        </g>
      ))}
      {windows.map((w, i) => (
        <rect key={i} x={w.x} y={w.y} width="4" height="5" fill={C("window", night ? 0.85 : 0.35)} />
      ))}

      {/* Телебашня */}
      <g fill={C("city")}>
        <path d="M596 392 L604 140 L612 392 Z" />
        <rect x="598" y="190" width="12" height="16" rx="2" />
        <rect x="603" y="96" width="2.5" height="46" />
        <circle cx="604.3" cy="94" r="3" fill={C("bad", 0.9)} />
      </g>

      {/* Собор с куполами */}
      <g>
        <rect x="1012" y="300" width="44" height="92" fill={C("city")} />
        <rect x="1024" y="260" width="20" height="42" fill={C("city")} />
        <path d="M1024 262 C1024 236 1044 236 1044 262 Z" fill={C("gold")} />
        <rect x="1033" y="222" width="2" height="16" fill={C("gold")} />
        <path d="M1010 302 C1010 288 1022 288 1022 302 Z" fill={C("gold")} />
        <path d="M1046 302 C1046 288 1058 288 1058 302 Z" fill={C("gold")} />
        {winter && <path d="M1024 262 C1026 246 1042 246 1044 262 C1038 254 1030 254 1024 262Z" fill="rgb(245 250 255 / 0.9)" />}
      </g>

      {/* Набережная */}
      <rect x="0" y="392" width="1600" height="14" fill={C("city")} />
      {winter && <rect x="0" y="390" width="1600" height="5" fill="rgb(240 246 255 / 0.85)" />}

      {/* Река Томь */}
      <rect x="0" y="406" width="1600" height="104" fill={`url(#cs-water-${uid})`} />
      {winter
        ? <rect x="0" y="406" width="1600" height="104" fill="rgb(225 238 252 / 0.5)" />
        : Array.from({ length: 22 }).map((_, i) => (
            <rect key={i} x={(i * 173) % 1600} y={420 + ((i * 37) % 80)} width={60 + ((i * 53) % 90)} height="2" rx="1" fill={C("glow", 0.25)} />
          ))}
      {/* отражение огней */}
      {night && !winter && windows.filter((_, i) => i % 9 === 0).map((w, i) => (
        <rect key={i} x={w.x} y={420 + ((i * 13) % 70)} width="3" height="8" fill={C("window", 0.25)} />
      ))}

      {/* Мост через Томь */}
      <g>
        <rect x="260" y="436" width="1080" height="9" fill={C("city")} />
        {[300, 440, 580, 720, 860, 1000, 1140, 1280].map((x) => (
          <g key={x}>
            <rect x={x} y="445" width="10" height="65" fill={C("city")} />
            <path d={`M${x - 65} 445 Q ${x - 65 + 70} 470 ${x + 75} 445`} fill="none" stroke={C("city")} strokeWidth="4" />
          </g>
        ))}
        {Array.from({ length: 28 }).map((_, i) => (
          <circle key={i} cx={270 + i * 39} cy="432" r="1.8" fill={C("window", night ? 1 : 0.6)} />
        ))}
        <path d="M200 520 L260 440 L275 440 L235 520 Z" fill={C("city")} />
        <path d="M1340 440 L1355 440 L1420 520 L1395 520 Z" fill={C("city")} />
      </g>

      {/* Ближний берег */}
      <path d="M0 505 C200 492 420 512 640 500 C860 488 1080 510 1300 498 C1440 490 1540 500 1600 496 V600 H0 Z" fill={C("ground")} />
      {trees.map((t, i) => (
        <g key={i}>
          <rect x={t.x - 2} y={t.y - 4} width="4" height="22" fill={C("city", 0.85)} />
          <circle cx={t.x} cy={t.y - t.r * 0.6} r={t.r} fill={C("foliage", winter ? 0.95 : 0.9)} />
          {autumn && i % 3 === 0 && <circle cx={t.x + t.r * 0.5} cy={t.y - t.r * 0.9} r={t.r * 0.55} fill={C("accent", 0.9)} />}
          {season === "spring" && i % 4 === 0 && <circle cx={t.x - t.r * 0.4} cy={t.y - t.r} r={t.r * 0.35} fill="rgb(248 214 226 / 0.95)" />}
        </g>
      ))}
    </svg>
  );
}
