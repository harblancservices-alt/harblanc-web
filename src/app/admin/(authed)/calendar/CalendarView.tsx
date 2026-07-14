"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  addDays,
  assignLanes,
  federalHolidays,
  monthMatrix,
  monthName,
  parseDateStr,
  shiftMonth,
  weekdayOf,
  WEEKDAY_LABELS,
  type Holiday,
} from "@/lib/dispatch/calendar";

/**
 * Admin Calendar — an activity logbook. Both breakpoints render the same Sun–Sat
 * month grid with load bars spanning pickup → delivery, repair markers, and
 * federal holidays; the phone gets a compact variant of it (shrunken cells,
 * dot markers, and the week net as a per-week footer strip instead of a
 * trailing 8th column). Month state is the only client concern; all data is
 * pre-shaped by the server page.
 */

export type LoadBar = {
  id: string;
  label: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (>= start)
  approx: boolean; // date fell back to created_at
  cancelled: boolean;
  net: number; // canonical per-load net (0 for cancelled, which is excluded)
};

/** A week's net total + how many loads picked up in it, keyed by its Sunday. */
type WeekNet = { net: number; count: number };

export type RepairChip = {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  partCount: number;
  href: string;
};

// Grid geometry (px). Date-number row, then a reserved zone of bar lanes, then
// the chip stack flows below. Fixed so the overlaid bars line up with the cells.
// The _SM pair is the phone grid's tighter equivalent; both breakpoints render
// concurrently (one hidden), so each needs its own constants rather than a
// media-query-dependent value an inline style can't express.
const HEADER_H = 24;
const BAR_H = 20;
const HEADER_H_SM = 18;
const BAR_H_SM = 16;

/** Whole-dollar net with sign: 1234 → "$1,234", -50 → "-$50". */
function fmtNet(n: number): string {
  const r = Math.round(n);
  return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString("en-US");
}

/** Quiet tone for a net figure — green when up, red when down, muted at zero. */
function netTone(n: number): string {
  const r = Math.round(n);
  if (r > 0) return "text-green-700";
  if (r < 0) return "text-bad";
  return "text-ink-3";
}

function WrenchGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function FlagGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 22V4M4 4h13l-2 4 2 4H4" />
    </svg>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      {dir === "left" ? <polyline points="15 6 9 12 15 18" /> : <polyline points="9 6 15 12 9 18" />}
    </svg>
  );
}

export function CalendarView({
  loads,
  repairs,
  today,
}: {
  loads: LoadBar[];
  repairs: RepairChip[];
  today: string;
}) {
  const todayParts = parseDateStr(today) ?? { y: 2026, m1: 1, d: 1 };
  const [view, setView] = useState({ year: todayParts.y, month0: todayParts.m1 - 1 });

  const weeks = useMemo(() => monthMatrix(view.year, view.month0), [view]);
  const gridStart = weeks[0][0];
  const gridEnd = weeks[weeks.length - 1][6];

  // Holidays for every year the grid touches (a Dec/Jan grid spans two).
  const holidays = useMemo(() => {
    const years = new Set([
      parseDateStr(gridStart)!.y,
      parseDateStr(gridEnd)!.y,
    ]);
    const map = new Map<string, Holiday>();
    for (const y of years) {
      for (const [k, v] of federalHolidays(y)) map.set(k, v);
    }
    return map;
  }, [gridStart, gridEnd]);

  // Loads intersecting the visible grid, with globally-assigned lanes so a bar
  // keeps the same row across every week it spans.
  const visibleLoads = useMemo(
    () => loads.filter((l) => l.end >= gridStart && l.start <= gridEnd),
    [loads, gridStart, gridEnd],
  );
  const lanes = useMemo(() => assignLanes(visibleLoads), [visibleLoads]);

  const repairsByDate = useMemo(() => {
    const m = new Map<string, RepairChip[]>();
    for (const r of repairs) {
      const arr = m.get(r.date);
      if (arr) arr.push(r);
      else m.set(r.date, [r]);
    }
    return m;
  }, [repairs]);

  // Weekly net, keyed by each week's Sunday: sum of the canonical per-load net
  // for loads that PICKED UP in that Sun–Sat week (attributed by the same start
  // date the bar uses), excluding cancelled loads.
  const weekNets = useMemo(() => {
    const m = new Map<string, WeekNet>();
    for (const l of visibleLoads) {
      if (l.cancelled) continue;
      const sunday = addDays(l.start, -weekdayOf(l.start));
      const cur = m.get(sunday) ?? { net: 0, count: 0 };
      cur.net += l.net;
      cur.count += 1;
      m.set(sunday, cur);
    }
    return m;
  }, [visibleLoads]);

  const monthLabel = `${monthName(view.month0)} ${view.year}`;
  const isCurrentMonth =
    view.year === todayParts.y && view.month0 === todayParts.m1 - 1;

  const go = (delta: number) => setView((v) => shiftMonth(v.year, v.month0, delta));
  const goToday = () => setView({ year: todayParts.y, month0: todayParts.m1 - 1 });

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader eyebrow="Operations" title="Calendar" className="mb-3" />

        {/* Month controls + legend. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous month"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line-strong bg-card text-ink transition-colors hover:bg-inset"
            >
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next month"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line-strong bg-card text-ink transition-colors hover:bg-inset"
            >
              <Chevron dir="right" />
            </button>
            <h2 className="ml-1 min-w-[9.5rem] text-[18px] font-bold tabular-nums text-ink">
              {monthLabel}
            </h2>
            <button
              type="button"
              onClick={goToday}
              disabled={isCurrentMonth}
              className="ml-1 inline-flex h-9 items-center rounded-md border border-line-strong bg-card px-3 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-inset disabled:cursor-not-allowed disabled:opacity-50"
            >
              Today
            </button>
          </div>
          <Legend />
        </div>

        {/* Desktop grid. */}
        <div className="mt-4 hidden md:block">
          <div className="overflow-hidden rounded-lg border border-line bg-card shadow-e1">
            {/* Weekday header + a trailing Profit column. */}
            <div className="grid grid-cols-8 border-b border-line bg-inset">
              {WEEKDAY_LABELS.map((w) => (
                <div
                  key={w}
                  className="px-2 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3"
                >
                  {w}
                </div>
              ))}
              <div className="border-l border-line px-2 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
                Profit
              </div>
            </div>
            {weeks.map((week) => (
              <WeekRow
                key={week[0]}
                week={week}
                month0={view.month0}
                today={today}
                loads={visibleLoads}
                lanes={lanes}
                holidays={holidays}
                repairsByDate={repairsByDate}
                weekNet={weekNets.get(week[0])}
              />
            ))}
          </div>
        </div>

        {/* Mobile grid — same calendar, compacted to seven columns of phone
            width. The week net moves out of the trailing column (too narrow to
            survive an 8-way split) into a footer strip under each week. */}
        <div className="mt-4 md:hidden">
          <div className="overflow-hidden rounded-lg border border-line bg-card shadow-e1">
            <div className="grid grid-cols-7 border-b border-line bg-inset">
              {WEEKDAY_LABELS.map((w) => (
                <div
                  key={w}
                  className="px-0.5 py-1.5 text-center font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-ink-3"
                >
                  {w.slice(0, 1)}
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <MobileWeekRow
                key={week[0]}
                week={week}
                month0={view.month0}
                today={today}
                loads={visibleLoads}
                lanes={lanes}
                holidays={holidays}
                repairsByDate={repairsByDate}
                weekNet={weekNets.get(week[0])}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-4 rounded-sm bg-green-700" />
        Loaded
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-amber-200 bg-amber-50 text-amber-700">
          <WrenchGlyph className="h-2.5 w-2.5" />
        </span>
        Repair
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-blue-200 bg-blue-50 text-blue-700">
          <FlagGlyph className="h-2.5 w-2.5" />
        </span>
        Holiday
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week rows. Both breakpoints slice the same lane assignment into per-week
// segments; only the geometry and the chrome around them differ.

type Segment = {
  load: LoadBar;
  lane: number;
  startCol: number;
  endCol: number;
  isStart: boolean;
  isEnd: boolean;
};

/**
 * The pieces of each load bar that fall inside this Sun–Sat week, clipped to the
 * row's seven columns. `lane` comes from the grid-wide assignment, so a bar sits
 * on the same row in every week it spans; isStart/isEnd say whether the real
 * pickup/delivery is in view (the ends that get rounded).
 */
function weekSegments(
  week: string[],
  loads: LoadBar[],
  lanes: Map<string, number>,
): Segment[] {
  const weekStart = week[0];
  const weekEnd = week[6];
  const segments: Segment[] = [];
  for (const load of loads) {
    if (load.end < weekStart || load.start > weekEnd) continue;
    segments.push({
      load,
      lane: lanes.get(load.id) ?? 0,
      startCol: load.start <= weekStart ? 0 : weekdayOf(load.start),
      endCol: load.end >= weekEnd ? 6 : weekdayOf(load.end),
      isStart: load.start >= weekStart,
      isEnd: load.end <= weekEnd,
    });
  }
  return segments;
}

/** Lane rows a week needs — 0 when nothing spans it. */
function laneCountOf(segments: Segment[]): number {
  return segments.reduce((m, s) => Math.max(m, s.lane + 1), 0);
}

/** The figure the week's net cell shows: 0 (muted) unless loads picked up. */
function weekNetValueOf(weekNet: WeekNet | undefined): number {
  return weekNet && weekNet.count > 0 ? weekNet.net : 0;
}

// ---------------------------------------------------------------------------
// Desktop week row.

type WeekRowProps = {
  week: string[];
  month0: number;
  today: string;
  loads: LoadBar[];
  lanes: Map<string, number>;
  holidays: Map<string, Holiday>;
  repairsByDate: Map<string, RepairChip[]>;
  weekNet: WeekNet | undefined;
};

function WeekRow({
  week,
  month0,
  today,
  loads,
  lanes,
  holidays,
  repairsByDate,
  weekNet,
}: WeekRowProps) {
  const weekStart = week[0];
  const segments = weekSegments(week, loads, lanes);
  const barZoneH = laneCountOf(segments) * BAR_H;

  // Week net for the trailing Profit cell — the value when loads picked up this
  // week, otherwise a muted zero so the cell still renders and the grid stays
  // 8-wide.
  const weekNetValue = weekNetValueOf(weekNet);

  return (
    <div className="relative grid grid-cols-8 border-b border-line last:border-b-0">
      {week.map((date) => {
        const p = parseDateStr(date)!;
        const inMonth = p.m1 - 1 === month0;
        const isToday = date === today;
        const holiday = holidays.get(date);
        const dayRepairs = repairsByDate.get(date) ?? [];
        return (
          <div
            key={date}
            className={
              "min-h-[110px] border-r border-line " +
              (inMonth ? "" : "bg-inset/60")
            }
          >
            {/* Date number row (fixed height so bar overlay aligns). */}
            <div
              className="flex items-center px-1.5"
              style={{ height: HEADER_H }}
            >
              <span
                className={
                  "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-semibold tabular-nums " +
                  (isToday
                    ? "bg-accent text-white"
                    : inMonth
                      ? "text-ink"
                      : "text-ink-3")
                }
              >
                {p.d}
              </span>
            </div>
            {/* Reserved bar zone (bars are drawn by the overlay below). */}
            <div style={{ height: barZoneH }} />
            {/* Chips flow beneath the bars. */}
            <div className="flex flex-col gap-1 px-1.5 pb-1.5">
              {holiday ? (
                <span
                  className="inline-flex items-center gap-1 truncate rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-medium leading-tight text-blue-700"
                  title={holiday.name}
                >
                  <FlagGlyph className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{holiday.name}</span>
                </span>
              ) : null}
              {dayRepairs.map((r) => (
                <Link
                  key={r.id}
                  href={r.href}
                  prefetch={false}
                  title={`${r.label} · ${r.partCount} part${r.partCount === 1 ? "" : "s"}`}
                  className="inline-flex items-center gap-1 truncate rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-medium leading-tight text-amber-700 transition-colors hover:bg-amber-100"
                >
                  <WrenchGlyph className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{r.label}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {/* Trailing Profit cell — the week's net, centered, styled like a day
          cell. Muted at zero (incl. weeks with no pickups). */}
      <div className="flex min-h-[110px] flex-col items-center justify-center px-2">
        <span
          title="Week net — loads picked up this week"
          className={
            "font-mono text-[15px] font-bold tabular-nums " +
            netTone(weekNetValue)
          }
        >
          {fmtNet(weekNetValue)}
        </span>
      </div>

      {/* Load bars — one absolutely-positioned overlay per week, confined to the
          seven day columns (never the Profit cell) and layered on top of the
          reserved zone. pointer-events pass through the gaps to the cells. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 right-[12.5%]">
        {segments.map((s) => {
          const leftPct = (s.startCol / 7) * 100;
          const widthPct = ((s.endCol - s.startCol + 1) / 7) * 100;
          return (
            <Link
              key={s.load.id + ":" + weekStart}
              href={`/admin/dispatch/loads/${s.load.id}`}
              prefetch={false}
              title={`${s.load.label}${s.load.approx ? " (approx date)" : ""}`}
              className={
                "pointer-events-auto absolute flex items-center overflow-hidden px-1.5 text-[11px] font-semibold leading-none text-white shadow-sm transition-opacity hover:opacity-90 " +
                (s.load.cancelled
                  ? "bg-slate-500 line-through "
                  : "bg-green-700 ") +
                (s.load.approx ? "border border-dashed border-white/60 " : "") +
                (s.isStart ? "rounded-l-md " : "") +
                (s.isEnd ? "rounded-r-md " : "")
              }
              style={{
                top: HEADER_H + s.lane * BAR_H,
                height: BAR_H - 3,
                left: `calc(${leftPct}% + 3px)`,
                width: `calc(${widthPct}% - 6px)`,
              }}
            >
              <span className="truncate">
                {!s.isStart ? "‹ " : ""}
                {s.load.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile week row — the same grid at phone scale.
//
// Seven columns of ~48px each at 375px wide, so a bar still reads as a span and
// the row still reads as a week. Everything that can't survive the shrink is
// swapped rather than dropped: repair/holiday chips become dots (tapping the
// dot still opens the repair), bar labels appear only on spans wide enough to
// hold text, and the week net becomes a footer strip under the row.

function MobileWeekRow({
  week,
  month0,
  today,
  loads,
  lanes,
  holidays,
  repairsByDate,
  weekNet,
}: WeekRowProps) {
  const weekStart = week[0];
  const segments = weekSegments(week, loads, lanes);
  const barZoneH = laneCountOf(segments) * BAR_H_SM;
  const weekNetValue = weekNetValueOf(weekNet);

  return (
    <div className="border-b border-line last:border-b-0">
      <div className="relative grid grid-cols-7">
        {week.map((date) => {
          const p = parseDateStr(date)!;
          const inMonth = p.m1 - 1 === month0;
          const isToday = date === today;
          const holiday = holidays.get(date);
          const dayRepairs = repairsByDate.get(date) ?? [];
          return (
            <div
              key={date}
              className={
                "min-h-[58px] border-r border-line last:border-r-0 " +
                (inMonth ? "" : "bg-inset/60")
              }
            >
              <div
                className="flex items-center justify-center"
                style={{ height: HEADER_H_SM }}
              >
                <span
                  className={
                    "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-0.5 text-[10.5px] font-semibold tabular-nums " +
                    (isToday
                      ? "bg-accent text-white"
                      : inMonth
                        ? "text-ink"
                        : "text-ink-3")
                  }
                >
                  {p.d}
                </span>
              </div>
              {/* Reserved bar zone (bars are drawn by the overlay below). */}
              <div style={{ height: barZoneH }} />
              {/* Dot markers flow beneath the bars. */}
              <div className="flex flex-wrap items-center justify-center gap-x-0.5 px-0.5 pb-1">
                {holiday ? (
                  <span
                    className="flex h-4 w-4 items-center justify-center"
                    title={holiday.name}
                  >
                    <span className="h-2 w-2 rounded-full bg-blue-600" />
                    <span className="sr-only">{holiday.name}</span>
                  </span>
                ) : null}
                {dayRepairs.map((r) => (
                  <Link
                    key={r.id}
                    href={r.href}
                    prefetch={false}
                    title={`${r.label} · ${r.partCount} part${r.partCount === 1 ? "" : "s"}`}
                    className="flex h-4 w-4 items-center justify-center transition-opacity active:opacity-60"
                  >
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="sr-only">{r.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}

        {/* Load bars — same overlay as desktop, spanning all seven columns
            (there's no trailing Profit cell to avoid here). */}
        <div className="pointer-events-none absolute inset-0">
          {segments.map((s) => {
            const span = s.endCol - s.startCol + 1;
            const leftPct = (s.startCol / 7) * 100;
            const widthPct = (span / 7) * 100;
            return (
              <Link
                key={s.load.id + ":" + weekStart}
                href={`/admin/dispatch/loads/${s.load.id}`}
                prefetch={false}
                title={`${s.load.label}${s.load.approx ? " (approx date)" : ""}`}
                aria-label={s.load.label}
                className={
                  "pointer-events-auto absolute flex items-center overflow-hidden px-1 text-[9px] font-semibold leading-none text-white shadow-sm transition-opacity active:opacity-70 " +
                  (s.load.cancelled
                    ? "bg-slate-500 line-through "
                    : "bg-green-700 ") +
                  (s.load.approx ? "border border-dashed border-white/60 " : "") +
                  (s.isStart ? "rounded-l " : "") +
                  (s.isEnd ? "rounded-r " : "")
                }
                style={{
                  top: HEADER_H_SM + s.lane * BAR_H_SM,
                  height: BAR_H_SM - 3,
                  left: `calc(${leftPct}% + 1.5px)`,
                  width: `calc(${widthPct}% - 3px)`,
                }}
              >
                {/* A one- or two-day bar is too narrow for text; the colour and
                    the span carry it, and a tap opens the load. */}
                {span >= 3 ? (
                  <span className="truncate">
                    {!s.isStart ? "‹ " : ""}
                    {s.load.label}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Week net — the desktop Profit column, restated as a footer strip. */}
      <div className="flex items-center justify-end gap-1.5 border-t border-line/60 bg-inset/40 px-2 py-1">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Week net
        </span>
        <span
          className={
            "font-mono text-[12px] font-bold tabular-nums " +
            netTone(weekNetValue)
          }
        >
          {fmtNet(weekNetValue)}
        </span>
      </div>
    </div>
  );
}
