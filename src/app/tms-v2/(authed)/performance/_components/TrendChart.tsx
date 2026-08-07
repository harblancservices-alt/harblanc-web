import { formatMoney } from "@/lib/domain/money";

export type TrendPoint = { label: string; value: number };

const CHART_HEIGHT = 120;

/** Dependency-free trailing-months trend — flexbox bars off a zero
 * baseline (same "no charting library" house rule Sparkline.tsx already
 * follows), not an SVG line chart, since a bar-per-month reads more
 * directly as "which months were good" than a sparkline would at this
 * size. Negative values render below the baseline in --bad. Generic over
 * `value` (used for both the Net trend and the rate/mi trend) so both
 * charts share one implementation. */
export function TrendChart({ points, formatValue = formatMoney }: { points: TrendPoint[]; formatValue?: (v: number) => string }) {
  if (points.length === 0) return null;

  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.value)));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2" style={{ height: CHART_HEIGHT }}>
        {points.map((p) => {
          const h = Math.max(2, Math.round((Math.abs(p.value) / maxAbs) * (CHART_HEIGHT - 24)));
          const positive = p.value >= 0;
          return (
            <div key={p.label} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${p.label}: ${formatValue(p.value)}`}>
              <span className="text-[11px] font-medium tabular-nums text-fg-muted">{formatValue(p.value)}</span>
              <div
                className={`w-full max-w-10 rounded-t-sm ${positive ? "bg-accent" : "bg-bad"}`}
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 border-t border-line pt-1.5">
        {points.map((p) => (
          <span key={p.label} className="flex-1 text-center text-[11px] text-fg-muted">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
