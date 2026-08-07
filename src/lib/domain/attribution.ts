/**
 * The one profit-attribution rule for /tms-v2 (v2-architecture.md §3b,
 * v2-design.md's non-negotiable list). A load's net is attributed to a
 * period by its PICKUP DATE — always, everywhere. Calendar, Performance,
 * the Load Board, and the Today dashboard all bucket by this same call so
 * a load's month never disagrees across screens.
 *
 * Pure, framework-free — zero I/O, fully unit-testable.
 */

import { currentCentralPeriod } from "./dates";

export type Period = { year: number; month: number }; // month is 0-based (Date.getMonth)

/**
 * A load's attribution date. Pickup date is the rule; delivery date then
 * created_at are fallbacks ONLY for legacy/incomplete rows that predate a
 * required pickup_date, so a load with no pickup date still lands
 * *somewhere* on the Calendar/Performance instead of vanishing. Period-
 * scoped list queries (lib/data/loads.ts) filter directly on pickup_date —
 * this fallback chain is for display/bucketing of the rare row missing it,
 * not for how the data layer scopes a period query.
 */
export function attributionDate(load: {
  pickup_date: string | null;
  delivery_date: string | null;
  created_at: string | null;
}): string | null {
  return load.pickup_date ?? load.delivery_date ?? load.created_at ?? null;
}

/** The {year, month} an attribution date string (YYYY-MM-DD prefix) falls
 * in. Parsed in UTC so it's time-zone-safe regardless of caller. */
export function periodOf(dateStr: string | null): Period | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1 };
}

/** True when a load's attribution date falls inside the given period. */
export function isInPeriod(dateStr: string | null, period: Period): boolean {
  const p = periodOf(dateStr);
  return p !== null && p.year === period.year && p.month === period.month;
}

/** The current period, resolved in Central time (v2-architecture.md §1 —
 * never the server's UTC clock, which can be a day/month ahead in the
 * evening). */
export function currentPeriod(now: Date = new Date()): Period {
  return currentCentralPeriod(now);
}

/**
 * A period's [start, end) date-string bounds — start inclusive, end
 * exclusive — for a direct, bounded, indexed `.gte(pickup_date, start)
 * .lt(pickup_date, end)` query. This is what "clipped to period" means
 * structurally: the data layer never reads more than one period's rows.
 */
export function periodRange(period: Period): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${period.year}-${pad(period.month + 1)}-01`;
  const nextMonth = period.month === 11 ? 0 : period.month + 1;
  const nextYear = period.month === 11 ? period.year + 1 : period.year;
  const end = `${nextYear}-${pad(nextMonth + 1)}-01`;
  return { start, end };
}

/**
 * The SQL-side twin of attributionDate()'s fallback chain (pickup_date,
 * then delivery_date, then created_at) — a PostgREST `.or()` filter string
 * for `loads` so a period-scoped query includes exactly the rows
 * attributionDate() would bucket into that period.
 *
 * BUG THIS FIXES: every period-scoped `loads` query used to filter with a
 * plain `.gte("pickup_date", start).lt("pickup_date", end)`. Postgres range
 * comparisons against NULL are never true, so a load with no pickup_date
 * matched NO period query, ever — even though attributionDate()'s own
 * contract says such a row should still land "somewhere" (delivery_date,
 * then created_at) rather than vanish. A load like that was only ever
 * visible via a status-scoped view (e.g. Active Loads); the moment it was
 * marked delivered it dropped out of that too, with nothing left anywhere
 * to show it — reported as "this month's load disappeared after I entered
 * the delivery odometer." Attribution still resolves pickup-first: a load
 * WITH a pickup_date is scoped by pickup_date alone, exactly as before;
 * this only widens the match for the rows that were being silently dropped.
 *
 * Takes a raw [start, end) range rather than a Period so callers that clip
 * to a custom day range (Performance's custom-range view), not just a
 * calendar month, can reuse the same fallback filter — pass
 * periodRange(period) for the month case.
 */
export function loadsPeriodFilter(range: { start: string; end: string }): string {
  const { start, end } = range;
  return [
    `and(pickup_date.gte.${start},pickup_date.lt.${end})`,
    `and(pickup_date.is.null,delivery_date.gte.${start},delivery_date.lt.${end})`,
    `and(pickup_date.is.null,delivery_date.is.null,created_at.gte.${start},created_at.lt.${end})`,
  ].join(",");
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** e.g. "August 2026" — for KPI-strip/page headers. */
export function periodLabel(period: Period): string {
  return `${MONTH_NAMES[period.month]} ${period.year}`;
}
