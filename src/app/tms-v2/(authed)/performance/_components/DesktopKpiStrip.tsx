import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { formatMoney } from "@/lib/domain/money";
import { rpm, pct } from "@/lib/dispatch/format";
import type { MonthDeltas, PeriodSummary } from "@/lib/dispatch/performance";
import { DeltaChip } from "./DeltaChip";

/**
 * Desktop-only 5-up KPI row: Net profit (dark/emphasis, same hero tile the
 * mobile header pins), Net $/mi, Gross $/mi, Deadhead %, and Margin (net ÷
 * gross — `summarize()` already computes this as `marginPct`, and
 * `deltasBetween()` already diffs it as `deltas.margin`, so this adds no new
 * arithmetic, only a 5th tile surfacing figures the page already had).
 */
export function DesktopKpiStrip({ summary, deltas }: { summary: PeriodSummary; deltas: MonthDeltas }) {
  return (
    <div className="grid grid-cols-5 gap-3">
      <KpiTile label="Net profit" value={formatMoney(summary.net)} delta={<DeltaChip delta={deltas.net} />} emphasis="dark" />
      <KpiTile label="Net $/mi" value={rpm(summary.netRpm)} delta={<DeltaChip delta={deltas.netRpm} />} />
      <KpiTile label="Gross $/mi" value={rpm(summary.grossRpm)} delta={<DeltaChip delta={deltas.grossRpm} />} />
      <KpiTile label="Deadhead %" value={pct(summary.deadheadPct)} delta={<DeltaChip delta={deltas.deadhead} />} />
      <KpiTile label="Margin" value={pct(summary.marginPct)} delta={<DeltaChip delta={deltas.margin} />} />
    </div>
  );
}
