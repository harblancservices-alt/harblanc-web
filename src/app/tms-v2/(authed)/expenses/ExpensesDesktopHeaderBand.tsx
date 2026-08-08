import { formatMoney } from "@/lib/domain/money";
import { computeFixedMonthlySummary } from "./FixedMonthlyHeaderCard";
import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";

// Same deliberately-off-palette surface FixedMonthlyHeaderCard uses (Brent's
// explicit hex) — one dark band, same color, both breakpoints.
const HEADER_BG = "#0d1117";

/**
 * Desktop Expenses' header band (Brent's approved mockup, 2026-08-08) —
 * same figures as mobile's FixedMonthlyHeaderCard (computeFixedMonthlySummary,
 * one shared calculation), laid out on a single wider band: "FIXED MONTHLY
 * $X" then one subline folding annual + active/paused counts together
 * ("≈ $Y / year · N active · M paused"), then the top-2-category cells.
 * Mobile keeps its own two-line layout (counts up top, annual on its own
 * line) untouched — this is a desktop-only arrangement of the identical
 * numbers, not a second computation.
 */
export function ExpensesDesktopHeaderBand({ rows }: { rows: RecurringExpenseRow[] }) {
  const { monthlyTotal, annualTotal, activeCount, pausedCount, topCategories } = computeFixedMonthlySummary(rows);

  return (
    <div className="overflow-hidden rounded-xl shadow-e2" style={{ backgroundColor: HEADER_BG }}>
      <div className={`px-5 pt-4 ${topCategories.length > 0 ? "pb-3" : "pb-4"}`}>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Fixed monthly</span>
        <div className="mt-1 text-[34px] font-semibold leading-tight tabular-nums text-white">{formatMoney(monthlyTotal)}</div>
        <div className="mt-0.5 text-[13px] text-white/60">
          ≈ {formatMoney(annualTotal)} / year · {activeCount} active · {pausedCount} paused
        </div>
      </div>

      {topCategories.length > 0 ? (
        <div className="flex divide-x divide-white/10 border-t border-white/10">
          {topCategories.map(([category, amount]) => (
            <div key={category} className="flex-1 px-5 py-3">
              <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-white/50">{category}</div>
              <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-white">{formatMoney(amount)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
