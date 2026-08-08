import Link from "next/link";
import { dropCounts, parseDateStr, spanTrim, weekdayOf, WEEKDAY_LABELS, type SpanEvent } from "@/lib/dispatch/calendar";
import { formatMoney } from "@/lib/domain/money";

/**
 * Ported from legacy /admin's Calendar (src/app/admin/(authed)/calendar/
 * CalendarView.tsx) at Brent's explicit request, 2026-08-08 — "the exact
 * green activity bars so I can tell at a glance which days I worked and how
 * busy each day was." Same visual system, same lane-packing math (reused
 * directly from lib/dispatch/calendar.ts, not reimplemented), same literal
 * green/slate/amber Tailwind colors — only the page shell differs (this
 * page is a Server Component driven by tms-v2's own URL-based month nav,
 * where admin's is client-state; the grid itself needs no client JS at all
 * since every interactive element is a plain <Link>).
 *
 * Deliberately NOT ported: the repair-service wrench chips and federal-
 * holiday flags admin's calendar also shows. Brent's ask was specifically
 * the day-activity (load) bars + "whatever the old one did" for the weekly
 * profit rail — both ported below. Flagging the trim, not silently
 * dropping it.
 */

export type LoadBar = {
  id: string;
  label: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD, >= start
  approx: boolean; // date fell back to created_at (no pickup/delivery on record)
  cancelled: boolean; // TONU — bar renders slate/struck-through, excluded from week net
  net: number; // canonical per-load net (0 for cancelled)
};

export type WeekNet = { net: number; count: number };

const WEEKEND_BG = "bg-[#FBF1E8]";
function isWeekendCol(i: number): boolean {
  return i === 0 || i === 6;
}

const HEADER_H = 24;
const BAR_H = 20;
const HEADER_H_SM = 18;
const BAR_H_SM = 16;

function fmtNet(n: number): string {
  return formatMoney(Math.round(n));
}

function netTone(n: number): string {
  const r = Math.round(n);
  if (r > 0) return "text-green-700";
  if (r < 0) return "text-bad";
  return "text-fg-subtle";
}

// ---------------------------------------------------------------------------
// Week-local bar segments — ported verbatim from CalendarView.tsx (only the
// LoadBar field names differ; the geometry math is identical).

type Segment = {
  load: LoadBar;
  lane: number;
  startCol: number;
  endCol: number;
  isStart: boolean;
  isEnd: boolean;
  trimStart: boolean;
  trimEnd: boolean;
};

function weekSegments(week: string[], loads: LoadBar[], lanes: Map<string, number>): Segment[] {
  const weekStart = week[0];
  const weekEnd = week[6];
  const drops = dropCounts(loads as SpanEvent[]);
  const segments: Segment[] = [];
  for (const load of loads) {
    if (load.end < weekStart || load.start > weekEnd) continue;
    const isStart = load.start >= weekStart;
    const isEnd = load.end <= weekEnd;
    const trim = spanTrim(load, drops);
    segments.push({
      load,
      lane: lanes.get(load.id) ?? 0,
      startCol: load.start <= weekStart ? 0 : weekdayOf(load.start),
      endCol: load.end >= weekEnd ? 6 : weekdayOf(load.end),
      isStart,
      isEnd,
      trimStart: isStart && trim.trimStart,
      trimEnd: isEnd && trim.trimEnd,
    });
  }
  return segments;
}

function segmentUnits(s: Segment): { start: number; span: number } {
  const start = s.startCol + (s.trimStart ? 0.5 : 0);
  const end = s.endCol + (s.trimEnd ? 0.5 : 1);
  return { start, span: end - start };
}

function laneCountOf(segments: Segment[]): number {
  return segments.reduce((m, s) => Math.max(m, s.lane + 1), 0);
}

function weekNetValueOf(weekNet: WeekNet | undefined): number {
  return weekNet && weekNet.count > 0 ? weekNet.net : 0;
}

// ---------------------------------------------------------------------------

export function CalendarMonthGrid({
  weeks,
  month0,
  today,
  loads,
  lanes,
  weekNets,
  monthMaxProfit,
  monthTotal,
  monthLabel,
}: {
  weeks: string[][];
  /** 0-based month of the VIEWED period — used only to shade adjacent-month
   * spillover days. */
  month0: number;
  today: string;
  loads: LoadBar[];
  lanes: Map<string, number>;
  weekNets: Map<string, WeekNet>;
  monthMaxProfit: number;
  monthTotal: number;
  monthLabel: string;
}) {
  return (
    <>
      {/* Desktop grid — 8 columns (7 days + Profit rail), md+ only. */}
      <div className="hidden overflow-hidden rounded-lg border border-line-strong bg-card shadow-e1 md:block">
        <div className="grid grid-cols-8 border-b border-line-strong">
          {WEEKDAY_LABELS.map((w, i) => (
            <div
              key={w}
              className={`bg-bar px-2 py-2 text-center text-[10.5px] font-bold uppercase tracking-[0.14em] ${
                isWeekendCol(i) ? "text-amber-300" : "text-sky-300"
              }`}
            >
              {w}
            </div>
          ))}
          <div className="border-l-[3px] border-green-600 bg-green-700 px-2 py-2 text-center text-[10.5px] font-bold uppercase tracking-[0.14em] text-white">
            Profit
          </div>
        </div>

        {weeks.map((week) => (
          <DesktopWeekRow
            key={week[0]}
            week={week}
            month0={month0}
            today={today}
            loads={loads}
            lanes={lanes}
            weekNet={weekNets.get(week[0])}
            monthMaxProfit={monthMaxProfit}
          />
        ))}

        <div className="grid grid-cols-8">
          <div className="col-span-7" />
          <div className="flex items-center justify-center border-l-[3px] border-t border-green-600 bg-green-50 px-2 py-2.5">
            <div className="inline-flex items-center gap-2 rounded-md bg-green-800 px-3 py-1.5 shadow-e1">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-green-100">{monthLabel.slice(0, 3).toUpperCase()} Total</span>
              <span className="text-[13.5px] font-extrabold tabular-nums text-white">{fmtNet(monthTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile grid — 7 columns, compact bars, week net as a footer strip
          instead of an 8th column (too narrow to survive the split). */}
      <div className="overflow-hidden rounded-lg border border-line-strong bg-card shadow-e1 md:hidden">
        <div className="grid grid-cols-7 border-b border-line-strong">
          {WEEKDAY_LABELS.map((w, i) => (
            <div
              key={w}
              className={`bg-bar px-0.5 py-1.5 text-center text-[9px] font-bold uppercase tracking-[0.08em] ${
                isWeekendCol(i) ? "text-amber-300" : "text-sky-300"
              }`}
            >
              {w.slice(0, 1)}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <MobileWeekRow key={week[0]} week={week} month0={month0} today={today} loads={loads} lanes={lanes} weekNet={weekNets.get(week[0])} />
        ))}
      </div>
    </>
  );
}

function DesktopWeekRow({
  week,
  month0,
  today,
  loads,
  lanes,
  weekNet,
  monthMaxProfit,
}: {
  week: string[];
  month0: number;
  today: string;
  loads: LoadBar[];
  lanes: Map<string, number>;
  weekNet: WeekNet | undefined;
  monthMaxProfit: number;
}) {
  const weekStart = week[0];
  const segments = weekSegments(week, loads, lanes);
  const barZoneH = laneCountOf(segments) * BAR_H;
  const weekNetValue = weekNetValueOf(weekNet);
  const barPct = monthMaxProfit > 0 ? Math.max(0, Math.min(100, (weekNetValue / monthMaxProfit) * 100)) : 0;

  return (
    <div className="relative grid grid-cols-8 border-b border-line-strong last:border-b-0">
      {week.map((date, i) => {
        const p = parseDateStr(date)!;
        const inMonth = p.m1 - 1 === month0;
        const isToday = date === today;
        return (
          <div key={date} className={`min-h-[110px] border-r border-line-strong ${!inMonth ? "bg-elevated/60" : isWeekendCol(i) ? WEEKEND_BG : ""}`}>
            <div className="flex items-center px-1.5" style={{ height: HEADER_H }}>
              <span
                className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-semibold tabular-nums ${
                  isToday ? "bg-accent text-white" : inMonth ? "text-fg" : "text-fg-subtle"
                }`}
              >
                {p.d}
              </span>
            </div>
            <div style={{ height: barZoneH }} />
          </div>
        );
      })}

      <div className="flex min-h-[110px] flex-col items-center justify-center gap-2 border-l-[3px] border-green-600 bg-green-50 px-2">
        <span title="Week net — loads picked up this week" className={`text-[20px] font-extrabold tabular-nums ${netTone(weekNetValue)}`}>
          {fmtNet(weekNetValue)}
        </span>
        <div className="h-1.5 w-full max-w-[70px] overflow-hidden rounded-full bg-green-900/10">
          <div className="h-full rounded-full bg-green-600" style={{ width: `${barPct}%` }} />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-y-0 left-0 right-[12.5%]">
        {segments.map((s) => {
          const u = segmentUnits(s);
          const leftPct = (u.start / 7) * 100;
          const widthPct = (u.span / 7) * 100;
          return (
            <Link
              key={s.load.id + ":" + weekStart}
              href={`/tms-v2/loads/${s.load.id}`}
              prefetch={false}
              title={`${s.load.label}${s.load.approx ? " (approx date)" : ""}`}
              className={
                "pointer-events-auto absolute flex items-center overflow-hidden px-1.5 text-[11px] font-semibold leading-none text-white shadow-sm transition-opacity hover:opacity-90 " +
                (s.load.cancelled ? "bg-slate-500 line-through " : "bg-green-700 ") +
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

function MobileWeekRow({
  week,
  month0,
  today,
  loads,
  lanes,
  weekNet,
}: {
  week: string[];
  month0: number;
  today: string;
  loads: LoadBar[];
  lanes: Map<string, number>;
  weekNet: WeekNet | undefined;
}) {
  const weekStart = week[0];
  const segments = weekSegments(week, loads, lanes);
  const barZoneH = laneCountOf(segments) * BAR_H_SM;
  const weekNetValue = weekNetValueOf(weekNet);

  return (
    <div className="border-b border-line-strong last:border-b-0">
      <div className="relative grid grid-cols-7">
        {week.map((date, i) => {
          const p = parseDateStr(date)!;
          const inMonth = p.m1 - 1 === month0;
          const isToday = date === today;
          return (
            <div key={date} className={`min-h-[54px] border-r border-line-strong last:border-r-0 ${!inMonth ? "bg-elevated/60" : isWeekendCol(i) ? WEEKEND_BG : ""}`}>
              <div className="flex items-center justify-center" style={{ height: HEADER_H_SM }}>
                <span
                  className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-0.5 text-[10.5px] font-semibold tabular-nums ${
                    isToday ? "bg-accent text-white" : inMonth ? "text-fg" : "text-fg-subtle"
                  }`}
                >
                  {p.d}
                </span>
              </div>
              <div style={{ height: barZoneH }} />
            </div>
          );
        })}

        <div className="pointer-events-none absolute inset-0">
          {segments.map((s) => {
            const { start, span } = segmentUnits(s);
            const leftPct = (start / 7) * 100;
            const widthPct = (span / 7) * 100;
            return (
              <Link
                key={s.load.id + ":" + weekStart}
                href={`/tms-v2/loads/${s.load.id}`}
                prefetch={false}
                title={`${s.load.label}${s.load.approx ? " (approx date)" : ""}`}
                aria-label={s.load.label}
                className={
                  "pointer-events-auto absolute flex items-center overflow-hidden px-1 text-[9px] font-semibold leading-none text-white shadow-sm transition-opacity active:opacity-70 " +
                  (s.load.cancelled ? "bg-slate-500 line-through " : "bg-green-700 ") +
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
                {span >= 2.5 ? (
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

      <div className="flex items-center justify-end gap-1.5 border-t border-line/60 bg-elevated/40 px-2 py-1">
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-fg-subtle">Week net</span>
        <span className={`text-[12px] font-bold tabular-nums ${netTone(weekNetValue)}`}>{fmtNet(weekNetValue)}</span>
      </div>
    </div>
  );
}
