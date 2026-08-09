export type KpiTileData = {
  label: string;
  value: string;
  sub?: string;
  subTone?: "danger" | "muted";
};

/**
 * The company profile's top KPI row — Total Contacts / Open Tasks (with an
 * overdue count in red) / Last Contact / Added, plus Total Deals when
 * crm_deals actually has rows for this company (page.tsx decides that; this
 * component just renders whatever tiles it's handed). Same visual language
 * as _shell/ui.tsx's StatTile, but as a local component since StatTile's
 * `sub` can't render in red for the overdue count.
 */
export function KpiStrip({ tiles }: { tiles: KpiTileData[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="border border-line-strong bg-card p-4 shadow-e2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{t.label}</p>
          <p className="mt-1.5 font-mono text-[24px] font-semibold tabular-nums leading-none text-fg">{t.value}</p>
          {t.sub && (
            <p className={`mt-1.5 text-[12px] ${t.subTone === "danger" ? "font-semibold text-bad" : "text-fg-muted"}`}>
              {t.sub}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
