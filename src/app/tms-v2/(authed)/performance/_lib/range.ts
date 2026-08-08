/**
 * Resolves Performance's view into a bounded `DateRange` (this period) plus
 * the equal-length period immediately before it (for MoM/YoY-style deltas)
 * — the ONE range that drives the entire page (KPIs, trends, broker/lane
 * tables, Load Board, Trip Analysis). Pure, zero I/O.
 *
 * Four modes, all resolving to the same `DateRange`/`prevRange` shape so
 * `getAnalyticsLoads`, `deltasBetween`, and `loadsPeriodFilter` never change:
 *
 *   - "month"  — a calendar month, browsable with prev/next (`?month=`).
 *                Covers "This month"/"Last month" and any other month.
 *   - "year"   — a calendar year, browsable with prev/next (`?year=`).
 *                Covers "This year"/"Last year" and any other year.
 *   - "ytd"    — Jan 1 of the current year through today (`?range=ytd`).
 *                Always "current" by construction — no browsing.
 *   - "range"  — a fixed preset with no browsing: today, yesterday, this
 *                week, last week, this quarter (`?range=<preset>`).
 *   - "custom" — an explicit day range (`?from=&to=`), unchanged from before.
 *
 * `granularity` tells the page which trend-bucket size to use (day/week/
 * month) per Brent's adaptive-trend spec — Day/Week/Month ranges trend
 * daily, Quarter trends weekly, Year/YTD trend monthly.
 */

import { currentPeriod, periodRange, periodLabel, type Period } from "@/lib/domain/attribution";
import { dayAfter, type DateRange } from "@/lib/data/analytics";
import { centralDateKey } from "@/lib/domain/dates";
import { formatCentralDate } from "@/lib/domain/dates";

export type TrendGranularity = "day" | "week" | "month";

export type RangePreset = "today" | "yesterday" | "this_week" | "last_week" | "this_quarter";

export type PerformanceView =
  | { mode: "month"; period: Period; range: DateRange; prevRange: DateRange; label: string; granularity: "day" }
  | { mode: "year"; year: number; range: DateRange; prevRange: DateRange; label: string; granularity: "month" }
  | { mode: "ytd"; year: number; range: DateRange; prevRange: DateRange; label: string; granularity: "month" }
  | { mode: "range"; preset: RangePreset; range: DateRange; prevRange: DateRange; label: string; granularity: TrendGranularity }
  | { mode: "custom"; from: string; to: string; range: DateRange; prevRange: DateRange; label: string; granularity: TrendGranularity };

const RANGE_PRESETS: RangePreset[] = ["today", "yesterday", "this_week", "last_week", "this_quarter"];

export function isRangePreset(v: string | undefined): v is RangePreset {
  return !!v && (RANGE_PRESETS as string[]).includes(v);
}

function parseMonthParam(month: string | undefined): Period | null {
  if (!month) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return { year: Number(m[1]), month: monthIdx };
}

function parseYearParam(year: string | undefined): number | null {
  if (!year || !/^\d{4}$/.test(year)) return null;
  return Number(year);
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

/** Same calendar day one year earlier/later — used for YTD's YoY prevRange
 * (Feb 29 in a non-leap target year rolls to Mar 1 via native Date math,
 * a one-day edge case not worth special-casing for a once-a-year date). */
function shiftYears(dateStr: string, years: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function weekdayOfUtc(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday
}

/** The Sunday on/before `dateStr` — Performance's week boundary matches
 * Calendar's own week-key convention ("each week's Sunday"), so a week here
 * is the same 7 days Calendar shows. */
function sundayOnOrBefore(dateStr: string): string {
  return shiftDate(dateStr, -weekdayOfUtc(dateStr));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function yearRange(year: number): DateRange {
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
}

function quarterOf(monthIdx: number): number {
  return Math.floor(monthIdx / 3); // 0-3
}

function quarterRange(year: number, qIdx: number): DateRange {
  const startMonthOrd = year * 12 + qIdx * 3;
  const endMonthOrd = startMonthOrd + 3;
  const sy = Math.floor(startMonthOrd / 12);
  const sm = startMonthOrd - sy * 12;
  const ey = Math.floor(endMonthOrd / 12);
  const em = endMonthOrd - ey * 12;
  return { start: `${sy}-${pad2(sm + 1)}-01`, end: `${ey}-${pad2(em + 1)}-01` };
}

/** Trend granularity for a range with no explicit rule (custom) — mirrors
 * Brent's Day/Week/Month→daily, Quarter→weekly, Year/YTD→monthly ladder by
 * span length: <=31 days reads fine as daily bars, <=~1 quarter as weekly,
 * anything longer collapses to monthly so the chart doesn't render 200+ bars. */
function granularityForSpan(days: number): TrendGranularity {
  if (days <= 31) return "day";
  if (days <= 100) return "week";
  return "month";
}

function presetRange(preset: RangePreset, today: string): { range: DateRange; prevRange: DateRange; granularity: TrendGranularity } {
  switch (preset) {
    case "today": {
      const range = { start: today, end: dayAfter(today) };
      const yesterday = shiftDate(today, -1);
      return { range, prevRange: { start: yesterday, end: today }, granularity: "day" };
    }
    case "yesterday": {
      const yesterday = shiftDate(today, -1);
      const range = { start: yesterday, end: today };
      const dayBefore = shiftDate(yesterday, -1);
      return { range, prevRange: { start: dayBefore, end: yesterday }, granularity: "day" };
    }
    case "this_week": {
      const start = sundayOnOrBefore(today);
      const end = shiftDate(start, 7);
      const prevStart = shiftDate(start, -7);
      return { range: { start, end }, prevRange: { start: prevStart, end: start }, granularity: "day" };
    }
    case "last_week": {
      const thisWeekStart = sundayOnOrBefore(today);
      const start = shiftDate(thisWeekStart, -7);
      const end = thisWeekStart;
      const prevStart = shiftDate(start, -7);
      return { range: { start, end }, prevRange: { start: prevStart, end: start }, granularity: "day" };
    }
    case "this_quarter": {
      const [y, m] = today.split("-").map(Number);
      const qIdx = quarterOf(m - 1);
      const range = quarterRange(y, qIdx);
      const prevOrd = y * 4 + qIdx - 1;
      const prevRange = quarterRange(Math.floor(prevOrd / 4), ((prevOrd % 4) + 4) % 4);
      return { range, prevRange, granularity: "week" };
    }
  }
}

function presetLabel(preset: RangePreset, range: DateRange): string {
  switch (preset) {
    case "today":
      return `Today · ${formatCentralDate(range.start)}`;
    case "yesterday":
      return `Yesterday · ${formatCentralDate(range.start)}`;
    case "this_week":
      return `This week · ${formatCentralDate(range.start)} – ${formatCentralDate(shiftDate(range.end, -1))}`;
    case "last_week":
      return `Last week · ${formatCentralDate(range.start)} – ${formatCentralDate(shiftDate(range.end, -1))}`;
    case "this_quarter": {
      const [y, m] = range.start.split("-").map(Number);
      return `Q${quarterOf(m - 1) + 1} ${y}`;
    }
  }
}

/**
 * Resolves the view from search params. Precedence: custom (`from`/`to`) >
 * year (`year`) > month (`month`) > fixed preset (`range`) > default (the
 * current Central month) — matching the old month-or-custom precedence with
 * the new modes layered in ahead of the default.
 */
export function resolvePerformanceView(
  sp: { month?: string; year?: string; range?: string; from?: string; to?: string },
  now: Date,
): PerformanceView {
  if (isValidDateStr(sp.from) && isValidDateStr(sp.to) && sp.from <= sp.to) {
    const from = sp.from;
    const to = sp.to;
    const range: DateRange = { start: from, end: dayAfter(to) };
    const span = daysBetweenExclusive(range.start, range.end);
    const prevRange: DateRange = { start: shiftDate(range.start, -span), end: range.start };
    return { mode: "custom", from, to, range, prevRange, label: `${from} – ${to}`, granularity: granularityForSpan(span) };
  }

  const year = parseYearParam(sp.year);
  if (year != null) {
    const range = yearRange(year);
    const prevRange = yearRange(year - 1);
    return { mode: "year", year, range, prevRange, label: String(year), granularity: "month" };
  }

  const period = parseMonthParam(sp.month);
  if (period != null) {
    const range = periodRange(period);
    const prevRange = periodRange(shiftPeriod(period, -1));
    return { mode: "month", period, range, prevRange, label: periodLabel(period), granularity: "day" };
  }

  const today = centralDateKey(now);

  if (sp.range === "ytd") {
    const y = Number(today.slice(0, 4));
    const range: DateRange = { start: `${y}-01-01`, end: dayAfter(today) };
    const prevRange: DateRange = { start: shiftYears(range.start, -1), end: shiftYears(range.end, -1) };
    return { mode: "ytd", year: y, range, prevRange, label: `Year to date · Jan 1 – ${formatCentralDate(today)}`, granularity: "month" };
  }

  if (isRangePreset(sp.range)) {
    const { range, prevRange, granularity } = presetRange(sp.range, today);
    return { mode: "range", preset: sp.range, range, prevRange, label: presetLabel(sp.range, range), granularity };
  }

  // Default: the current Central month, same as before.
  const defaultPeriod = currentPeriod(now);
  const range = periodRange(defaultPeriod);
  const prevRange = periodRange(shiftPeriod(defaultPeriod, -1));
  return { mode: "month", period: defaultPeriod, range, prevRange, label: periodLabel(defaultPeriod), granularity: "day" };
}
