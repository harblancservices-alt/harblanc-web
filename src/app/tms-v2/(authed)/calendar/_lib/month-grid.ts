/**
 * Pure month-grid builder for the Calendar page (v2-design.md §8) — zero
 * I/O, computes the Sun–Sat week grid (including the leading/trailing days
 * from adjacent months needed to complete the first/last week) for a given
 * {year, month} period. Kept separate from the page shell so it's trivially
 * testable in isolation, matching the rest of /tms-v2's domain-logic
 * convention of pure, framework-free functions.
 */

import type { Period } from "@/lib/domain/attribution";

export type CalendarDay = {
  /** YYYY-MM-DD, UTC calendar date — matches the pickup_date column shape
   * used to key loads by day. */
  dateKey: string;
  dayOfMonth: number;
  inMonth: boolean;
  isWeekend: boolean;
  isToday: boolean;
};

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Weeks (Sun-first) covering the full month, padded with adjacent-month
 * days so every week row has exactly 7 cells. `todayKey` is a YYYY-MM-DD
 * string (Central calendar day) used only to flag "today"'s cell. */
export function buildMonthGrid(period: Period, todayKey: string): CalendarDay[][] {
  const first = new Date(Date.UTC(period.year, period.month, 1));
  const startWeekday = first.getUTCDay(); // 0 = Sun
  const daysInMonth = new Date(Date.UTC(period.year, period.month + 1, 0)).getUTCDate();
  const gridStart = new Date(Date.UTC(period.year, period.month, 1 - startWeekday));

  const totalDays = startWeekday + daysInMonth;
  const totalCells = Math.ceil(totalDays / 7) * 7;

  const cells: CalendarDay[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    const dateKey = toDateKey(d);
    const dow = d.getUTCDay();
    cells.push({
      dateKey,
      dayOfMonth: d.getUTCDate(),
      inMonth: d.getUTCMonth() === period.month && d.getUTCFullYear() === period.year,
      isWeekend: dow === 0 || dow === 6,
      isToday: dateKey === todayKey,
    });
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
