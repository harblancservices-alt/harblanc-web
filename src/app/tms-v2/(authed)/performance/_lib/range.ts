/**
 * Resolves Performance's two view modes — a calendar month or a custom
 * day-to-day range — into a bounded `DateRange` (this period) plus the
 * equal-length period immediately before it (for MoM-style deltas). Pure,
 * zero I/O. Both modes clip on pickup_date via the same
 * `lib/domain/attribution.ts` period math / `lib/data/analytics.ts` range
 * shape Calendar uses, so the two screens cannot disagree.
 */

import { currentPeriod, periodRange, periodLabel, type Period } from "@/lib/domain/attribution";
import { dayAfter, type DateRange } from "@/lib/data/analytics";

export type PerformanceView =
  | { mode: "month"; period: Period; range: DateRange; prevRange: DateRange; label: string }
  | { mode: "custom"; from: string; to: string; range: DateRange; prevRange: DateRange; label: string };

function parseMonthParam(month: string | undefined): Period | null {
  if (!month) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return { year: Number(m[1]), month: monthIdx };
}

function isValidDateStr(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function shiftPeriod(period: Period, delta: number): Period {
  const ord = period.year * 12 + period.month + delta;
  const year = Math.floor(ord / 12);
  const month = ((ord % 12) + 12) % 12;
  return { year, month };
}

export function monthParam(period: Period): string {
  return `${period.year}-${String(period.month + 1).padStart(2, "0")}`;
}

function daysBetweenExclusive(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Resolves `?from=&to=` (custom range, wins when both are valid dates with
 * from <= to) or `?month=` (defaults to the current Central month). */
export function resolvePerformanceView(
  sp: { month?: string; from?: string; to?: string },
  now: Date,
): PerformanceView {
  if (isValidDateStr(sp.from) && isValidDateStr(sp.to) && sp.from <= sp.to) {
    const from = sp.from;
    const to = sp.to;
    const range: DateRange = { start: from, end: dayAfter(to) };
    const span = daysBetweenExclusive(range.start, range.end);
    const prevRange: DateRange = { start: shiftDate(range.start, -span), end: range.start };
    return { mode: "custom", from, to, range, prevRange, label: `${from} – ${to}` };
  }

  const period = parseMonthParam(sp.month) ?? currentPeriod(now);
  const range = periodRange(period);
  const prevRange = periodRange(shiftPeriod(period, -1));
  return { mode: "month", period, range, prevRange, label: periodLabel(period) };
}
