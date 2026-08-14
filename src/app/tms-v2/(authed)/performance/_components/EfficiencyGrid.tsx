import { Card } from "@/components/tms-v2/ui/Card";
import { formatDelta, type Delta } from "@/lib/dispatch/performance";

export type EfficiencyRow = { label: string; value: string; delta: Delta | null };

/**
 * Excel-style efficiency grid — label left, two aligned right columns
 * ("This period" / "vs prior"), replacing the old KPI-tile trio. Rows are
 * plain formatted strings the page already produced via rpm()/pct(); this
 * component only lays them out and colors the change cell (green when the
 * move is the direction the operator wants — deadhead down, rate up — per
 * `Delta.good`, computed once in lib/dispatch/performance.ts, never
 * re-derived here).
 */
export function EfficiencyGrid({ rows }: { rows: EfficiencyRow[] }) {
  return (
    <Card>
      <p className="mb-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Rate &amp; efficiency</p>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4">
        <span />
        <span className="pb-1.5 text-right text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">This period</span>
        <span className="pb-1.5 text-right text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">vs prior</span>
        {rows.map((r) => (
          <div key={r.label} className="col-span-3 grid grid-cols-subgrid items-center border-t border-line py-2">
            <span className="text-[13px] text-fg-muted">{r.label}</span>
            <span className="text-right font-mono text-[14px] font-semibold tabular-nums text-fg">{r.value}</span>
            <span className={`text-right text-[13px] font-medium ${r.delta == null ? "text-fg-subtle" : r.delta.good ? "text-ok" : "text-bad"}`}>
              {r.delta == null ? "—" : `${r.delta.good ? "▲" : "▼"} ${formatDelta(r.delta)}`}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
