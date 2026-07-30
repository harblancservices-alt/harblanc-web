"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type {
  MonthBucket,
  PartyStat,
  PayTiming,
  PeriodSummary,
  DeadheadSplit,
  Delta,
  MonthDeltas,
  Takeaway,
  TakeawayTone,
} from "@/lib/dispatch/performance";
import { monthDeltas } from "@/lib/dispatch/performance";
import { usd, rpm } from "@/lib/dispatch/format";
import { NetVsGoalChart, RpmTrendChart, DeadheadBar, GoalRing } from "./charts";
import { BrokerTable, LaneTable, LedgerTable } from "./Tables";

/**
 * Performance — a chart-forward analytics dashboard.
 *
 * Every figure here is aggregated on the SERVER by performance.ts out of loads
 * the server had already costed with the canonical loadDiesel + loadNet pair,
 * so a net on this page is the SAME net the load board and trip cards show.
 * Nothing in this file does money math — it lays out and labels what it's
 * handed, and the only client-side arithmetic is re-selecting which month's
 * pre-computed bucket the KPI row reads (a bucket lookup, not a re-derivation)
 * and subtracting two lib-provided $/mi figures for a month-over-month chip.
 *
 * MONTH SELECTOR — the masthead selector scopes the three MTD KPI cards and the
 * Net-vs-goal readout to any month in the charted window. It does this purely
 * from the `months` buckets the server already sent (each carries net / gross /
 * loads / $/mi) plus `monthDeltas`, the same MoM helper the ledger uses — so no
 * refetch, and a selected month reads exactly as its ledger row does. The
 * per-week PACE figure needs days-remaining, which only exists for the live
 * current month, so it shows an em-dash for any past month.
 *
 * THEME SAFETY (the app-wide rule): colored ink is only legible on FIXED
 * surfaces. The masthead is fixed graphite (white ink); every colored numeral
 * — deltas, goal ring, deadhead splits, the goal sub-row — sits on a fixed
 * bg-inset panel or a fixed tinted pill, so it reads the same on admin-light
 * and admin-dark. Themed cards (bg-card) carry only themed text (text-fg).
 *
 * SCOPE: every load, not just delivered ones — a booked-but-unrun load counts
 * its rate with no odometer readings yet (net ≈ rate), and a TONU load counts
 * its TONU fee instead of a rate. See performance/page.tsx for the exact
 * per-status costing.
 */

export type PerformanceData = {
  /** e.g. "July" — the current (live) month. */
  monthLabel: string;
  /** Days left in the current month incl. today (business tz) — the pace denominator. */
  daysLeft: number;
  /** The actionable readings. Never empty — see `takeaways`. */
  takeaways: Takeaway[];
  currentMonth: PeriodSummary;
  allTime: PeriodSummary;
  /** How the current month moved (still provided; the view recomputes per selection). */
  deltas: MonthDeltas;
  /** Days-to-pay is all-time: one month rarely has enough paid loads to mean anything. */
  pay: PayTiming;
  months: MonthBucket[];
  /** Index into `months` of the current month, or -1 if it isn't in the window. */
  highlightIndex: number;
  monthlyGoal: number;
  brokers: PartyStat[];
  lanes: PartyStat[];
  deadhead: DeadheadSplit;
  /** Owed on delivered-but-unpaid loads (rate) and unpaid TONU loads (fee), all-time. */
  arTotal: number;
};

export function PerformanceView({ data }: { data: PerformanceData }) {
  const {
    daysLeft,
    takeaways,
    allTime,
    months,
    highlightIndex,
    monthlyGoal,
    brokers,
    lanes,
    deadhead,
  } = data;

  // Default the selector to the live current month; fall back to the newest
  // charted month if the current one somehow isn't in the window.
  const defaultIndex =
    highlightIndex >= 0 ? highlightIndex : Math.max(0, months.length - 1);
  const [selIndex, setSelIndex] = useState(defaultIndex);

  // No loads at all — a page of zeroes and empty axes is worse than one
  // honest sentence, so bail to a single card.
  if (allTime.loads === 0) {
    return (
      <Page selector={null}>
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
      </Page>
    );
  }

  const sel = months[selIndex] ?? months[months.length - 1];
  const prev = selIndex > 0 ? months[selIndex - 1] : null;
  const isCurrent = selIndex === highlightIndex;
  const d = monthDeltas(months, selIndex);

  // Loads has no lib delta (it isn't money) — a plain count comparison.
  const loadsDelta =
    prev && sel.loads !== prev.loads
      ? {
          up: sel.loads > prev.loads,
          good: sel.loads >= prev.loads,
          body: String(Math.abs(sel.loads - prev.loads)),
        }
      : null;

  // Goal completion + pace, scoped to the selected month's net.
  const completionPct = monthlyGoal > 0 ? (sel.net / monthlyGoal) * 100 : 0;
  const remaining = Math.max(0, monthlyGoal - sel.net);
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
  // Pace only exists for the live month; a finished month has no week to fill.
  const perWeek = isCurrent ? remaining / weeksLeft : null;

  const netRpmDelta = rpmDelta(sel.netRpm, prev?.netRpm ?? null);
  const grossRpmDelta = rpmDelta(sel.grossRpm, prev?.grossRpm ?? null);

  return (
    <Page
      selector={
        <MonthSelector
          months={months}
          selIndex={selIndex}
          onSelect={setSelIndex}
        />
      }
    >
      {/* 2 — Three headline KPI cards, scoped to the selected month. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Net Profit"
          sub="MTD"
          value={usd(sel.net)}
          loss={sel.net < 0}
          delta={fmtDelta(d.net)}
          priorText={prev ? `vs ${usd(prev.net)} last month` : "no prior month"}
        />
        <KpiCard
          label="Total Loads"
          sub="MTD"
          value={String(sel.loads)}
          delta={loadsDelta}
          priorText={prev ? `vs ${prev.loads} last month` : "no prior month"}
        />
        <KpiCard
          label="Gross Revenue"
          sub="MTD"
          value={usd(sel.gross)}
          delta={fmtDelta(d.gross)}
          priorText={prev ? `vs ${usd(prev.gross)} last month` : "no prior month"}
        />
      </div>

      {/* 3 — Net vs goal. */}
      <Card>
        <CardHead
          title="Net vs goal"
          hint={`Monthly net profit against your ${usd(monthlyGoal)} goal`}
        >
          <div className="text-right">
            <div
              className={
                "text-[20px] font-bold leading-none tabular-nums sm:text-[22px] " +
                (sel.net < 0 ? "text-bad" : "text-fg")
              }
            >
              {usd(sel.net)}
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
            highlightIndex={selIndex}
          />

          {/* Goal-pace sub-row, on a fixed inset so its green/orange/blue read
              on both themes. */}
          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="flex items-center gap-3.5 rounded-xl bg-inset px-4 py-3 shadow-e1">
              <GoalRing pct={completionPct} size={64} loss={sel.net < 0} />
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
          hint="Average $/mi by month, over loaded miles"
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
                highlightIndex={selIndex}
              />
            )}
            <div className="grid grid-cols-2 gap-2.5 lg:w-[188px] lg:grid-cols-1">
              <RateStat
                label="Net $/mi"
                dot="bg-ok"
                value={rpm(sel.netRpm)}
                delta={netRpmDelta}
              />
              <RateStat
                label="Gross $/mi"
                dot="bg-steel"
                value={rpm(sel.grossRpm)}
                delta={grossRpmDelta}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* 5 — Deadhead, all time. */}
      <Card>
        <CardHead
          title="Deadhead — loaded vs empty miles"
          hint="All time · empty miles burn fuel and earn nothing"
        >
          <a
            href="#ledger"
            className="shrink-0 text-[11.5px] font-semibold text-info transition-colors hover:text-info-hover"
          >
            View details
          </a>
        </CardHead>
        <div className="p-4 sm:p-5">
          {deadhead.total === 0 ? (
            <Empty>No odometer readings logged yet, so miles can&rsquo;t be split.</Empty>
          ) : (
            <DeadheadBar
              loaded={deadhead.loaded}
              deadhead={deadhead.deadhead}
              total={deadhead.total}
            />
          )}
        </div>
      </Card>

      {/* 6 — Top brokers + top lanes. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <RankCard
          title="Top Brokers"
          hint="All time by Net"
          viewAllHref="#brokers-all"
          rows={brokers.slice(0, 5).map((b) => ({
            key: b.name,
            name: b.name,
            value: usd(b.net),
          }))}
          empty="No brokers to rank yet."
        />
        <RankCard
          title="Top Lanes"
          hint="All time by Net $/mi"
          viewAllHref="#lanes-all"
          rows={lanes.slice(0, 5).map((l) => ({
            key: l.name,
            name: l.name,
            value: `${rpm(l.netRpm)}/mi`,
          }))}
          empty="Lanes need loaded miles to rank."
        />
      </div>

      {/* Insights strip — the sentence version of the numbers above. Kept
          compact; the reference is chart-led, so this rides quietly along. */}
      <Takeaways items={takeaways} />

      {/* Full sortable leaderboards + ledger — the "View all" / "View details"
          targets, so nothing the previous page did is lost. */}
      <div id="brokers-all" className="scroll-mt-4">
        <Card>
          <CardHead
            title="Broker leaderboard"
            hint="All time · tap any column header to re-rank"
          />
          <BrokerTable rows={brokers} />
        </Card>
      </div>
      <div id="lanes-all" className="scroll-mt-4">
        <Card>
          <CardHead
            title="Lane leaderboard"
            hint="All time · sorted by net $/mi — the rate question, not the volume one"
          />
          <LaneTable rows={lanes} />
        </Card>
      </div>
      <div id="ledger" className="scroll-mt-4">
        <Card>
          <CardHead
            title="Monthly ledger"
            hint={`Last ${months.length} month${months.length === 1 ? "" : "s"}, newest first · MTD is still in progress`}
          />
          <LedgerTable rows={months} currentKey={months[highlightIndex]?.key ?? null} />
        </Card>
      </div>
    </Page>
  );
}

// -------------------------------------------------------------- month selector

/**
 * The masthead's month picker. A graphite button that drops a menu of the
 * charted months, newest first. Selecting one re-scopes the KPI row and the
 * goal readout — no navigation, no refetch.
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

/** MoM move of a $/mi figure — a plain subtraction of two lib-provided rates. */
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
      title={`${cue.up ? "Up" : "Down"} ${cue.body} vs last month`}
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
}: {
  label: string;
  dot: string;
  value: string;
  delta: ReturnType<typeof rpmDelta>;
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
            <span className="font-normal text-ink-3"> vs last mo</span>
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
      <CardHead title="Insights" hint="Plain-English readings of the numbers above" />
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
 * The page shell + the navy masthead. The masthead is fixed graphite so its
 * white title and the selector read the same on both admin themes, matching the
 * app's other dark section headers.
 */
function Page({ children, selector }: { children: ReactNode; selector: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-fg">
      <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="mb-4 overflow-hidden rounded-2xl bg-graphite px-4 py-5 shadow-e2 sm:px-7 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-on-dark-dim">
                Insights
              </p>
              <h1 className="mt-1.5 text-[24px] font-bold leading-none tracking-[-0.01em] text-white sm:text-[28px]">
                Performance
              </h1>
              <p className="mt-2 max-w-md text-[12.5px] leading-snug text-on-dark-dim">
                Real-time insights into your business performance — every
                load, net of diesel, factoring and expenses.
              </p>
            </div>
            {selector ? <div className="shrink-0">{selector}</div> : null}
          </div>
        </header>
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
