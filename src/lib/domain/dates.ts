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
