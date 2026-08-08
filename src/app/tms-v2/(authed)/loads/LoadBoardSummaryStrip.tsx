import { formatMoney } from "@/lib/domain/money";
import { rpm } from "@/lib/dispatch/format";
import type { PeriodSummary } from "@/lib/dispatch/performance";

/** A single quiet line under the desktop toolbar — Loads / Gross / Net
 * (green) / Net $/mi / Deadhead % — NOT a KPI-tile banner (Brent's
 * explicit "no big goal banner" applies here too: this replaces it with
 * the smallest thing that still answers "how's this period going"). Same
 * PeriodSummary the desktop table's own footer totals row uses — one
 * summarize() call, not two. */
export function LoadBoardSummaryStrip({ summary }: { summary: PeriodSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">
      <span className="text-fg-muted">
        Loads <span className="font-semibold text-fg">{summary.loads}</span>
      </span>
      <span className="text-fg-muted">
        Gross <span className="font-semibold text-fg">{formatMoney(summary.gross)}</span>
      </span>
      <span className="text-fg-muted">
        Net <span className="font-semibold text-ok">{formatMoney(summary.net)}</span>
      </span>
      <span className="text-fg-muted">
        Net $/mi <span className="font-semibold text-fg">{rpm(summary.netRpm)}</span>
      </span>
      <span className="text-fg-muted">
        Deadhead <span className="font-semibold text-fg">{summary.deadheadPct != null ? `${summary.deadheadPct.toFixed(1)}%` : "—"}</span>
      </span>
    </div>
  );
}
