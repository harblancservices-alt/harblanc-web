import { formatMoney } from "@/lib/domain/money";
import { usdCompact } from "@/lib/dispatch/format";

export type GrossNetTrendPoint = { label: string; gross: number; net: number };

const CHART_H = 200;
const TICKS = 4;

/**
 * Desktop-only "Gross vs Net by {period}" grouped bar chart — two bars per
 * trend bucket (gross/accent, net/ok-or-bad by sign) against one shared
 * dollar axis, so a widening gap between the two bars reads as costs
 * eating the gross directly. Same dependency-free axis/gridline/baseline
 * approach as NetProfitTrendChart, generalized to two series sharing one
 * scale rather than one series with a signed baseline for losses.
 */
export function GrossNetTrendChart({ points }: { points: GrossNetTrendPoint[] }) {
  if (points.length === 0) {
    return <p className="py-8 text-center text-[13px] text-fg-muted">No data in this period yet.</p>;
  }

  const values = points.flatMap((p) => [p.gross, p.net]);
  const maxVal = Math.max(0, ...values);
  const minVal = Math.min(0, ...values);
  const range = maxVal - minVal || 1;
  const baselineTopPct = ((maxVal - 0) / range) * 100;

  const tickValues = Array.from({ length: TICKS }, (_, i) => maxVal - (i / (TICKS - 1)) * range);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3 text-[11px] font-medium text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-accent" aria-hidden="true" /> Gross
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-ok" aria-hidden="true" /> Net
        </span>
      </div>

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

          <div className="absolute inset-0 flex items-stretch gap-3 px-1">
            {points.map((p) => {
              const grossHeightPct = Math.max(0, (Math.abs(p.gross) / range) * 100);
              const netHeightPct = Math.max(0, (Math.abs(p.net) / range) * 100);
              const netPositive = p.net >= 0;
              return (
                <div key={p.label} className="group relative flex min-w-0 flex-1 items-stretch gap-0.5">
                  <div
                    className="absolute w-[45%] rounded-t-[2px] bg-accent"
                    style={{ bottom: `${100 - baselineTopPct}%`, height: `${grossHeightPct}%` }}
                    title={`${p.label} — Gross ${formatMoney(p.gross)}`}
                  />
                  <div
                    className={`absolute left-[50%] w-[45%] rounded-t-[2px] ${netPositive ? "bg-ok" : "bg-bad"}`}
                    style={
                      netPositive
                        ? { bottom: `${100 - baselineTopPct}%`, height: `${netHeightPct}%` }
                        : { top: `${baselineTopPct}%`, height: `${netHeightPct}%` }
                    }
                    title={`${p.label} — Net ${formatMoney(p.net)}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex gap-3 pl-16">
        {points.map((p) => (
          <span key={p.label} className="min-w-0 flex-1 truncate text-center text-[10px] text-fg-muted">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
