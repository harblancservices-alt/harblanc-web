import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import type { AnalyticsLoad } from "@/lib/data/analytics";
import type { CalendarDay } from "../_lib/month-grid";

/** Mobile agenda view: the same day → loads data as <CalendarMonthGrid>,
 * grouped and stacked instead of gridded (v2-design.md §8's mobile
 * pattern) — one data model, two renders, not two maintained trees. */
export function CalendarAgenda({
  weeks,
  loadsByDay,
}: {
  weeks: CalendarDay[][];
  loadsByDay: Map<string, AnalyticsLoad[]>;
}) {
  const daysInMonth = weeks.flat().filter((d) => d.inMonth);
  const daysWithLoads = daysInMonth.filter((d) => (loadsByDay.get(d.dateKey)?.length ?? 0) > 0);

  if (daysWithLoads.length === 0) {
    return (
      <div className="md:hidden">
        <p className="py-12 text-center text-[13px] text-fg-muted">No loads picked up this month yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 md:hidden">
      {daysWithLoads.map((day) => {
        const dayLoads = loadsByDay.get(day.dateKey) ?? [];
        const dayNet = dayLoads.reduce((s, l) => s + l.net, 0);
        return (
          <div key={day.dateKey} className="rounded-xl border border-line bg-card p-3 shadow-e1">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-fg">
                <DateTimeCST value={day.dateKey} mode="date" />
              </span>
              <Money value={dayNet} />
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {dayLoads.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-fg">
                    {l.loadNumber ?? l.id.slice(0, 8)} · {l.broker} · {l.origin} → {l.destination}
                  </span>
                  <Money value={l.net} className="shrink-0" />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
