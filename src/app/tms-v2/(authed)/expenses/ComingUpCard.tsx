import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";
import { ComingUpRow } from "./ComingUpRow";

function dateBadge(iso: string): { mon: string; day: string } {
  const d = new Date(`${iso}T00:00:00`);
  return { mon: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(), day: String(d.getDate()) };
}

/**
 * "Coming up" — the next 3 day-of-month-anchored bills due, nearest first.
 * Scoped to `dayOfMonth != null` (Brent's explicit ask): weekly/quarterly/
 * annual bills don't get a day-of-month badge here, so they're skipped
 * rather than shown with a misleading date. `nextChargeDateIso` is already
 * the real next occurrence (lib/data/recurring-expenses.ts's
 * nextChargeDate, honoring start/end/skip dates) — not re-derived here.
 *
 * Each row (ComingUpRow, a client component) is swipe-to-pay: swiping
 * either direction past the threshold marks that bill's current occurrence
 * paid and advances its schedule to the next one.
 */
export function ComingUpCard({ rows, rowHref }: { rows: RecurringExpenseRow[]; rowHref: (id: string) => string }) {
  const upcoming = rows
    .filter((r): r is RecurringExpenseRow & { nextChargeDateIso: string } => r.dayOfMonth != null && r.nextChargeDateIso != null)
    .sort((a, b) => a.nextChargeDateIso.localeCompare(b.nextChargeDateIso))
    .slice(0, 3);

  if (upcoming.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card shadow-e1">
      <div className="border-b border-line px-4 py-3">
        <div className="text-[14px] font-semibold text-fg">Coming up</div>
      </div>
      <div className="flex flex-col">
        {upcoming.map((r) => {
          const { mon, day } = dateBadge(r.nextChargeDateIso);
          return <ComingUpRow key={r.id} id={r.id} name={r.name} amount={r.amount} mon={mon} day={day} href={rowHref(r.id)} />;
        })}
      </div>
    </div>
  );
}
