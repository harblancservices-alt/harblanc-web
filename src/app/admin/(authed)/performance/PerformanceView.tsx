"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import type {
  MonthBucket,
  Delta,
  MonthDeltas,
  Takeaway,
  TakeawayTone,
  PerfLoad,
} from "@/lib/dispatch/performance";
import {
  monthlyBuckets,
  brokerStats,
  laneStats,
  deadheadSplit,
  summarize,
  monthKey,
  deltasBetween,
  takeaways,
} from "@/lib/dispatch/performance";
import { usd, rpm } from "@/lib/dispatch/format";
import { parseDateStr, addDays, daysBetween, monthName, toDateStr } from "@/lib/dispatch/calendar";
import { NetVsGoalChart, RpmTrendChart, DeadheadBar, GoalRing } from "./charts";
import { BrokerTable, LaneTable, LedgerTable } from "./Tables";

/**
 * Performance — a chart-forward analytics dashboard.
 *
 * The server (page.tsx) ships the full `PerfLoad[]` array — every load,
 * already costed through the canonical loadDiesel + loadNet pair, so a net on
 * this page is the SAME net the load board and the Calendar show. Every
 * aggregation (month buckets, KPI totals, broker/lane leaderboards, deadhead
 * split) happens HERE, client-side, off that one array — the month/range
 * picker has to re-slice the data interactively with no refetch, the same
 * pattern the Calendar already uses (CalendarView computes weekNets from a
 * `loads` prop the server sends once).
 *
 * ATTRIBUTION — every load's `year`/`month`/`date` were computed server-side
 * by goalMonthParts(closeOutDate(load)): pickup_date first, falling back to
 * delivery_date then created_at, with NO shift — identical to the Calendar's
 * resolveSpan/weekNets, so a load lands in the same month here as it does on
 * the Calendar.
 *
 * PERIOD SCOPING — a MONTH picker (trailing 12 months) or a custom day-range
 * picker selects the active period; whichever is active scopes the three KPI
 * cards, the Net-vs-goal readout, the Rate-trend stat panel, Deadhead, Top
 * Brokers/Lanes and both full leaderboards. The two trend CHARTS (Net vs
 * goal, Rate trend) keep drawing their familiar trailing-12-month backdrop
 * regardless of mode — a custom range doesn't decompose into monthly bars —
 * but the highlighted bar/line-point and every number beside them scope to
 * the selection. The Monthly ledger stays a by-month history table, always
 * off the full trailing-12 buckets, per the same reasoning.
 *
 * The Insights strip is the one exception: it always reads off ALL loads
 * with the LIVE current month as its goal-pace context, independent of
 * whatever period the picker is browsing — "am I on pace this month" doesn't
 * change because you scrolled the KPI cards back to April.
 *
 * THEME SAFETY (the app-wide rule): colored ink is only legible on FIXED
 * surfaces. Every colored numeral — deltas, goal ring, deadhead splits, the
 * goal sub-row — sits on a fixed bg-inset panel or a fixed tinted pill, so it
 * reads the same on admin-light and admin-dark. Themed cards (bg-card) carry
 * only themed text (text-fg).
 *
 * SCOPE: every load, not just delivered ones — a booked-but-unrun load counts
 * its rate with no odometer readings yet (net ≈ rate), and a TONU load counts
 * its TONU fee instead of a rate. See performance/page.tsx for the exact
 * per-status costing.
 */

export type PerformanceData = {
  /** Every non-deleted load, pre-costed and pre-attributed by the server. */
  loads: PerfLoad[];
  monthlyGoal: number;
  /** Owed on delivered-but-unpaid loads (rate) and unpaid TONU loads (fee), all-time. */
  arTotal: number;
  /** "YYYY-MM-DD", business timezone (America/Chicago) — the server's "now". */
  today: string;
};

const MONTH_WINDOW = 12;

const NO_DELTAS: MonthDeltas = {
  net: null,
  gross: null,
  netRpm: null,
  grossRpm: null,
  margin: null,
  deadhead: null,
};

type PeriodMode = "month" | "range";
type DateRange = { from: string; to: string };

/** Days left in the calendar month `today` falls in, incl. today. */
function daysLeftInCurrentMonth(today: string): number {
  const p = parseDateStr(today);
  if (!p) return 1;
  // Day 0 of the NEXT month (m1 is already 1-based, so this is the trick).
  const daysInMonth = new Date(Date.UTC(p.y, p.m1, 0)).getUTCDate();
  return Math.max(1, daysInMonth - p.d + 1);
}

/** "Jul 26" — the compact form used in a custom range's label. */
function fmtShortDate(dateStr: string): string {
  const p = parseDateStr(dateStr);
  if (!p) return dateStr;
  return `${monthName(p.m1 - 1).slice(0, 3)} ${p.d}`;
}

export function PerformanceView({ data }: { data: PerformanceData }) {
  const { loads, monthlyGoal, arTotal, today } = data;
  const todayParts = parseDateStr(today) ?? { y: 2026, m1: 1, d: 1 };

  // Trailing 12-month buckets off ALL loads — the ledger's history and both
  // trend charts' backdrops. Computed once; the period picker never refetches
  // or reshapes this, only what's read out of it.
  const months = useMemo(() => monthlyBuckets(loads, MONTH_WINDOW), [loads]);
  const curKey = monthKey(todayParts.y, todayParts.m1 - 1);
  const liveIndex = months.findIndex((b) => b.key === curKey);
  const defaultIndex = liveIndex >= 0 ? liveIndex : Math.max(0, months.length - 1);

  const [mode, setMode] = useState<PeriodMode>("month");
  const [selIndex, setSelIndex] = useState(defaultIndex);
  const [range, setRange] = useState<DateRange>(() => ({
    from: toDateStr(todayParts.y, todayParts.m1, 1),
    to: today,
  }));

  const normRange = useMemo<DateRange | null>(() => {
    if (!range.from || !range.to) return null;
    return range.from <= range.to
      ? { from: range.from, to: range.to }
      : { from: range.to, to: range.from };
  }, [range]);

  const sel = months[selIndex] ?? null;

  // The selected period's loads, and the equal-length period immediately
  // before it (for the MoM-style delta chips). Month mode compares adjacent
  // calendar months; range mode compares against the same number of days
  // immediately preceding the range — "vs the previous 2 weeks" for a
  // 2-week range.
  const periodLoads = useMemo(() => {
    if (mode === "range") {
      if (!normRange) return [];
      return loads.filter(
        (l) => l.date != null && l.date >= normRange.from && l.date <= normRange.to,
      );
    }
    if (!sel) return [];
    return loads.filter((l) => l.year === sel.year && l.month === sel.month);
  }, [mode, normRange, loads, sel]);

  const prevPeriodLoads = useMemo(() => {
    if (mode === "range") {
      if (!normRange) return null;
      const span = daysBetween(normRange.from, normRange.to) + 1; // inclusive
      const prevTo = addDays(normRange.from, -1);
      const prevFrom = addDays(prevTo, -(span - 1));
      return loads.filter(
        (l) => l.date != null && l.date >= prevFrom && l.date <= prevTo,
      );
    }
    if (selIndex <= 0) return null;
    const prev = months[selIndex - 1];
    return loads.filter((l) => l.year === prev.year && l.month === prev.month);
  }, [mode, normRange, loads, months, selIndex]);

  const curSummary = useMemo(() => summarize(periodLoads), [periodLoads]);
  const prevSummary = useMemo(
    () => (prevPeriodLoads ? summarize(prevPeriodLoads) : null),
    [prevPeriodLoads],
  );
  const d = prevSummary ? deltasBetween(curSummary, prevSummary) : NO_DELTAS;

  // Loads has no lib delta (it isn't money) — a plain count comparison.
  const loadsDelta =
    prevSummary && curSummary.loads !== prevSummary.loads
      ? {
          up: curSummary.loads > prevSummary.loads,
          good: curSummary.loads >= prevSummary.loads,
          body: String(Math.abs(curSummary.loads - prevSummary.loads)),
        }
      : null;

  const periodBrokers = useMemo(() => brokerStats(periodLoads, 50), [periodLoads]);
  const periodLanes = useMemo(() => laneStats(periodLoads, 50), [periodLoads]);
  const periodDeadhead = useMemo(() => deadheadSplit(periodLoads), [periodLoads]);

  // The Insights strip always reads the LIVE current month, independent of
  // what period the KPI row is browsing — see the file-level doc comment.
  const takeawayItems = useMemo(
    () =>
      takeaways(loads, {
        year: todayParts.y,
        month: todayParts.m1 - 1,
        monthlyGoal,
        daysRemaining: daysLeftInCurrentMonth(today),
      }),
    [loads, todayParts.y, todayParts.m1, monthlyGoal, today],
  );

  const periodNoun = mode === "month" ? "month" : "period";
  const priorLabel = mode === "month" ? "last month" : "the prior period";
  const periodLabel =
    mode === "range"
      ? normRange
        ? `${fmtShortDate(normRange.from)} – ${fmtShortDate(normRange.to)}`
        : "Custom range"
      : (sel?.longLabel ?? "—");

  // No loads at all — a page of zeroes and empty axes is worse than one
  // honest sentence, so bail to a single card.
  if (loads.length === 0) {
    return (
      <Shell actions={null}>
        <div className="rounded-2xl border border-dashed border-line-strong bg-card px-4 py-14 text-center shadow-e1">
          <p className="text-[15px] font-semibold text-fg">No loads yet.</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-fg-muted">
            This dashboard builds itself out of your loads — rates, odometer
            readings and pay dates. Add a load, and the numbers start here.
          </p>
          <Link
            href="/admin/dispatch/loads"
            className="mt-5 inline-flex items-center rounded-lg border border-line-strong bg-canvas px-4 py-2 text-[13px] font-semibold text-fg shadow-e1 transition-colors hover:border-accent hover:text-accent"
          >
            Go to the load board
          </Link>
        </div>
      </Shell>
    );
  }

  const isCurrentMonth = mode === "month" && selIndex === liveIndex;

  // Goal completion + pace, scoped to the selected period's net.
  const completionPct = monthlyGoal > 0 ? (curSummary.net / monthlyGoal) * 100 : 0;
  const remaining = Math.max(0, monthlyGoal - curSummary.net);
  const daysLeft = daysLeftInCurrentMonth(today);
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
  // Pace only makes sense for the live, still-in-progress month — a past
  // month or an arbitrary custom range has no "week to fill" to pace against.
  const perWeek = isCurrentMonth ? remaining / weeksLeft : null;

  const netRpmDelta = rpmDelta(curSummary.netRpm, prevSummary?.netRpm ?? null);
  const grossRpmDelta = rpmDelta(curSummary.grossRpm, prevSummary?.grossRpm ?? null);

  return (
    <Shell
      actions={
        <PeriodControls
          mode={mode}
          onMode={setMode}
          months={months}
          selIndex={selIndex}
          onSelectMonth={setSelIndex}
          range={range}
          onRange={setRange}
        />
      }
    >
      {/* 2 — Three headline KPI cards, scoped to the selected period. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Net Profit"
          sub={mode === "month" ? "MTD" : "RANGE"}
          value={usd(curSummary.net)}
          loss={curSummary.net < 0}
          delta={fmtDelta(d.net)}
          priorText={
            prevSummary ? `vs ${usd(prevSummary.net)} ${priorLabel}` : `no prior ${periodNoun}`
          }
        />
        <KpiCard
          label="Total Loads"
          sub={mode === "month" ? "MTD" : "RANGE"}
          value={String(curSummary.loads)}
          delta={loadsDelta}
          priorText={
            prevSummary ? `vs ${prevSummary.loads} ${priorLabel}` : `no prior ${periodNoun}`
          }
        />
        <KpiCard
          label="Gross Revenue"
          sub={mode === "month" ? "MTD" : "RANGE"}
          value={usd(curSummary.gross)}
          delta={fmtDelta(d.gross)}
          priorText={
            prevSummary ? `vs ${usd(prevSummary.gross)} ${priorLabel}` : `no prior ${periodNoun}`
          }
        />
      </div>

      {/* 3 — Net vs goal. */}
      <Card>
        <CardHead
          title="Net vs goal"
          hint={`${periodLabel} against your ${usd(monthlyGoal)} monthly goal`}
        >
          <div className="text-right">
            <div
              className={
                "text-[20px] font-bold leading-none tabular-nums sm:text-[22px] " +
                (curSummary.net < 0 ? "text-bad" : "text-fg")
              }
            >
              {usd(curSummary.net)}
            </div>
            <div className="mt-1 text-[11.5px] font-semibold tabular-nums text-fg-subtle">
              {Math.round(completionPct)}% of goal
            </div>
          </div>
        </CardHead>
        <div className="p-4 sm:p-5">
          <NetVsGoalChart
            data={months.map((b) => ({ key: b.key, label: b.label, value: b.net }))}
            goal={monthlyGoal}
            highlightIndex={mode === "month" ? selIndex : -1}
          />

          {/* Goal-pace sub-row, on a fixed inset so its green/orange/blue read
              on both themes. */}
          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="flex items-center gap-3.5 rounded-xl bg-inset px-4 py-3 shadow-e1">
              <GoalRing pct={completionPct} size={64} loss={curSummary.net < 0} />
              <div className="min-w-0">
                <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
                  Goal Completion
                </div>
                <div className="mt-1 text-[17px] font-bold leading-none tabular-nums text-ink">
                  {Math.round(completionPct)}%
                </div>
              </div>
            </div>
            <PaceStat
              label="Remaining to Goal"
              value={usd(remaining)}
              tone="text-warn"
            />
            <PaceStat
              label="Avg Needed Per Week"
              value={perWeek != null ? `${usd(perWeek)}/wk` : "—"}
              tone="text-info"
              hint={
                perWeek != null
                  ? `${weeksLeft} week${weeksLeft === 1 ? "" : "s"} left`
                  : mode === "range"
                    ? "custom range"
                    : "past month"
              }
            />
          </div>
        </div>
      </Card>

      {/* 4 — Rate trend. */}
      <Card>
        <CardHead
          title="Rate trend"
          hint={`${periodLabel} · $/mi over loaded miles`}
        />
        <div className="p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:gap-6">
            {months.length < 2 ? (
              <Empty>
                A trend needs at least two months —{" "}
                {months.length === 1 ? "there's one so far." : "there are none yet."}
              </Empty>
            ) : (
              <RpmTrendChart
                net={months.map((b) => ({
                  key: `n-${b.key}`,
                  label: b.label,
                  value: b.netRpm,
                }))}
                gross={months.map((b) => ({
                  key: `g-${b.key}`,
                  label: b.label,
                  value: b.grossRpm,
                }))}
                highlightIndex={mode === "month" ? selIndex : -1}
              />
            )}
            <div className="grid grid-cols-2 gap-2.5 lg:w-[188px] lg:grid-cols-1">
              <RateStat
                label="Net $/mi"
                dot="bg-ok"
                value={rpm(curSummary.netRpm)}
                delta={netRpmDelta}
                suffix={mode === "month" ? "vs last mo" : "vs prior period"}
              />
              <RateStat
                label="Gross $/mi"
                dot="bg-steel"
                value={rpm(curSummary.grossRpm)}
                delta={grossRpmDelta}
                suffix={mode === "month" ? "vs last mo" : "vs prior period"}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* 5 — Deadhead, scoped to the selected period. */}
      <Card>
        <CardHead
          title="Deadhead — loaded vs empty miles"
          hint={`${periodLabel} · empty miles burn fuel and earn nothing`}
        >
          <a
            href="#ledger"
            className="shrink-0 text-[11.5px] font-semibold text-info transition-colors hover:text-info-hover"
          >
            View details
          </a>
        </CardHead>
        <div className="p-4 sm:p-5">
          {periodDeadhead.total === 0 ? (
            <Empty>No odometer readings logged yet, so miles can&rsquo;t be split.</Empty>
          ) : (
            <DeadheadBar
              loaded={periodDeadhead.loaded}
              deadhead={periodDeadhead.deadhead}
              total={periodDeadhead.total}
            />
          )}
        </div>
      </Card>

      {/* 6 — Top brokers + top lanes, scoped to the selected period. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <RankCard
          title="Top Brokers"
          hint={`${periodLabel} by Net`}
          viewAllHref="#brokers-all"
          rows={periodBrokers.slice(0, 5).map((b) => ({
            key: b.name,
            name: b.name,
            value: usd(b.net),
          }))}
          empty="No brokers to rank yet."
        />
        <RankCard
          title="Top Lanes"
          hint={`${periodLabel} by Net $/mi`}
          viewAllHref="#lanes-all"
          rows={periodLanes.slice(0, 5).map((l) => ({
            key: l.name,
            name: l.name,
            value: `${rpm(l.netRpm)}/mi`,
          }))}
          empty="Lanes need loaded miles to rank."
        />
      </div>

      {/* Insights strip — always this month, regardless of the period picker
          (see the file-level doc comment). */}
      <Takeaways items={takeawayItems} />

      {/* Full sortable leaderboards + ledger — the "View all" / "View details"
          targets, scoped to the selected period. */}
      <div id="brokers-all" className="scroll-mt-4">
        <Card>
          <CardHead
            title="Broker leaderboard"
            hint={`${periodLabel} · tap any column header to re-rank`}
          />
          <BrokerTable rows={periodBrokers} />
        </Card>
      </div>
      <div id="lanes-all" className="scroll-mt-4">
        <Card>
          <CardHead
            title="Lane leaderboard"
            hint={`${periodLabel} · sorted by net $/mi — the rate question, not the volume one`}
          />
          <LaneTable rows={periodLanes} />
        </Card>
      </div>
      <div id="ledger" className="scroll-mt-4">
        <Card>
          <CardHead
            title="Monthly ledger"
            hint={`Last ${months.length} month${months.length === 1 ? "" : "s"}, newest first · MTD is still in progress`}
          />
          <LedgerTable rows={months} currentKey={months[liveIndex]?.key ?? null} />
        </Card>
      </div>
    </Shell>
  );
}

// -------------------------------------------------------------- period controls

/**
 * The header's period picker: a Month/Range toggle, then either the trailing-
 * 12-month dropdown or a From/To custom range. Solid dark-graphite chrome
 * (matching the Calendar's month-nav buttons) — no faint grey, high contrast
 * on the page's light background.
 */
function PeriodControls({
  mode,
  onMode,
  months,
  selIndex,
  onSelectMonth,
  range,
  onRange,
}: {
  mode: PeriodMode;
  onMode: (m: PeriodMode) => void;
  months: MonthBucket[];
  selIndex: number;
  onSelectMonth: (i: number) => void;
  range: DateRange;
  onRange: (r: DateRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-graphite-line bg-graphite-2 p-0.5">
        <button
          type="button"
          onClick={() => onMode("month")}
          aria-pressed={mode === "month"}
          className={
            "rounded px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.04em] transition-colors max-sm:min-h-[40px] max-sm:px-3.5 " +
            (mode === "month" ? "bg-accent text-white shadow-e1" : "text-white/70 hover:text-white")
          }
        >
          Month
        </button>
        <button
          type="button"
          onClick={() => onMode("range")}
          aria-pressed={mode === "range"}
          className={
            "rounded px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.04em] transition-colors max-sm:min-h-[40px] max-sm:px-3.5 " +
            (mode === "range" ? "bg-accent text-white shadow-e1" : "text-white/70 hover:text-white")
          }
        >
          Range
        </button>
      </div>

      {mode === "month" ? (
        <MonthSelector months={months} selIndex={selIndex} onSelect={onSelectMonth} />
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            value={range.from}
            onChange={(e) => onRange({ ...range, from: e.target.value })}
            aria-label="From date (Central time)"
            className="h-9 w-[132px] appearance-none rounded-md border border-line-strong bg-card px-2 text-[13px] font-semibold text-ink outline-none [color-scheme:light] focus:border-accent focus:ring-2 focus:ring-accent/40 sm:appearance-auto max-sm:h-11 max-sm:min-w-0 max-sm:flex-1"
          />
          <span className="text-[12px] font-bold text-white/70">–</span>
          <input
            type="date"
            value={range.to}
            onChange={(e) => onRange({ ...range, to: e.target.value })}
            aria-label="To date (Central time)"
            className="h-9 w-[132px] appearance-none rounded-md border border-line-strong bg-card px-2 text-[13px] font-semibold text-ink outline-none [color-scheme:light] focus:border-accent focus:ring-2 focus:ring-accent/40 sm:appearance-auto max-sm:h-11 max-sm:min-w-0 max-sm:flex-1"
          />
          <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-white/70">
            CST
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The trailing-12-month picker. A graphite button that drops a menu of the
 * charted months, newest first. Selecting one re-scopes the KPI row and every
 * period-aware section below it — no navigation, no refetch.
 */
function MonthSelector({
  months,
  selIndex,
  onSelect,
}: {
  months: MonthBucket[];
  selIndex: number;
  onSelect: (i: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = months[selIndex];
  // Newest first for the menu, but keep the real index to select on.
  const items = months.map((b, i) => ({ b, i })).reverse();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-graphite-line bg-graphite-2 px-3 py-2 text-[13px] font-semibold text-white shadow-e1 transition-colors hover:border-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
      >
        <CalendarGlyph className="h-4 w-4 text-on-dark-dim" />
        <span className="tabular-nums">{selected?.longLabel ?? "—"}</span>
        <ChevronGlyph
          className={"h-4 w-4 text-on-dark-dim transition-transform " + (open ? "rotate-180" : "")}
        />
      </button>

      {open ? (
        <>
          {/* Click-away backdrop. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <ul
            role="listbox"
            className="absolute right-0 z-50 mt-1.5 max-h-72 w-44 overflow-auto rounded-xl border border-line-strong bg-card p-1 shadow-e3"
          >
            {items.map(({ b, i }) => {
              const active = i === selIndex;
              return (
                <li key={b.key} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(i);
                      setOpen(false);
                    }}
                    className={
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors " +
                      (active
                        ? "bg-inset font-bold text-ink"
                        : "font-semibold text-fg hover:bg-canvas")
                    }
                  >
                    <span className="tabular-nums">{b.longLabel}</span>
                    <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
                      {usd(b.net)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

// --------------------------------------------------------------- KPI + deltas

/** A normalized delta cue: which way, whether it's good, and the magnitude text. */
type DeltaCue = { up: boolean; good: boolean; body: string } | null;

/** Turn a lib `Delta` (pct / usd / rpm / pts) into a display cue. */
function fmtDelta(delta: Delta | null): DeltaCue {
  if (!delta) return null;
  const mag = Math.abs(delta.value);
  const body =
    delta.kind === "pct"
      ? `${mag.toFixed(0)}%`
      : delta.kind === "usd"
        ? usd(mag)
        : delta.kind === "rpm"
          ? rpm(mag)
          : `${mag.toFixed(1)} pts`;
  return { up: delta.value > 0, good: delta.good, body };
}

/** MoM-style move of a $/mi figure — a plain subtraction of two lib-provided rates. */
function rpmDelta(
  cur: number | null,
  prev: number | null,
): { up: boolean; good: boolean; dollars: string; pctText: string | null } | null {
  if (cur == null || prev == null) return null;
  const v = cur - prev;
  if (Math.abs(v) < 0.005) return null; // sub-penny is not a move
  const p = prev !== 0 ? (Math.abs(v) / Math.abs(prev)) * 100 : null;
  return {
    up: v > 0,
    good: v > 0, // higher $/mi is the win
    dollars: rpm(Math.abs(v)),
    pctText: p != null ? `${p.toFixed(0)}%` : null,
  };
}

/** A colored MoM pill on a fixed tint — legible on both admin themes. */
function DeltaPill({ cue }: { cue: NonNullable<DeltaCue> }) {
  return (
    <span
      className={
        "inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 font-mono text-[10.5px] font-bold tabular-nums " +
        (cue.good ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad")
      }
      title={`${cue.up ? "Up" : "Down"} ${cue.body}`}
    >
      <span aria-hidden>{cue.up ? "▲" : "▼"}</span>
      {cue.up ? "+" : "−"}
      {cue.body}
    </span>
  );
}

function KpiCard({
  label,
  sub,
  value,
  loss = false,
  delta,
  priorText,
}: {
  label: string;
  sub: string;
  value: string;
  loss?: boolean;
  delta: DeltaCue;
  priorText: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-e2 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
          {label}
        </span>
        <span className="rounded-full bg-inset px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.1em] leading-none text-ink-3">
          {sub}
        </span>
        {loss ? (
          <span className="rounded-full bg-bad-bg px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.08em] leading-none text-bad">
            Loss
          </span>
        ) : null}
      </div>
      <div
        className={
          "mt-2.5 truncate text-[28px] font-bold leading-none tracking-[-0.01em] tabular-nums sm:text-[32px] " +
          (loss ? "text-bad" : "text-fg")
        }
      >
        {value}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta ? <DeltaPill cue={delta} /> : null}
        <span className="text-[11.5px] text-fg-subtle">{priorText}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- small stat tiles

function PaceStat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-inset px-4 py-3 shadow-e1">
      <div className="truncate text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </div>
      <div className={"mt-1 truncate text-[19px] font-bold leading-none tabular-nums " + tone}>
        {value}
      </div>
      {hint ? (
        <div className="mt-1 truncate text-[10px] text-ink-3">{hint}</div>
      ) : null}
    </div>
  );
}

/** A $/mi stat with its series dot + a MoM line, on a fixed inset panel. */
function RateStat({
  label,
  dot,
  value,
  delta,
  suffix,
}: {
  label: string;
  dot: string;
  value: string;
  delta: ReturnType<typeof rpmDelta>;
  suffix: string;
}) {
  return (
    <div className="rounded-xl bg-inset px-3.5 py-3 shadow-e1">
      <div className="flex items-center gap-1.5">
        <span aria-hidden className={"h-2 w-2 shrink-0 rounded-full " + dot} />
        <span className="truncate font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-ink-3">
          {label}
        </span>
      </div>
      <div className="mt-1.5 text-[20px] font-bold leading-none tabular-nums text-ink">
        {value}
      </div>
      <div className="mt-1.5 text-[10.5px] font-semibold tabular-nums">
        {delta ? (
          <span className={delta.good ? "text-ok" : "text-bad"}>
            <span aria-hidden>{delta.up ? "▲ " : "▼ "}</span>
            {delta.up ? "+" : "−"}
            {delta.dollars}
            {delta.pctText ? ` (${delta.pctText})` : ""}
            <span className="font-normal text-ink-3"> {suffix}</span>
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- rank cards

function RankCard({
  title,
  hint,
  viewAllHref,
  rows,
  empty,
}: {
  title: string;
  hint: string;
  viewAllHref: string;
  rows: { key: string; name: string; value: string }[];
  empty: string;
}) {
  return (
    <Card>
      <CardHead title={title} hint={hint}>
        <a
          href={viewAllHref}
          className="shrink-0 text-[11.5px] font-semibold text-info transition-colors hover:text-info-hover"
        >
          View all
        </a>
      </CardHead>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-fg-muted">{empty}</div>
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((r, i) => (
            <li key={r.key} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-inset font-mono text-[11px] font-bold tabular-nums text-ink-3">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
                {r.name}
              </span>
              <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-ok">
                {r.value}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// --------------------------------------------------------------- takeaways

function dotClass(tone: TakeawayTone): string {
  return tone === "good"
    ? "bg-ok"
    : tone === "warn"
      ? "bg-warn"
      : tone === "bad"
        ? "bg-bad"
        : "bg-fg-subtle";
}

function Takeaways({ items }: { items: Takeaway[] }) {
  return (
    <Card>
      <CardHead title="Insights" hint="Plain-English readings of this month's numbers" />
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5 px-4 py-2.5">
            <span
              className={"mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full " + dotClass(item.tone)}
              aria-hidden="true"
            />
            <p className="text-[12.5px] leading-[1.45] text-fg-muted">
              {item.segs.map((s, i) =>
                s.bold ? (
                  <strong key={i} className="font-bold tabular-nums text-fg">
                    {s.text}
                  </strong>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ------------------------------------------------------------------ chrome

/**
 * The page shell — a light PageHeader (red "Insights" eyebrow, dark title on
 * the normal light background) matching Calendar/Trips, with the period
 * controls in its actions slot. No dark/graphite masthead block.
 */
function Shell({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Insights"
          title="Performance"
          className="mb-1.5"
          actions={actions}
        />
        <p className="mb-3 max-w-md text-[13px] text-fg-muted">
          Real-time insights into your business — every load, net of diesel,
          factoring and expenses.
        </p>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

/** A premium card: rounded-2xl, hairline, soft e2 shadow. */
function Card({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-e2">
      {children}
    </section>
  );
}

/** A card's header row — title + hint on the left, an optional control right. */
function CardHead({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-[13.5px] font-bold tracking-[-0.01em] text-fg">{title}</h2>
        {hint ? (
          <p className="mt-0.5 text-[11.5px] leading-snug text-fg-subtle">{hint}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-inset px-3 py-8 text-center text-[12px] text-ink-3">
      {children}
    </div>
  );
}

// ------------------------------------------------------------------- glyphs

function CalendarGlyph({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function ChevronGlyph({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
