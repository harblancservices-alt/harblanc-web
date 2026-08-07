import { Money } from "@/components/tms-v2/ui/Money";
import type { AnalyticsLoad } from "@/lib/data/analytics";
import type { CalendarDay } from "../_lib/month-grid";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE_PER_DAY = 3;

/** Desktop month grid: 7 weekday columns + a trailing weekly-net rail
 * (v2-design.md §8's "per-week net column"). Hidden on mobile in favor of
 * <CalendarAgenda>. */
export function CalendarMonthGrid({
  weeks,
  loadsByDay,
}: {
  weeks: CalendarDay[][];
  loadsByDay: Map<string, AnalyticsLoad[]>;
}) {
  return (
    <div className="no-scrollbar hidden overflow-x-auto md:block">
      <div className="grid min-w-[880px] grid-cols-[repeat(7,1fr)_100px]">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`border-b border-line-strong px-2 py-1.5 text-[12px] font-medium ${
              i === 0 || i === 6 ? "text-fg-muted" : "text-fg"
            }`}
          >
            {label}
          </div>
        ))}
        <div className="border-b border-line-strong px-2 py-1.5 text-right text-[12px] font-medium text-fg-muted">
          Week net
        </div>

        {weeks.map((week) => {
          const weekNet = week.reduce(
            (sum, day) => sum + (loadsByDay.get(day.dateKey)?.reduce((s, l) => s + l.net, 0) ?? 0),
            0,
          );
          return (
            <div key={week[0].dateKey} className="contents">
              {week.map((day) => {
                const dayLoads = loadsByDay.get(day.dateKey) ?? [];
                return (
                  <div
                    key={day.dateKey}
                    className={`min-h-[92px] border-b border-r border-line p-1.5 ${day.isWeekend ? "bg-elevated/40" : ""}`}
                  >
                    <div
                      className={
                        day.isToday
                          ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-white"
                          : `text-[12px] font-medium ${day.inMonth ? "text-fg" : "text-fg-subtle"}`
                      }
                    >
                      {day.dayOfMonth}
                    </div>
                    {dayLoads.length > 0 ? (
                      <div className="mt-1 flex flex-col gap-0.5">
                        {dayLoads.slice(0, MAX_VISIBLE_PER_DAY).map((l) => (
                          <div
                            key={l.id}
                            className="truncate rounded bg-card px-1 py-0.5 text-[11px] text-fg"
                            title={`${l.broker} · ${l.origin} → ${l.destination}`}
                          >
                            {l.loadNumber ?? l.id.slice(0, 6)} <Money value={l.net} className="text-[11px]" />
                          </div>
                        ))}
                        {dayLoads.length > MAX_VISIBLE_PER_DAY ? (
                          <div className="text-[11px] text-fg-muted">
                            +{dayLoads.length - MAX_VISIBLE_PER_DAY} more
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div className="flex items-center justify-end border-b border-line px-2 text-[13px]">
                <Money value={weekNet} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
