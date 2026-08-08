import Link from "next/link";
import { Money } from "@/components/tms-v2/ui/Money";
import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";

const BADGE_BG = "#0d1117";

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
      <div className="flex flex-col divide-y divide-line">
        {upcoming.map((r) => {
          const { mon, day } = dateBadge(r.nextChargeDateIso);
          return (
            <Link key={r.id} href={rowHref(r.id)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-elevated">
              <span
                className="flex w-12 shrink-0 flex-col items-center rounded-md py-1.5 text-white"
                style={{ backgroundColor: BADGE_BG }}
              >
                <span className="text-[9px] font-semibold uppercase leading-none tracking-wide">{mon}</span>
                <span className="mt-1 text-[15px] font-bold leading-none tabular-nums">{day}</span>
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">{r.name}</span>
              <Money value={r.amount} tone="none" className="shrink-0 text-[14px] font-semibold" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
