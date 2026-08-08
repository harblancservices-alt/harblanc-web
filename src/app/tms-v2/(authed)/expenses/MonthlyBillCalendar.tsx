import Link from "next/link";
import { Money } from "@/components/tms-v2/ui/Money";
import type { MonthSchedule } from "@/lib/data/recurring-expenses";

/**
 * Month/year selector (audit §I item 3 / Phase 3) — the one genuinely new
 * surface the redesign calls for: pick a month, see every real scheduled
 * recurring-bill occurrence that month (not a flat monthly-equivalent
 * estimate — a weekly bill's 4-5 real occurrences all show), plus the
 * month's real scheduled total and the current projected-annual run-rate.
 * Neither total double-counts: scheduledTotal sums actual occurrence dates,
 * projectedAnnualTotal is the documented monthlyAmount()×12 formula (§H).
 */

const MONTH_LABEL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthHref(year: number, month: number): string {
  const mm = String(month + 1).padStart(2, "0");
  return `/tms-v2/expenses?billsMonth=${year}-${mm}#calendar`;
}

export function MonthlyBillCalendar({ year, month, schedule }: { year: number; month: number; schedule: MonthSchedule }) {
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;

  return (
    <div id="calendar" className="rounded-xl border border-line bg-card shadow-e1">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <div className="text-[14px] font-semibold text-fg">Recurring-bill calendar</div>
          <div className="text-[12px] text-fg-muted">Every scheduled charge for the selected month</div>
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          <Link href={monthHref(prevYear, prevMonth)} className="rounded-md border border-line-strong px-2 py-1 text-fg-muted hover:bg-elevated">
            ←
          </Link>
          <span className="min-w-[110px] text-center font-medium text-fg">
            {MONTH_LABEL[month]} {year}
          </span>
          <Link href={monthHref(nextYear, nextMonth)} className="rounded-md border border-line-strong px-2 py-1 text-fg-muted hover:bg-elevated">
            →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
        <div className="px-4 py-2.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">Scheduled this month</div>
          <Money value={schedule.scheduledTotal} tone="none" className="mt-0.5 block text-[16px] font-semibold" />
        </div>
        <div className="px-4 py-2.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">Projected annual recurring</div>
          <Money value={schedule.projectedAnnualTotal} tone="none" className="mt-0.5 block text-[16px] font-semibold" />
        </div>
      </div>

      {schedule.items.length === 0 ? (
        <div className="px-4 py-4 text-[13px] text-fg-muted">No recurring bills scheduled for this month.</div>
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {schedule.items.map((item, i) => (
            <div key={`${item.expenseId}-${item.dateIso}-${i}`} className="grid grid-cols-[80px_1fr_auto] items-center gap-3 px-4 py-2 text-[13px] sm:grid-cols-[80px_1.4fr_1fr_1fr_auto]">
              <span className="text-fg-muted">
                {new Date(item.dateIso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              <span className="truncate font-medium text-fg">{item.name}</span>
              <span className="hidden truncate text-fg-muted sm:block">{item.cardName ?? "—"}</span>
              <span className="hidden truncate text-fg-muted sm:block">{item.category ?? "—"}</span>
              <Money value={item.amount} tone="none" className="justify-self-end font-semibold" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
