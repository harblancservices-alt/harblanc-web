"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  addDays,
  assignLanes,
  daysBetween,
  federalHolidays,
  monthMatrix,
  monthName,
  parseDateStr,
  shiftMonth,
  toDateStr,
  weekdayOf,
  WEEKDAY_LABELS,
  type Holiday,
} from "@/lib/dispatch/calendar";

/**
 * Admin Calendar — an activity logbook. Desktop shows the full Sun–Sat month
 * grid with load bars spanning pickup → delivery, repair chips, and federal
 * holidays; narrow screens degrade to a scrollable day-by-day agenda (the grid
 * is unreadable on a phone). Month state + the grid/agenda switch are the only
 * client concerns; all data is pre-shaped by the server page.
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
const HEADER_H = 24;
const BAR_H = 20;

function fmtDayHeading(date: string): string {
  const p = parseDateStr(date);
  if (!p) return date;
  const dt = new Date(Date.UTC(p.y, p.m1 - 1, p.d));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()];
  const mo = monthName(p.m1 - 1).slice(0, 3);
  return `${wd}, ${mo} ${p.d}`;
}

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

function fmtRange(l: LoadBar): string {
  if (l.start === l.end) return l.approx ? "approx date" : "single day";
  const nights = daysBetween(l.start, l.end);
  return `${nights + 1} days`;
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
  const firstOfMonth = toDateStr(view.year, view.month0 + 1, 1);

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
            {/* Weekday header. */}
            <div className="grid grid-cols-7 border-b border-line bg-inset">
              {WEEKDAY_LABELS.map((w) => (
                <div
                  key={w}
                  className="px-2 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3"
                >
                  {w}
                </div>
              ))}
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

        {/* Mobile agenda. */}
        <div className="mt-4 md:hidden">
          <Agenda
            year={view.year}
            month0={view.month0}
            firstOfMonth={firstOfMonth}
            today={today}
            loads={visibleLoads}
            holidays={holidays}
            repairsByDate={repairsByDate}
            weekNets={weekNets}
          />
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

type Segment = {
  load: LoadBar;
  lane: number;
  startCol: number;
  endCol: number;
  isStart: boolean;
  isEnd: boolean;
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
  const weekEnd = week[6];

  const segments: Segment[] = [];
  for (const load of loads) {
    if (load.end < weekStart || load.start > weekEnd) continue;
    const startCol = load.start <= weekStart ? 0 : weekdayOf(load.start);
    const endCol = load.end >= weekEnd ? 6 : weekdayOf(load.end);
    segments.push({
      load,
      lane: lanes.get(load.id) ?? 0,
      startCol,
      endCol,
      isStart: load.start >= weekStart,
      isEnd: load.end <= weekEnd,
    });
  }
  const laneCount = segments.reduce((m, s) => Math.max(m, s.lane + 1), 0);
  const barZoneH = laneCount * BAR_H;

  return (
    <div className="relative grid grid-cols-7 border-b border-line last:border-b-0">
      {week.map((date, col) => {
        const p = parseDateStr(date)!;
        const inMonth = p.m1 - 1 === month0;
        const isToday = date === today;
        const holiday = holidays.get(date);
        const dayRepairs = repairsByDate.get(date) ?? [];
        const showNet = col === 6 && weekNet && weekNet.count > 0;
        return (
          <div
            key={date}
            className={
              "min-h-[110px] border-r border-line last:border-r-0 " +
              (inMonth ? "" : "bg-inset/60")
            }
          >
            {/* Date number row (fixed height so bar overlay aligns). The
                week's quiet net sits at the right edge of the Saturday cell. */}
            <div
              className="flex items-center justify-between px-1.5"
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
              {showNet ? (
                <span
                  title="Week net — loads picked up this week"
                  className={
                    "font-mono text-[10.5px] font-semibold tabular-nums " +
                    netTone(weekNet.net)
                  }
                >
                  {fmtNet(weekNet.net)}
                </span>
              ) : null}
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

      {/* Load bars — one absolutely-positioned overlay per week, on top of the
          reserved zone. pointer-events pass through the gaps to the cells. */}
      <div className="pointer-events-none absolute inset-0">
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
// Mobile agenda.

type AgendaProps = {
  year: number;
  month0: number;
  firstOfMonth: string;
  today: string;
  loads: LoadBar[];
  holidays: Map<string, Holiday>;
  repairsByDate: Map<string, RepairChip[]>;
  weekNets: Map<string, WeekNet>;
};

type AgendaItem =
  | { kind: "load"; load: LoadBar }
  | { kind: "repair"; repair: RepairChip }
  | { kind: "holiday"; holiday: Holiday };

function Agenda({
  year,
  month0,
  firstOfMonth,
  today,
  loads,
  holidays,
  repairsByDate,
  weekNets,
}: AgendaProps) {
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const lastOfMonth = toDateStr(year, month0 + 1, daysInMonth);

  // Bucket items by day. A load appears once, on its start day — or on the 1st
  // when it started earlier but spills into this month.
  const byDay = new Map<string, AgendaItem[]>();
  const push = (date: string, item: AgendaItem) => {
    const arr = byDay.get(date);
    if (arr) arr.push(item);
    else byDay.set(date, [item]);
  };

  for (const l of loads) {
    if (l.end < firstOfMonth || l.start > lastOfMonth) continue;
    const at = l.start < firstOfMonth ? firstOfMonth : l.start;
    push(at, { kind: "load", load: l });
  }
  for (const [date, chips] of repairsByDate) {
    if (date < firstOfMonth || date > lastOfMonth) continue;
    for (const r of chips) push(date, { kind: "repair", repair: r });
  }
  for (const [date, h] of holidays) {
    if (date < firstOfMonth || date > lastOfMonth) continue;
    push(date, { kind: "holiday", holiday: h });
  }

  const days = [...byDay.keys()].sort();

  if (days.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-card px-4 py-10 text-center font-mono text-[12px] text-ink-3 shadow-e1">
        Nothing logged this month.
      </div>
    );
  }

  // A quiet "Week net" line leads the first day that appears from each Sun–Sat
  // week, matching the desktop grid's per-week total. Resolved up front (no
  // render-time mutation): map the week-opening day → its week net.
  const netHeaderByDay = new Map<string, WeekNet>();
  const seenWeeks = new Set<string>();
  for (const date of days) {
    const sunday = addDays(date, -weekdayOf(date));
    if (seenWeeks.has(sunday)) continue;
    seenWeeks.add(sunday);
    const wn = weekNets.get(sunday);
    if (wn && wn.count > 0) netHeaderByDay.set(date, wn);
  }

  return (
    <div className="space-y-3">
      {days.flatMap((date) => {
        const items = byDay.get(date)!;
        const isToday = date === today;
        const nodes: ReactNode[] = [];
        const headerNet = netHeaderByDay.get(date);
        if (headerNet) {
          nodes.push(
            <div
              key={"wk:" + date}
              className="flex items-center justify-between px-1 pt-1"
            >
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
                Week net
              </span>
              <span
                className={
                  "font-mono text-[12px] font-semibold tabular-nums " +
                  netTone(headerNet.net)
                }
              >
                {fmtNet(headerNet.net)}
              </span>
            </div>,
          );
        }
        nodes.push(
          <div key={date} className="rounded-lg border border-line bg-card shadow-e1">
            <div
              className={
                "flex items-center gap-2 border-b border-line px-3 py-2 " +
                (isToday ? "bg-accent/10" : "bg-inset")
              }
            >
              <span className="text-[13px] font-bold text-ink">
                {fmtDayHeading(date)}
              </span>
              {isToday ? (
                <span className="rounded-full bg-accent px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-white">
                  Today
                </span>
              ) : null}
            </div>
            <div className="divide-y divide-line">
              {items.map((item, i) => (
                <AgendaRow key={i} item={item} />
              ))}
            </div>
          </div>,
        );
        return nodes;
      })}
    </div>
  );
}

function AgendaRow({ item }: { item: AgendaItem }) {
  if (item.kind === "load") {
    const l = item.load;
    return (
      <Link
        href={`/admin/dispatch/loads/${l.id}`}
        prefetch={false}
        className="flex items-center gap-2.5 px-3 py-2.5 transition-colors active:bg-inset"
      >
        <span
          className={
            "mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full " +
            (l.cancelled ? "bg-slate-500" : "bg-green-700")
          }
        />
        <span className="min-w-0 flex-1">
          <span
            className={
              "block truncate text-[13.5px] font-semibold text-ink " +
              (l.cancelled ? "line-through" : "")
            }
          >
            {l.label}
          </span>
          <span className="font-mono text-[11px] text-ink-3">
            Load · {fmtRange(l)}
          </span>
        </span>
      </Link>
    );
  }
  if (item.kind === "repair") {
    const r = item.repair;
    return (
      <Link
        href={r.href}
        prefetch={false}
        className="flex items-center gap-2.5 px-3 py-2.5 transition-colors active:bg-inset"
      >
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700">
          <WrenchGlyph className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink">
            {r.label}
          </span>
          <span className="font-mono text-[11px] text-ink-3">
            Repair · {r.partCount} part{r.partCount === 1 ? "" : "s"}
          </span>
        </span>
      </Link>
    );
  }
  const h = item.holiday;
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700">
        <FlagGlyph className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-ink">
          {h.name}
        </span>
        <span className="font-mono text-[11px] text-ink-3">Federal holiday</span>
      </span>
    </div>
  );
}
