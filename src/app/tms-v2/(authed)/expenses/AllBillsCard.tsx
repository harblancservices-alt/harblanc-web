import Link from "next/link";
import { Money } from "@/components/tms-v2/ui/Money";
import { formatMoney } from "@/lib/domain/money";
import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";
import type { RecurringFrequency } from "@/lib/domain/expenses";

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

export function cadenceText(r: RecurringExpenseRow): string {
  if (r.frequency === "monthly") return r.dayOfMonth != null ? ordinal(r.dayOfMonth) : "monthly";
  if (r.frequency === "weekly") return "weekly";
  if (r.frequency === "quarterly") return "quarterly";
  if (r.frequency === "annual") return "yearly";
  return r.frequency;
}

// Non-monthly bills show their real per-charge amount on the row (never a
// monthly-equivalent conversion — Brent's correction), tagged with the
// cycle it's actually charged on.
export const CYCLE_SUFFIX: Partial<Record<RecurringFrequency, string>> = {
  weekly: "/ wk",
  quarterly: "/ qtr",
  annual: "/ yr",
};

/**
 * "All recurring bills" — every active (non-archived, non-deleted, non-
 * one-time) recurring bill, INCLUDING $0 ones (hidden everywhere else in
 * /tms-v2 today; Brent explicitly wants them visible here so a forgotten-
 * amount bill doesn't silently vanish from the schedule). Sorted by
 * monthly-equivalent desc — $0 rows sink to the bottom for free, since 0 is
 * always the smallest value in a descending sort, no separate bucket logic
 * needed. Row amounts are the bill's own real per-charge figure (monthly
 * bills' "monthly-equivalent" already equals their real charge); only the
 * footer total and the header card above normalize weekly/quarterly/annual
 * to a monthly figure.
 */
export function AllBillsCard({ rows, rowHref }: { rows: RecurringExpenseRow[]; rowHref: (id: string) => string }) {
  const sorted = rows.slice().sort((a, b) => b.monthlyAmount - a.monthlyAmount || a.name.localeCompare(b.name));
  const total = rows.reduce((s, r) => s + r.monthlyAmount, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card shadow-e1">
      <div className="border-b border-line px-4 py-3">
        <div className="text-[14px] font-semibold text-fg">All recurring bills</div>
      </div>

      {sorted.length === 0 ? (
        <div className="px-4 py-4 text-[13px] text-fg-muted">No recurring bills yet.</div>
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {sorted.map((r) => {
            const isZero = r.monthlyAmount === 0;
            const suffix = CYCLE_SUFFIX[r.frequency];
            const tagParts = [r.category, cadenceText(r), r.cardName].filter((v): v is string => !!v);
            return (
              <Link key={r.id} href={rowHref(r.id)} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-elevated">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-fg">{r.name}</span>
                    {isZero ? (
                      <span className="shrink-0 rounded-full bg-elevated px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-fg-muted">
                        No amount set
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-[12.5px] text-fg-muted">{tagParts.length > 0 ? tagParts.join(" · ") : "—"}</div>
                </div>
                <div className="flex shrink-0 items-baseline gap-1">
                  {isZero ? (
                    <span className="text-[14px] font-semibold text-fg">$0</span>
                  ) : (
                    <>
                      <Money value={r.amount} tone="none" className="text-[14px] font-semibold" />
                      {suffix ? <span className="text-[12px] font-medium text-fg-muted">{suffix}</span> : null}
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between bg-elevated px-4 py-3">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-fg-muted">Total fixed / mo</span>
        <span className="text-[16px] font-semibold text-fg tabular-nums">{formatMoney(total)}</span>
      </div>
    </div>
  );
}
