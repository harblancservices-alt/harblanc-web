import { formatMoney } from "@/lib/domain/money";
import { usdCompact } from "@/lib/dispatch/format";

export type NetTrendPoint = { label: string; net: number };

const CHART_H = 160;
const TICKS = 4; // top, 2 mid, bottom

/**
 * Real "Net profit by week" chart — a proper zero baseline, horizontal
 * gridlines, and a labeled y-axis, replacing the old scaleless bars
 * (DualTrendChart/RateTrendChart, which drew every bar relative to its own
 * max with no axis at all). Dependency-free (v2-design.md's "small
 * dependency-free chart" rule): absolutely-positioned divs against a fixed-
 * height track, not an SVG/charting library. Bars sit above the baseline
 * for a profitable bucket, below it for a losing one, so a loss week is
 * visually distinct rather than just "a shorter green bar".
 */
export function NetProfitTrendChart({ points }: { points: NetTrendPoint[] }) {
  if (points.length === 0) {
    return <p className="py-8 text-center text-[13px] text-fg-muted">No data in this period yet.</p>;
  }

  const values = points.map((p) => p.net);
  const maxVal = Math.max(0, ...values);
  const minVal = Math.min(0, ...values);
  const range = maxVal - minVal || 1;
  const baselineTopPct = ((maxVal - 0) / range) * 100;

  const tickValues = Array.from({ length: TICKS }, (_, i) => maxVal - (i / (TICKS - 1)) * range);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <div className="flex w-14 shrink-0 flex-col justify-between py-0.5 text-right" style={{ height: CHART_H }}>
          {tickValues.map((t, i) => (
            <span key={i} className="text-[10px] leading-none text-fg-subtle">
              {usdCompact(t)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height: CHART_H }}>
          {tickValues.map((t, i) => (
            <div key={i} className="absolute left-0 right-0 border-t border-line" style={{ top: `${(i / (TICKS - 1)) * 100}%` }} />
          ))}
          <div className="absolute left-0 right-0 border-t border-line-strong" style={{ top: `${baselineTopPct}%` }} />

          <div className="absolute inset-0 flex items-stretch gap-1">
            {points.map((p) => {
              const heightPct = Math.max(0, (Math.abs(p.net) / range) * 100);
              const positive = p.net >= 0;
              return (
                <div key={p.label} className="group relative min-w-0 flex-1">
                  <div
                    className={`absolute w-full rounded-[2px] ${positive ? "bg-ok" : "bg-bad"}`}
                    style={positive ? { bottom: `${100 - baselineTopPct}%`, height: `${heightPct}%` } : { top: `${baselineTopPct}%`, height: `${heightPct}%` }}
                    title={`${p.label} — ${formatMoney(p.net)}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex gap-1 pl-16">
        {points.map((p) => (
          <span key={p.label} className="min-w-0 flex-1 truncate text-center text-[10px] text-fg-muted">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
