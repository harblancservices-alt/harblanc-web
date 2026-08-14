import { Card } from "@/components/tms-v2/ui/Card";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/**
 * 4-cell miles breakdown — Total / Loaded / Deadhead / Personal. Personal
 * conveyance miles (Brent's Option C: PC only ever has a real denominator
 * at the trip level — start/end odometer + the gaps between a trip's own
 * loads) surface here for the first time on Performance, summed across
 * every trip touched by the selected period (`AnalyticsTrip.financials
 * .pcMiles`, the same figure Trip Analysis/Trip Detail already show —
 * never a second PC calculation).
 */
export function MilesGrid({ total, loaded, deadhead, personal }: { total: number; loaded: number; deadhead: number; personal: number }) {
  return (
    <Card>
      <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Miles</p>
      <div className="grid grid-cols-4 divide-x divide-line">
        <Cell label="Total" value={fmt(total)} />
        <Cell label="Loaded" value={fmt(loaded)} />
        <Cell label="Deadhead" value={fmt(deadhead)} tone="text-warn" />
        <Cell label="Personal" value={fmt(personal)} />
      </div>
    </Card>
  );
}

function Cell({ label, value, tone = "text-fg" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-1 text-center first:pl-0 last:pr-0">
      <span className={`font-mono text-[17px] font-bold tabular-nums ${tone}`}>{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">{label}</span>
    </div>
  );
}
