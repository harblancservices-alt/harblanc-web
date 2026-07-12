/**
 * Calendar / logbook domain logic — pure, no DB, no React. Shared by the admin
 * Calendar page (server data-shaping + the client month view).
 *
 * Everything here works on plain "YYYY-MM-DD" strings and does its weekday /
 * arithmetic in UTC (via Date.UTC), so a value never drifts across the viewer's
 * timezone the way `new Date("2026-07-04")` (parsed as local midnight) can. This
 * mirrors the string-first date handling already used across the repair log.
 */

// ---------------------------------------------------------------------------
// Date-string primitives.

/** Zero-pad to 2 digits. */
function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

/** Compose "YYYY-MM-DD" from parts (month is 1-based). */
export function toDateStr(y: number, month1: number, d: number): string {
  return `${y}-${pad2(month1)}-${pad2(d)}`;
}

/** Parse "YYYY-MM-DD…" → {y, m1, d}. Ignores any time suffix. */
export function parseDateStr(
  s: string,
): { y: number; m1: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m1: Number(m[2]), d: Number(m[3]) };
}

/** The date portion of any ISO-ish timestamp ("2026-07-04T13:22:00Z" → date). */
export function dateOnly(s: string | null): string | null {
  if (!s) return null;
  const p = parseDateStr(s);
  return p ? toDateStr(p.y, p.m1, p.d) : null;
}

/** UTC weekday of a date string: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(s: string): number {
  const p = parseDateStr(s);
  if (!p) return 0;
  return new Date(Date.UTC(p.y, p.m1 - 1, p.d)).getUTCDay();
}

/** Add `n` days (may be negative) to a date string. */
export function addDays(s: string, n: number): string {
  const p = parseDateStr(s);
  if (!p) return s;
  const dt = new Date(Date.UTC(p.y, p.m1 - 1, p.d + n));
  return toDateStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Whole days from a → b (b - a). Negative when b precedes a. */
export function daysBetween(a: string, b: string): number {
  const pa = parseDateStr(a);
  const pb = parseDateStr(b);
  if (!pa || !pb) return 0;
  const ta = Date.UTC(pa.y, pa.m1 - 1, pa.d);
  const tb = Date.UTC(pb.y, pb.m1 - 1, pb.d);
  return Math.round((tb - ta) / 86_400_000);
}

/** String compare works for zero-padded ISO dates; keep an explicit helper. */
export function isBefore(a: string, b: string): boolean {
  return a < b;
}

// ---------------------------------------------------------------------------
// Month grid.

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function monthName(month0: number): string {
  return MONTH_NAMES[((month0 % 12) + 12) % 12];
}

export const WEEKDAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/** Move a {year, month0} pair by `delta` months, normalizing the wrap. */
export function shiftMonth(
  year: number,
  month0: number,
  delta: number,
): { year: number; month0: number } {
  const total = year * 12 + month0 + delta;
  return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 };
}

/**
 * The Sun–Sat matrix covering a month: full weeks, each a 7-element array of
 * "YYYY-MM-DD" strings. Leading/trailing cells spill into the adjacent months
 * so every week is complete. Always starts on the Sunday on/BEFORE the 1st.
 */
export function monthMatrix(year: number, month0: number): string[][] {
  const first = toDateStr(year, month0 + 1, 1);
  const gridStart = addDays(first, -weekdayOf(first));
  // Number of weeks needed to cover the month (5 or 6).
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const used = weekdayOf(first) + daysInMonth;
  const weeks = Math.ceil(used / 7);
  const out: string[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: string[] = [];
    for (let d = 0; d < 7; d++) {
      row.push(addDays(gridStart, w * 7 + d));
    }
    out.push(row);
  }
  return out;
}

// ---------------------------------------------------------------------------
// US federal holidays.
//
// Computed per year from the actual rules — fixed dates (with Sat→Fri / Sun→Mon
// weekend-observed shifting) and nth-weekday rules. Only the real 11 federal
// holidays; nothing invented. The map is keyed by date string; the value is the
// display label ("(observed)" appended on a shifted weekday).

/** The nth (1-based) `weekday` of a month, e.g. 3rd Monday. */
function nthWeekday(
  year: number,
  month0: number,
  weekday: number,
  n: number,
): string {
  const firstDow = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const offset = (weekday - firstDow + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return toDateStr(year, month0 + 1, day);
}

/** The LAST `weekday` of a month (e.g. last Monday of May). */
function lastWeekday(year: number, month0: number, weekday: number): string {
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(year, month0, daysInMonth)).getUTCDay();
  const back = (lastDow - weekday + 7) % 7;
  return toDateStr(year, month0 + 1, daysInMonth - back);
}

/** Federal weekend-observed date for a fixed-date holiday, or null if none. */
function observedShift(dateStr: string): string | null {
  const dow = weekdayOf(dateStr);
  if (dow === 6) return addDays(dateStr, -1); // Saturday → observed Friday
  if (dow === 0) return addDays(dateStr, 1); // Sunday → observed Monday
  return null;
}

export type Holiday = { date: string; name: string; observed: boolean };

/**
 * Every US federal holiday in `year`, as a Map keyed by date string. Fixed-date
 * holidays add a separate "(observed)" entry when they land on a weekend. Also
 * folds in NEXT year's New Year's Day when it's observed on Dec 31 of `year`, so
 * a December grid shows it correctly.
 */
export function federalHolidays(year: number): Map<string, Holiday> {
  const out = new Map<string, Holiday>();
  const add = (date: string, name: string, observed = false) => {
    out.set(date, { date, name: observed ? `${name} (observed)` : name, observed });
  };

  // Fixed-date holidays: mark the REAL date, then the observed weekday if it
  // fell on a weekend.
  const fixed: { m1: number; d: number; name: string }[] = [
    { m1: 1, d: 1, name: "New Year's Day" },
    { m1: 6, d: 19, name: "Juneteenth" },
    { m1: 7, d: 4, name: "Independence Day" },
    { m1: 11, d: 11, name: "Veterans Day" },
    { m1: 12, d: 25, name: "Christmas Day" },
  ];
  for (const f of fixed) {
    const real = toDateStr(year, f.m1, f.d);
    add(real, f.name);
    const obs = observedShift(real);
    if (obs) add(obs, f.name, true);
  }

  // Nth-weekday holidays (never need shifting). Weekday: 1 = Mon, 4 = Thu.
  add(nthWeekday(year, 0, 1, 3), "MLK Day"); // 3rd Mon Jan
  add(nthWeekday(year, 1, 1, 3), "Presidents' Day"); // 3rd Mon Feb
  add(lastWeekday(year, 4, 1), "Memorial Day"); // last Mon May
  add(nthWeekday(year, 8, 1, 1), "Labor Day"); // 1st Mon Sep
  add(nthWeekday(year, 9, 1, 2), "Indigenous Peoples' Day"); // 2nd Mon Oct
  add(nthWeekday(year, 10, 4, 4), "Thanksgiving"); // 4th Thu Nov

  // Next year's New Year's Day observed back on Dec 31 of THIS year.
  const nextNy = toDateStr(year + 1, 1, 1);
  if (weekdayOf(nextNy) === 6) {
    add(toDateStr(year, 12, 31), "New Year's Day", true);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Load-bar lane assignment (interval graph coloring).

export type SpanEvent = { id: string; start: string; end: string };

/**
 * Assign each event the lowest lane index that no overlapping event already
 * occupies, so bars never visually collide. Overlap is inclusive on both ends
 * (a load delivered the same day another is picked up shares no free lane).
 * Greedy over events sorted by start then end — the standard stable result.
 */
export function assignLanes<T extends SpanEvent>(events: T[]): Map<string, number> {
  const sorted = [...events].sort((a, b) =>
    a.start === b.start ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start),
  );
  const laneEnds: string[] = []; // laneEnds[i] = end date of last event on lane i
  const lane = new Map<string, number>();
  for (const ev of sorted) {
    let placed = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] < ev.start) {
        placed = i;
        break;
      }
    }
    if (placed === -1) {
      placed = laneEnds.length;
      laneEnds.push(ev.end);
    } else {
      laneEnds[placed] = ev.end;
    }
    lane.set(ev.id, placed);
  }
  return lane;
}
