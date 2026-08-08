import { formatMoney } from "@/lib/domain/money";
import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";

// The one deliberately-off-palette surface in /tms-v2 (Brent's explicit hex,
// not --bar) — a near-black header card distinct from the Load Detail
// command bar's --bar graphite, matching the reference he sent.
const HEADER_BG = "#0d1117";

/**
 * Expenses' new header (replaces the recurring-bill calendar's month/year
 * KPI strip) — one number: total FIXED MONTHLY spend across every active
 * recurring bill, each frequency normalized to its monthly-equivalent cost
 * (lib/data/recurring-expenses.ts's monthlyAmount(), the same formula the
 * old calendar's "Projected annual" figure already used — not a new
 * calculation). "Active"/"paused" here means has-an-amount vs. $0, not the
 * archived flag (archived rows never reach this component at all).
 */
export function FixedMonthlyHeaderCard({ rows }: { rows: RecurringExpenseRow[] }) {
  const monthlyTotal = rows.reduce((s, r) => s + r.monthlyAmount, 0);
  const annualTotal = monthlyTotal * 12;
  const activeCount = rows.filter((r) => r.monthlyAmount > 0).length;
  const pausedCount = rows.filter((r) => r.monthlyAmount === 0).length;

  const byCategory = new Map<string, number>();
  for (const r of rows) {
    if (r.monthlyAmount <= 0) continue;
    const key = r.category ?? "Uncategorized";
    byCategory.set(key, (byCategory.get(key) ?? 0) + r.monthlyAmount);
  }
  // Top 2 (not 3, per Brent's follow-up 2026-08-08 — a 3rd tile crowded
  // the row; two cells reads cleaner and the flex-1 layout below already
  // expands to fill whatever width is left with no other change needed).
  const topCategories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);

  return (
    <div className="overflow-hidden rounded-xl shadow-e2" style={{ backgroundColor: HEADER_BG }}>
      <div className={`px-4 pt-4 ${topCategories.length > 0 ? "pb-3" : "pb-4"}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Fixed monthly</span>
          <span className="text-[12px] font-medium text-white/60">
            {activeCount} active · {pausedCount} paused
          </span>
        </div>
        <div className="mt-1 text-[32px] font-semibold leading-tight tabular-nums text-white">{formatMoney(monthlyTotal)}</div>
        <div className="mt-0.5 text-[13px] text-white/60">≈ {formatMoney(annualTotal)} / year in recurring bills</div>
      </div>

      {topCategories.length > 0 ? (
        <div className="flex divide-x divide-white/10 border-t border-white/10">
          {topCategories.map(([category, amount]) => (
            <div key={category} className="flex-1 px-4 py-3">
              <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-white/50">{category}</div>
              <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-white">{formatMoney(amount)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
