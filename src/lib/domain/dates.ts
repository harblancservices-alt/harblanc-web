/**
 * The one date/time formatter for /tms-v2 (v2-architecture.md §3c,
 * v2-design.md house rule #2). <DateTimeCST> is the only component allowed
 * to render a date — it renders through formatCentral() exclusively. A raw
 * `Date`/`toLocaleString()`/`Intl.DateTimeFormat` call anywhere else in
 * /tms-v2 is a review-blocking finding, not a style preference.
 *
 * Always US Central time, always labeled the literal "CST" (even in DST,
 * per the owner's standing call, matching the CRM's existing convention) —
 * the underlying conversion follows real America/Chicago rules; only the
 * printed label is pinned.
 */

const CENTRAL_TZ = "America/Chicago";

/**
 * Supabase/Postgres timestamptz values come back shaped like
 * "2026-07-28 02:00:31.26295+00" — not valid ISO 8601 (space instead of
 * "T", bare two-digit offset). `new Date(...)` parses that inconsistently
 * across engines. Every read of a stored timestamp in /tms-v2 must go
 * through this before becoming a Date.
 */
export function parseServerTimestamp(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  let s = trimmed.replace(" ", "T");
  s = s.replace(/([+-]\d{2})$/, "$1:00");
  if (!/[zZ]$/.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) s += "Z";

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date + time-of-day, e.g. "Aug 1, 2026, 2:41 PM CST". */
export function formatCentral(value: string | Date | null | undefined): string {
  const d = parseServerTimestamp(value);
  if (!d) return "—";
  const s = d.toLocaleString("en-US", {
    timeZone: CENTRAL_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${s} CST`;
}

/** Calendar date only, e.g. "Aug 1, 2026" — no "CST" suffix (no clock time
 * to qualify), computed against the Central calendar day. */
export function formatCentralDate(value: string | Date | null | undefined): string {
  const d = parseServerTimestamp(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    timeZone: CENTRAL_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Time-of-day only, e.g. "2:41 PM CST" — for contexts (a live clock, a
 * same-day timestamp column) where the date is already implied. */
export function formatCentralTime(value: string | Date | null | undefined): string {
  const d = parseServerTimestamp(value);
  if (!d) return "—";
  const s = d.toLocaleTimeString("en-US", {
    timeZone: CENTRAL_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${s} CST`;
}

/**
 * "Now" as a YYYY-MM-DD calendar date in Central time — the same date-only
 * shape `pickup_date`/`delivery_date` columns carry, so it can be compared
 * to them by string equality/range. Must NOT be derived from the server's
 * UTC clock: Central is UTC−5/−6, so from ~6-7pm Central onward UTC has
 * already ticked to tomorrow, which would misattribute anything computed
 * against "today" (period boundaries, day-of-month math) by a day.
 */
export function centralDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const at = (type: string) => parts.find((p) => p.type === type)?.value;
  const year = at("year");
  const month = at("month");
  const day = at("day");
  if (!year || !month || !day) return now.toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

/**
 * The calendar {year, month} (month 0-based, matching Date.getMonth) that
 * "now" falls in, evaluated in Central time — the one clock every /tms-v2
 * period-scoped query and KPI resolves "this month" against.
 */
export function currentCentralPeriod(now: Date = new Date()): { year: number; month: number } {
  const key = centralDateKey(now);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key);
  if (!m) return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  return { year: Number(m[1]), month: Number(m[2]) - 1 };
}
