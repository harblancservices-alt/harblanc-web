/**
 * Date/time helpers for the admin views. UTC everywhere so the dispatch
 * center runs against canonical timestamps, not viewer local time.
 *
 *   formatDateShort        → "2026-05-21 14:48"
 *   formatDateFull         → "2026-05-21 14:48:32 UTC"
 *   formatTimestampShort   → "TODAY 14:48" / "MAY 19 14:48"
 *   relativeTime           → "3h ago" / "yesterday" / etc.
 *   isToday / isThisWeek / isNew → workflow indicator thresholds.
 *
 * Threshold definitions:
 *   isNew(iso)       → received in the last 1 hour
 *   isToday(iso)     → same UTC calendar day
 *   isThisWeek(iso)  → within last 7 days (rolling)
 *
 * NOTE: relative/threshold helpers read Date.now() and therefore disable
 * server static caching for any page that uses them — the admin dashboard
 * already runs dynamically because requireAdmin() reads cookies, so this
 * is a no-op for our purposes.
 */

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dayStartUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}

export function formatDateFull(iso: string): string {
  const d = new Date(iso);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  );
}

/**
 * Operational timestamp for tables and event-log rows. Compact, scannable.
 *   same UTC day        → "TODAY 14:48"
 *   within 7 days       → "MAY 19 14:48"
 *   older               → "MAY 14 14:48"
 */
export function formatTimestampShort(iso: string): string {
  const d = new Date(iso);
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  if (isToday(iso)) return `TODAY ${hh}:${mm}`;
  return `${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${hh}:${mm}`;
}

export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 30) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateShort(iso);
}

export function isNew(iso: string, hours = 1): boolean {
  const ms = Date.now() - new Date(iso).getTime();
  return ms < hours * 60 * 60 * 1000;
}

export function isToday(iso: string): boolean {
  return dayStartUTC(new Date(iso)) === dayStartUTC(new Date());
}

export function isThisWeek(iso: string, days = 7): boolean {
  const ms = Date.now() - new Date(iso).getTime();
  return ms < days * 24 * 60 * 60 * 1000;
}

/**
 * ISO timestamp for the start of the current UTC day. Used to filter
 * Supabase queries for "today" counts on the dashboard.
 */
export function todayStartISO(): string {
  const now = new Date();
  return new Date(dayStartUTC(now)).toISOString();
}

/**
 * ISO timestamp for 7 days ago (rolling window). Used for "this week".
 */
export function sevenDaysAgoISO(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}
