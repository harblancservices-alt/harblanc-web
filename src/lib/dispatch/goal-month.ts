/**
 * Goal-month attribution for the $10k net-profit goal gauge. Pure + framework-
 * free so the load-board page and its Vitest spec share ONE implementation.
 *
 * The gauge is monthly and resets at the start of each month. A load's net is
 * attributed to the calendar month of its close-out date MINUS one day, so a
 * load closed out on the 1st counts toward the previous month and the 2nd+
 * counts toward the current one (Jul 1 → June; Jul 2 → July).
 */

// Harblanc operates in US Central (Houston, TX). "Now's month" MUST be resolved
// in this zone, not the server's UTC clock: loads carry date-only (YYYY-MM-DD)
// close-out dates that mean local calendar days, so if the current month were
// taken from UTC the gauge would roll over ~5 hours early on the last evening
// of each month (UTC already next month) and zero the still-current month.
export const BUSINESS_TZ = "America/Chicago";

/**
 * A load's close-out date — the date its net is attributed to a month. Uses
 * delivery_date (closed out when delivered), falling back to pickup_date then
 * created_at for loads not yet delivered.
 */
export function closeOutDate(l: {
  delivery_date: string | null;
  pickup_date: string | null;
  created_at: string | null;
}): string | null {
  return l.delivery_date ?? l.pickup_date ?? l.created_at ?? null;
}

/**
 * The {year, month} a close-out date is attributed to (month 0-based, matching
 * Date.getMonth). Implemented as the calendar month of (date − 1 day), parsed
 * from the YYYY-MM-DD prefix in UTC so it's time-zone-safe.
 */
export function goalMonthParts(
  dateStr: string | null,
): { year: number; month: number } | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() - 1);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/**
 * The calendar {year, month} (month 0-based) that "now" falls in, evaluated in
 * the business timezone — the month the gauge is currently accruing toward.
 */
export function currentGoalMonth(
  now: Date,
  tz: string = BUSINESS_TZ,
): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    // Defensive fallback (should never hit): UTC parts.
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  }
  return { year, month: month - 1 };
}

/**
 * "Today" as a YYYY-MM-DD calendar date in the business timezone — the same
 * date-only form the loads/repairs rows carry, so it can be compared to them
 * by string equality (the calendar's today marker does exactly that).
 *
 * Must NOT come from the server's UTC clock: Central is UTC−5/−6, so from 7pm
 * Central onward UTC has already ticked to tomorrow and the marker would land
 * a day ahead of the operator's actual day.
 */
export function currentBusinessDate(now: Date, tz: string = BUSINESS_TZ): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const at = (type: string) => parts.find((p) => p.type === type)?.value;
  const year = at("year");
  const month = at("month");
  const day = at("day");
  if (!year || !month || !day) {
    // Defensive fallback (should never hit): UTC date.
    return now.toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

/** Full month name of "now" in the business timezone, e.g. "June". */
export function currentGoalMonthLabel(now: Date, tz: string = BUSINESS_TZ): string {
  return now.toLocaleString("en-US", { month: "long", timeZone: tz });
}
