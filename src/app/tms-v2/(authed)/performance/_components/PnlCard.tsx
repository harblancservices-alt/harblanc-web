import type { ReactNode } from "react";
import { Card } from "@/components/tms-v2/ui/Card";
import { Money } from "@/components/tms-v2/ui/Money";
import { formatDelta, type Delta, type PeriodSummary } from "@/lib/dispatch/performance";

/**
 * Itemized P&L — replaces the old KPI-tile grid with the "Excel row" shape
 * Brent asked for: label left, value right, hairline dividers, Net profit
 * bold/larger with its own vs-prior-period delta underneath. Every figure
 * comes straight out of `summarize()` (which sums each load's already-
 * costed `diesel`/`factoring`/`expenses`, produced once by `computeLoadNet`
 * — no second money calculation here).
 */
export function PnlCard({
  summary,
  netDelta,
  factoringPct,
  vsLabel,
}: {
  summary: PeriodSummary;
  netDelta: Delta | null;
  factoringPct: number;
  vsLabel: string;
}) {
  return (
    <Card>
      <p className="mb-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">P&amp;L</p>
      <div className="flex flex-col divide-y divide-line">
        <Row label="Revenue" value={<Money value={summary.gross} tone="none" />} />
        <Row label="Fuel" value={<Money value={-summary.diesel} tone="none" />} />
        <Row label={`Factoring (${factoringPct % 1 === 0 ? factoringPct : factoringPct.toFixed(1)}%)`} value={<Money value={-summary.factoringFee} tone="none" />} />
        <Row label="Other expenses" value={<Money value={-summary.otherExpenses} tone="none" />} />
        <div className="flex items-center justify-between gap-3 pt-2.5">
          <span className="text-[15px] font-semibold text-fg">Net profit</span>
          <div className="flex flex-col items-end gap-0.5">
            <Money value={summary.net} className="text-[22px] font-bold leading-none" />
            {netDelta ? (
              <span className={`text-[12px] font-medium ${netDelta.good ? "text-ok" : "text-bad"}`}>
                {netDelta.good ? "▲" : "▼"} {formatDelta(netDelta)} vs {vsLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-[13px] first:pt-0">
      <span className="text-fg-muted">{label}</span>
      <span className="font-medium text-fg">{value}</span>
    </div>
  );
}
