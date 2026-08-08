import { formatMoney } from "@/lib/domain/money";

export type DualTrendPoint = { label: string; gross: number; net: number };

const CHART_HEIGHT = 120;
const BAR_AREA = CHART_HEIGHT - 20;

/** Mobile's Net-vs-Gross chart — two bars per month (gross muted, net
 * colored by sign: green when positive, red only when the month actually
 * lost money) instead of two separate single-series TrendChart cards.
 * Same dependency-free flexbox-bar house rule TrendChart/Sparkline already
 * follow, just two series side by side. Desktop keeps its existing
 * separate Net/Rate TrendChart pair unchanged — this is mobile-only. */
export function DualTrendChart({ points }: { points: DualTrendPoint[] }) {
  if (points.length === 0) return null;
  const maxAbs = Math.max(1, ...points.flatMap((p) => [Math.abs(p.gross), Math.abs(p.net)]));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-[11px] text-fg-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-fg-subtle" /> Gross
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-ok" /> Net
        </span>
      </div>
      <div className="flex items-end gap-2" style={{ height: CHART_HEIGHT }}>
        {points.map((p) => {
          const grossH = Math.max(2, Math.round((Math.abs(p.gross) / maxAbs) * BAR_AREA));
          const netH = Math.max(2, Math.round((Math.abs(p.net) / maxAbs) * BAR_AREA));
          const netPositive = p.net >= 0;
          return (
            <div key={p.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex items-end gap-1" style={{ height: BAR_AREA }} title={`${p.label} — Gross: ${formatMoney(p.gross)}, Net: ${formatMoney(p.net)}`}>
                <div className="w-2.5 rounded-t-sm bg-fg-subtle/50" style={{ height: grossH }} />
                <div className={`w-2.5 rounded-t-sm ${netPositive ? "bg-ok" : "bg-bad"}`} style={{ height: netH }} />
              </div>
              <span className="text-[11px] text-fg-muted">{p.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
