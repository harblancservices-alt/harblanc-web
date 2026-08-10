import Link from "next/link";

export type CounterTileData = {
  key: string;
  label: string;
  value: number;
  href: string;
  /** Top-rule accent color, per the approved mockup's blue/red/amber/purple/
   * green/blue sequence — a literal hex per tile rather than the design
   * tokens, matching TaskRow's RAIL_COLOR precedent for mockup-specified
   * colors that don't map 1:1 onto --bad/--warn/etc. */
  accent: string;
};

/**
 * COUNTER TILES — the Command Center dashboard's row of 6 small stat cards
 * (Due Today / Overdue / Stale / To Research / Decision Makers / New This
 * Week), each a plain link-through to the record list behind the number. A
 * colored top rule is the only color signal (Brent's approved mockup) — the
 * number and label stay neutral ink so the row doesn't compete with the
 * urgent red/amber accents used further down the page (Going Stale, Next
 * Best Action). Pure server markup (Link only, no client state) so it works
 * identically in the desktop 6-across row and the mobile 3x2 grid — the
 * caller controls the grid via `className`.
 */
export function CounterTiles({ tiles, className }: { tiles: CounterTileData[]; className?: string }) {
  return (
    <div className={className ?? "grid grid-cols-3 gap-2.5 sm:grid-cols-6"}>
      {tiles.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          prefetch={false}
          className="group flex flex-col overflow-hidden rounded-lg border border-line-strong bg-card shadow-e1 transition-all hover:-translate-y-0.5 hover:shadow-e2"
        >
          <span aria-hidden className="h-[3px] w-full shrink-0" style={{ background: t.accent }} />
          <span className="flex flex-1 flex-col items-start justify-center gap-0.5 px-3 py-2.5">
            <span className="font-mono text-[22px] font-bold leading-none tabular-nums text-fg">{t.value}</span>
            <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted">
              {t.label}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
