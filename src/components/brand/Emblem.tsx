/**
 * Собственная нейтральная эмблема проекта: щит, лента и звезда.
 * Не копирует государственную символику. Цвета берутся из темы.
 */
export function Emblem({ size = 40, className = "", logoUrl }: { size?: number; className?: string; logoUrl?: string | null }) {
  if (logoUrl) return <img src={logoUrl} alt="Эмблема УМВД | Кемерово RP" width={size} height={size} className={`object-contain ${className}`} />;
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 100 115" className={className} role="img" aria-label="Эмблема УМВД | Кемерово RP">
      <defs>
        <linearGradient id="em-field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(var(--c-primary))" stopOpacity="0.95" />
          <stop offset="1" stopColor="rgb(var(--c-sidebar))" />
        </linearGradient>
      </defs>
      <path d="M50 3 L93 16 V54 C93 82 74 101 50 112 C26 101 7 82 7 54 V16 Z" fill="rgb(var(--c-gold))" />
      <path d="M50 9.5 L87 20.6 V54 C87 78.5 70.8 95.4 50 105.4 C29.2 95.4 13 78.5 13 54 V20.6 Z" fill="url(#em-field)" />
      {/* шеврон — символ службы */}
      <path d="M22 72 L50 88 L78 72 V80 L50 96 L22 80 Z" fill="rgb(var(--c-gold))" opacity="0.9" />
      {/* звезда */}
      <path d="M50 24 L55.3 38.6 L70.9 39.1 L58.6 48.6 L63 63.5 L50 54.8 L37 63.5 L41.4 48.6 L29.1 39.1 L44.7 38.6 Z" fill="rgb(var(--c-gold))" />
      <circle cx="50" cy="45" r="4.2" fill="rgb(var(--c-sidebar))" />
    </svg>
  );
}

export function Wordmark({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <div className="leading-tight">
      <div className={`font-serif text-[17px] font-bold tracking-wide ${light ? "text-side-ink" : "text-ink"}`}>УМВД</div>
      {!compact && <div className={`text-[11.5px] ${light ? "text-side-muted" : "text-muted"}`}>Кемерово RP · ролевой проект</div>}
    </div>
  );
}
