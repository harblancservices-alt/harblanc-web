import Link from "next/link";

export type CounterTileData = {
  key: string;
  label: string;
  value: number;
  href: string;
  /** Number color tone — matches /crm-design's KpiTile exactly (the number
   * itself carries the color, no separate top accent rule). */
  tone: "danger" | "accent" | "success" | "warning" | "admin" | "neutral";
};

const TONE_TEXT: Record<CounterTileData["tone"], string> = {
  danger: "text-bad",
  accent: "text-accent",
  success: "text-ok",
  warning: "text-warn",
  admin: "text-admin",
  neutral: "text-fg",
};

/**
 * KPI tiles — the dashboard's row of small stat cards, rebuilt to match
 * /crm-design's `KpiTile` exactly (2026-08-20): a plain Card, an uppercase
 * label, and a large mono number carrying the tone color — no top accent
 * rule (that was this file's own invention; the prototype has no such
 * element). Pure server markup (Link only, no client state).
 */
export function CounterTiles({ tiles, className }: { tiles: CounterTileData[]; className?: string }) {
  return (
    <div className={className ?? "grid grid-cols-3 gap-3 sm:grid-cols-6"}>
      {tiles.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          prefetch={false}
          className="rounded-lg border border-line-strong bg-card p-4 shadow-e1 transition-all hover:-translate-y-0.5 hover:shadow-e2"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{t.label}</p>
          <p className={`mt-1.5 font-mono text-[26px] font-bold leading-none tabular-nums ${TONE_TEXT[t.tone]}`}>
            {t.value}
          </p>
        </Link>
      ))}
    </div>
  );
}
