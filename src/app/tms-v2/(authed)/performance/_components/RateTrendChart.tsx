import { rpm } from "@/lib/dispatch/format";

export type RateTrendPoint = { label: string; grossRpm: number | null; netRpm: number | null };

const CHART_HEIGHT = 120;
const BAR_AREA = CHART_HEIGHT - 20;

/**
 * Fixes the audit's §C/§D finding: the old "Rate ($/mi)" chart plotted
 * `grossRpm` only under a generic label — Gross $/loaded-mile and Net
 * $/loaded-mile are two different, both-decision-relevant figures (net is
 * what actually survived the run) and must never be silently mixed under
 * one unlabeled series. Both draw here, explicitly labeled, over LOADED
 * miles (the same denominator the KPI tiles and PartyStat rows use).
 */
export function RateTrendChart({ points }: { points: RateTrendPoint[] }) {
  if (points.length === 0) return null;
  const maxAbs = Math.max(1, ...points.flatMap((p) => [Math.abs(p.grossRpm ?? 0), Math.abs(p.netRpm ?? 0)]));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-[11px] text-fg-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-fg-subtle" /> Gross $/loaded-mi
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-ok" /> Net $/loaded-mi
        </span>
      </div>
      <div className="flex items-end gap-2" style={{ height: CHART_HEIGHT }}>
        {points.map((p) => {
          const grossH = Math.max(2, Math.round((Math.abs(p.grossRpm ?? 0) / maxAbs) * BAR_AREA));
          const netH = Math.max(2, Math.round((Math.abs(p.netRpm ?? 0) / maxAbs) * BAR_AREA));
          const netPositive = (p.netRpm ?? 0) >= 0;
          return (
            <div key={p.label} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="flex items-end gap-1"
                style={{ height: BAR_AREA }}
                title={`${p.label} — Gross: ${rpm(p.grossRpm)}/mi, Net: ${rpm(p.netRpm)}/mi`}
              >
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
