import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { Button } from "@/components/tms-v2/ui/Button";
import { Card } from "@/components/tms-v2/ui/Card";
import { ProgressBar } from "@/components/tms-v2/ui/ProgressBar";
import { GoalPaceCard } from "@/components/tms-v2/ui/GoalPaceCard";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { formatMoney } from "@/lib/domain/money";
import { getAnalyticsLoads, getAnalyticsTrips, getNetGoals } from "@/lib/data/analytics";
import {
  summarize,
  brokerStats,
  laneStats,
  laneKey,
  deadheadSplit,
  deltasBetween,
  takeaways,
  comparisonTakeaway,
  rangeTrendBuckets,
  type TakeawayContext,
} from "@/lib/dispatch/performance";
import { rpm, pct } from "@/lib/dispatch/format";
import { currentPeriod } from "@/lib/domain/attribution";
import { daysLeftInMonth, daysLeftInYear, dayOfYear, currentBusinessDate } from "@/lib/dispatch/goal-month";
import { centralDateKey } from "@/lib/domain/dates";
import { computeGoalPace } from "@/lib/domain/goal-pace";
import { resolvePerformanceView, monthParam, shiftPeriod, type PerformanceView } from "./_lib/range";
import { isPartySortKey, sortPartyStats, type PartySortKey } from "./_lib/party-sort";
import { toLoadTableRows, filterLoadRows, sortLoadRows, isLoadSortKey, type LoadSortKey } from "./_lib/load-table";
import { DeltaChip } from "./_components/DeltaChip";
import { PartyBarChart } from "./_components/PartyBarChart";
import { PartyTable } from "./_components/PartyTable";
import { PartyDrillDown } from "./_components/PartyDrillDown";
import { LoadPerformanceTable } from "./_components/LoadPerformanceTable";
import { TripPerformanceTable } from "./_components/TripPerformanceTable";
import { DeadheadSplitBar } from "./_components/DeadheadSplitBar";
import { InsightsStrip } from "./_components/InsightsStrip";
import { TrendChart, type TrendPoint } from "./_components/TrendChart";
import { DualTrendChart, type DualTrendPoint } from "./_components/DualTrendChart";
import { RateTrendChart, type RateTrendPoint } from "./_components/RateTrendChart";

const LOAD_PAGE_SIZE = 50;

// Server-aggregated, range-scoped rollup — never the full load history
// re-aggregated client-side (v2-design.md §23's fixed weakness).
export const dynamic = "force-dynamic";

const PILL = "shrink-0 rounded-full border border-line-strong px-3 py-1.5 text-[13px] text-fg hover:bg-elevated";
const PILL_ACTIVE = "shrink-0 rounded-full border border-accent bg-accent/10 px-3 py-1.5 text-[13px] font-medium text-accent";
const NAV_ARROW = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-fg hover:bg-elevated";
const GRANULARITY_LABEL: Record<PerformanceView["granularity"], string> = { week: "weekly", month: "monthly" };

type PerformanceSearchParams = {
  month?: string;
  year?: string;
  range?: string;
  from?: string;
  to?: string;
  brokerSort?: string;
  brokerDir?: string;
  laneSort?: string;
  laneDir?: string;
  broker?: string;
  lane?: string;
  loadSort?: string;
  loadDir?: string;
  loadPage?: string;
  q?: string;
};

type PageProps = { searchParams: Promise<PerformanceSearchParams> };

/** Preserves every other param while overriding the given ones — the same
 * pattern Expenses' ledger uses for its own sort/filter links. */
function buildHref(sp: PerformanceSearchParams, overrides: Partial<PerformanceSearchParams>): string {
  const merged: PerformanceSearchParams = { ...sp, ...overrides };
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== "") usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `/tms-v2/performance?${qs}` : "/tms-v2/performance";
}

/** A range-switching link: clears every OTHER range-defining param (and
 * pagination) before applying the new one — "the selected range drives the
 * ENTIRE page" means switching presets can't leave a stale `month=`/`from=`
 * behind to silently win on the next request. */
function rangeHref(sp: PerformanceSearchParams, overrides: Partial<PerformanceSearchParams>): string {
  return buildHref(sp, { month: undefined, year: undefined, range: undefined, from: undefined, to: undefined, loadPage: undefined, ...overrides });
}

export default async function PerformancePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const now = new Date();
  const view = resolvePerformanceView(sp, now);
  const nowPeriod = currentPeriod(now);
  const nowYear = nowPeriod.year;
  const today = centralDateKey(now);

  const [loads, prevLoads, netGoals] = await Promise.all([getAnalyticsLoads(view.range), getAnalyticsLoads(view.prevRange), getNetGoals()]);
  // Trip Analysis (Phase 2 item 5) needs the tripIds already present on the
  // range-scoped `loads` above — no second, wider load query to find "which
  // trips touched this period".
  const trips = await getAnalyticsTrips(loads);

  const summary = summarize(loads);
  const prevSummary = summarize(prevLoads);
  const deltas = deltasBetween(summary, prevSummary);
  const dh = deadheadSplit(loads);

  // Adaptive trend (Phase 2 item 2; day-level bucketing removed 2026-08-08
  // — Brent thinks in weeks/months only) — buckets the SAME range-scoped
  // `loads` at the granularity the selected view calls for (week/month),
  // never a separate trailing-months fetch. This also fixes a latent
  // "range consistency" gap in the old build: the old trend always showed
  // a fixed trailing 6 calendar months regardless of the selected range.
  const trendBuckets = rangeTrendBuckets(loads, view.range, view.granularity);
  const trendLabel = GRANULARITY_LABEL[view.granularity];
  const rateTrend: RateTrendPoint[] = trendBuckets.map((b) => ({ label: b.label, grossRpm: b.grossRpm, netRpm: b.netRpm }));
  const dualTrend: DualTrendPoint[] = trendBuckets.map((b) => ({ label: b.label, gross: b.gross, net: b.net }));
  const volumeTrend: TrendPoint[] = trendBuckets.map((b) => ({ label: b.label, value: b.loads }));

  // No artificial cap (Phase 7) — the server-aggregation architecture was
  // already correct, this just stops slicing the full set down to 6.
  const brokerSortKey: PartySortKey = isPartySortKey(sp.brokerSort) ? sp.brokerSort : "net";
  const brokerDir = sp.brokerDir === "asc" ? "asc" : "desc";
  const brokers = sortPartyStats(brokerStats(loads, Infinity), brokerSortKey, brokerDir);
  const laneSortKey: PartySortKey = isPartySortKey(sp.laneSort) ? sp.laneSort : "netRpm";
  const laneDir = sp.laneDir === "asc" ? "asc" : "desc";
  const lanes = sortPartyStats(laneStats(loads, Infinity), laneSortKey, laneDir);

  // Drill-down (Phase 7 "where practical") — a broker or lane row links
  // back here filtered to its own constituent loads in this same period,
  // no new route or data plumbing (same `loads` array already in scope).
  const drillBroker = typeof sp.broker === "string" ? sp.broker : null;
  const drillLane = typeof sp.lane === "string" ? sp.lane : null;
  const drillLoads = drillBroker
    ? loads.filter((l) => l.broker.trim() === drillBroker)
    : drillLane
      ? loads.filter((l) => laneKey(l.origin, l.destination) === drillLane)
      : null;
  const drillTitle = drillBroker ?? drillLane;
  const drillCloseHref = buildHref(sp, { broker: undefined, lane: undefined });
  const fromPath = buildHref(sp, {});

  // Analytical Load Board (Phase 8) — the same range-bounded `loads` array
  // already fetched above (never a second, wider query), filtered/sorted/
  // paginated in memory since it's already server-side and bounded.
  const loadSearch = typeof sp.q === "string" ? sp.q : "";
  const loadSortKey: LoadSortKey = isLoadSortKey(sp.loadSort) ? sp.loadSort : "date";
  const loadDir = sp.loadDir === "asc" ? "asc" : "desc";
  const loadTableRows = sortLoadRows(filterLoadRows(toLoadTableRows(loads), loadSearch), loadSortKey, loadDir);
  const loadPage = Math.max(1, Number(sp.loadPage) || 1);
  const loadPageCount = Math.max(1, Math.ceil(loadTableRows.length / LOAD_PAGE_SIZE));
  const loadPageRows = loadTableRows.slice((loadPage - 1) * LOAD_PAGE_SIZE, loadPage * LOAD_PAGE_SIZE);

  // ---- Goal pace (Phase 2 item 3/4) — monthly goal for Month view, annual
  // goal for Year/YTD view, both through the ONE shared computeGoalPace()
  // Today's dashboard also consumes. Pace math (remaining/required-rate/
  // verdict) only means something for the period still in progress; a past
  // month or year keeps the plain percent-complete bar instead.
  const isCurrentMonth = view.mode === "month" && view.period.year === nowPeriod.year && view.period.month === nowPeriod.month;
  const monthlyGoalPace =
    isCurrentMonth && netGoals.monthly > 0
      ? computeGoalPace({
          goal: netGoals.monthly,
          currentNet: summary.net,
          daysElapsed: Number(currentBusinessDate(now).slice(8, 10)) || 1,
          daysRemaining: daysLeftInMonth(now),
        })
      : null;

  const isCurrentYear = (view.mode === "year" && view.year === nowYear) || view.mode === "ytd";
  const annualGoalPace =
    isCurrentYear && netGoals.annual > 0
      ? computeGoalPace({
          goal: netGoals.annual,
          currentNet: summary.net,
          daysElapsed: dayOfYear(today),
          daysRemaining: daysLeftInYear(now),
        })
      : null;

  // Insights strip (Phase 10, restored) — takeaways() is fully built and
  // audited correct, aggregating only what summarize/brokerStats/etc already
  // produced. For Year/YTD, prepend the YoY "net vs revenue" comparison
  // (Phase 2 item 4) built from the SAME `deltas` the KPI DeltaChips use —
  // no new arithmetic, just a sentence over it.
  const takeawayCtx: TakeawayContext = {
    year: view.mode === "month" ? view.period.year : nowPeriod.year,
    month: view.mode === "month" ? view.period.month : nowPeriod.month,
    monthlyGoal: netGoals.monthly,
    daysRemaining: daysLeftInMonth(now),
  };
  const baseInsights = takeaways(loads, takeawayCtx);
  const vsLabel = view.mode === "year" ? "last year" : view.mode === "ytd" ? "the same period last year" : null;
  const comparison = vsLabel ? comparisonTakeaway(deltas, vsLabel) : null;
  const insights = comparison ? [comparison, ...baseInsights].slice(0, 6) : baseInsights;

  const pills: { key: string; label: string; href: string; active: boolean }[] = [
    { key: "this_week", label: "This week", href: rangeHref(sp, { range: "this_week" }), active: view.mode === "range" && view.preset === "this_week" },
    { key: "last_week", label: "Last week", href: rangeHref(sp, { range: "last_week" }), active: view.mode === "range" && view.preset === "last_week" },
    {
      key: "this_month",
      label: "This month",
      href: rangeHref(sp, { month: monthParam(nowPeriod) }),
      active: view.mode === "month" && view.period.year === nowPeriod.year && view.period.month === nowPeriod.month,
    },
    {
      key: "last_month",
      label: "Last month",
      href: rangeHref(sp, { month: monthParam(shiftPeriod(nowPeriod, -1)) }),
      active: view.mode === "month" && monthParam(view.period) === monthParam(shiftPeriod(nowPeriod, -1)),
    },
    { key: "this_quarter", label: "This quarter", href: rangeHref(sp, { range: "this_quarter" }), active: view.mode === "range" && view.preset === "this_quarter" },
    { key: "this_year", label: "This year", href: rangeHref(sp, { year: String(nowYear) }), active: view.mode === "year" && view.year === nowYear },
    { key: "ytd", label: "YTD", href: rangeHref(sp, { range: "ytd" }), active: view.mode === "ytd" },
    { key: "last_year", label: "Last year", href: rangeHref(sp, { year: String(nowYear - 1) }), active: view.mode === "year" && view.year === nowYear - 1 },
  ];

  return (
    <PageScroll
      header={
        <>
          <PageHeader
            title="Performance"
            description="Net vs goal, rate/mile, deadhead, and top brokers/lanes for whatever period you pick — one range drives the whole page."
          />

          {/* Range picker — a horizontal pill strip (same scroll-strip
              pattern the mobile StatChip row already uses) so all 10 fixed
              presets stay reachable without clutter on a phone; Custom stays
              the always-visible from/to form below it, unchanged. */}
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {pills.map((p) => (
              <Link key={p.key} href={p.href} className={p.active ? PILL_ACTIVE : PILL}>
                {p.label}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            {view.mode === "month" ? (
              <div className="flex items-center gap-1.5">
                <Link href={rangeHref(sp, { month: monthParam(shiftPeriod(view.period, -1)) })} className={NAV_ARROW} aria-label="Previous month">
                  ‹
                </Link>
                <span className="px-1 text-[14px] font-medium text-fg">{view.label}</span>
                <Link href={rangeHref(sp, { month: monthParam(shiftPeriod(view.period, 1)) })} className={NAV_ARROW} aria-label="Next month">
                  ›
                </Link>
              </div>
            ) : view.mode === "year" ? (
              <div className="flex items-center gap-1.5">
                <Link href={rangeHref(sp, { year: String(view.year - 1) })} className={NAV_ARROW} aria-label="Previous year">
                  ‹
                </Link>
                <span className="px-1 text-[14px] font-medium text-fg">{view.label}</span>
                <Link href={rangeHref(sp, { year: String(view.year + 1) })} className={NAV_ARROW} aria-label="Next year">
                  ›
                </Link>
              </div>
            ) : (
              <span className="px-1 text-[14px] font-medium text-fg">{view.label}</span>
            )}

            <form action="/tms-v2/performance" method="GET" className="flex items-center gap-1.5">
              <input
                type="date"
                name="from"
                defaultValue={view.mode === "custom" ? view.from : undefined}
                className="h-8 rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg"
              />
              <span className="text-[13px] text-fg-muted">to</span>
              <input
                type="date"
                name="to"
                defaultValue={view.mode === "custom" ? view.to : undefined}
                className="h-8 rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg"
              />
              <Button type="submit" variant="secondary" size="sm">
                Custom
              </Button>
            </form>
          </div>

          {/* Mobile — headline Net tile + a thin scrollable secondary-stat
              strip instead of seven KPI tiles. */}
          <div className="flex flex-col gap-3 lg:hidden">
            <KpiTile label="Net" value={formatMoney(summary.net)} delta={<DeltaChip delta={deltas.net} />} emphasis="dark" />
            <div className="no-scrollbar flex items-stretch gap-4 overflow-x-auto rounded-xl border border-line bg-card px-3.5 py-2.5 shadow-e1">
              <StatChip label="Gross" value={formatMoney(summary.gross)} />
              <StatChip label="Loads" value={String(summary.loads)} />
              <StatChip label="Margin" value={pct(summary.marginPct)} />
              <StatChip label="Net $/mi" value={rpm(summary.netRpm)} />
              <StatChip label="Gross $/mi" value={rpm(summary.grossRpm)} />
              <StatChip label="Deadhead" value={pct(dh.pct)} />
              <StatChip label="Avg Net/Load" value={formatMoney(summary.netPerLoad ?? 0)} />
              <StatChip label="Avg Gross/Load" value={formatMoney(summary.grossPerLoad ?? 0)} />
            </div>
            <Card>
              <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Deadhead split</p>
              <DeadheadSplitBar split={dh} />
            </Card>
          </div>

          {/* Desktop — unchanged four/three-tile KPI grids. */}
          <div className="hidden lg:grid lg:grid-cols-4 lg:gap-3">
            <KpiTile label="Net" value={formatMoney(summary.net)} delta={<DeltaChip delta={deltas.net} />} emphasis="dark" />
            <KpiTile label="Gross" value={<Money value={summary.gross} tone="none" />} delta={<DeltaChip delta={deltas.gross} />} />
            <KpiTile label="Loads" value={String(summary.loads)} />
            <KpiTile label="Margin" value={pct(summary.marginPct)} delta={<DeltaChip delta={deltas.margin} />} />
          </div>

          {monthlyGoalPace ? (
            <GoalPaceCard label="Net vs monthly goal" pace={monthlyGoalPace} />
          ) : view.mode === "month" && netGoals.monthly > 0 ? (
            <Card className="flex flex-col gap-1">
              <ProgressBar
                label="Net vs monthly goal"
                valueLabel={`${formatMoney(summary.net)} / ${formatMoney(netGoals.monthly)}`}
                value={netGoals.monthly > 0 ? Math.min(100, Math.max(0, (summary.net / netGoals.monthly) * 100)) : 0}
                tone={summary.net >= netGoals.monthly ? "positive" : "accent"}
              />
            </Card>
          ) : null}

          {annualGoalPace ? (
            <GoalPaceCard label="Net vs annual goal" pace={annualGoalPace} />
          ) : (view.mode === "year" || view.mode === "ytd") && netGoals.annual > 0 ? (
            <Card className="flex flex-col gap-1">
              <ProgressBar
                label="Net vs annual goal"
                valueLabel={`${formatMoney(summary.net)} / ${formatMoney(netGoals.annual)}`}
                value={netGoals.annual > 0 ? Math.min(100, Math.max(0, (summary.net / netGoals.annual) * 100)) : 0}
                tone={summary.net >= netGoals.annual ? "positive" : "accent"}
              />
            </Card>
          ) : null}

          <div className="hidden lg:grid lg:grid-cols-3 lg:gap-3">
            <KpiTile label="Net $/mi" value={rpm(summary.netRpm)} delta={<DeltaChip delta={deltas.netRpm} />} />
            <KpiTile label="Gross $/mi" value={rpm(summary.grossRpm)} />
            <KpiTile label="Deadhead" value={pct(dh.pct)} delta={<DeltaChip delta={deltas.deadhead} />} />
          </div>

          <div className="hidden lg:grid lg:grid-cols-2 lg:gap-3">
            <KpiTile label="Avg Net/Load" value={<Money value={summary.netPerLoad} />} />
            <KpiTile label="Avg Gross/Load" value={<Money value={summary.grossPerLoad} tone="none" />} />
          </div>

          <Card className="hidden lg:block">
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Deadhead split</p>
            <DeadheadSplitBar split={dh} />
          </Card>
        </>
      }
    >
      {/* Mobile — charts-forward: Net vs Gross, $/mi trend, then revenue by
          broker/lane as bar charts instead of plain number rows. */}
      <div className="mb-6 flex flex-col gap-3 lg:hidden">
        <Card>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Net vs gross · {trendLabel}</p>
          <div className="mt-3">
            <DualTrendChart points={dualTrend} />
          </div>
        </Card>
        <Card>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Gross vs net $/loaded-mi · {trendLabel}</p>
          <div className="mt-3">
            <RateTrendChart points={rateTrend} />
          </div>
        </Card>
        <Card>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Loads booked · {trendLabel}</p>
          <div className="mt-3">
            <TrendChart points={volumeTrend} formatValue={(v) => String(Math.round(v))} />
          </div>
        </Card>
        <InsightsStrip items={insights} />
        <Card>
          <PartyBarChart title="Brokers by net" rows={brokers} />
        </Card>
        <Card>
          <PartyBarChart title="Lanes by net" rows={lanes} />
        </Card>
      </div>

      {/* Desktop */}
      <div className="hidden lg:block">
        <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Net vs gross · {trendLabel}</p>
            <div className="mt-3">
              <DualTrendChart points={dualTrend} />
            </div>
          </Card>
          <Card>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Gross vs net $/loaded-mi · {trendLabel}</p>
            <div className="mt-3">
              <RateTrendChart points={rateTrend} />
            </div>
          </Card>
          <Card>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Loads booked · {trendLabel}</p>
            <div className="mt-3">
              <TrendChart points={volumeTrend} formatValue={(v) => String(Math.round(v))} />
            </div>
          </Card>
        </div>

        <div className="mb-6">
          <InsightsStrip items={insights} />
        </div>

        {drillTitle && drillLoads ? <PartyDrillDown title={drillTitle} loads={drillLoads} closeHref={drillCloseHref} fromPath={fromPath} /> : null}

        <div className="flex flex-col gap-6">
          <PartyTable
            title="Brokers — full analysis"
            nameLabel="Broker"
            rows={brokers}
            rowHref={(name) => buildHref(sp, { broker: name, lane: undefined })}
            sort={{
              activeKey: brokerSortKey,
              dir: brokerDir,
              hrefFor: (key) => buildHref(sp, { brokerSort: key, brokerDir: brokerSortKey === key && brokerDir === "desc" ? "asc" : "desc" }),
            }}
          />
          <PartyTable
            title="Lanes — full analysis"
            nameLabel="Lane"
            rows={lanes}
            rowHref={(name) => buildHref(sp, { lane: name, broker: undefined })}
            sort={{
              activeKey: laneSortKey,
              dir: laneDir,
              hrefFor: (key) => buildHref(sp, { laneSort: key, laneDir: laneSortKey === key && laneDir === "desc" ? "asc" : "desc" }),
            }}
          />
        </div>
      </div>

      {/* Analytical Load Board (Phase 8) — "the Load Board turned into
          analytics." DataList itself handles the desktop-table/mobile-card
          split, so this section renders once for both breakpoints. */}
      <section className="mt-6 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-fg">Load performance</h2>
          <form action="/tms-v2/performance" method="GET" className="flex items-center gap-1.5">
            {view.mode === "month" ? <input type="hidden" name="month" value={monthParam(view.period)} /> : null}
            {view.mode === "year" ? <input type="hidden" name="year" value={String(view.year)} /> : null}
            {view.mode === "ytd" ? <input type="hidden" name="range" value="ytd" /> : null}
            {view.mode === "range" ? <input type="hidden" name="range" value={view.preset} /> : null}
            {view.mode === "custom" ? <input type="hidden" name="from" value={view.from} /> : null}
            {view.mode === "custom" ? <input type="hidden" name="to" value={view.to} /> : null}
            <input
              type="text"
              name="q"
              defaultValue={loadSearch}
              placeholder="Search load #, lane, or broker"
              className="h-9 w-56 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
            />
            <Button type="submit" variant="secondary" size="sm">
              Search
            </Button>
          </form>
        </div>

        <LoadPerformanceTable
          rows={loadPageRows}
          sort={{
            activeKey: loadSortKey,
            dir: loadDir,
            hrefFor: (key) => buildHref(sp, { loadSort: key, loadDir: loadSortKey === key && loadDir === "desc" ? "asc" : "desc", loadPage: undefined }),
          }}
          fromPath={fromPath}
        />

        <div className="flex items-center justify-between text-[13px] text-fg-muted">
          <span>
            {loadTableRows.length} load{loadTableRows.length === 1 ? "" : "s"} · page {loadPage} of {loadPageCount}
          </span>
          <div className="flex gap-3">
            {loadPage > 1 ? (
              <Link href={buildHref(sp, { loadPage: String(loadPage - 1) })} className="underline">
                ← Prev
              </Link>
            ) : null}
            {loadPage < loadPageCount ? (
              <Link href={buildHref(sp, { loadPage: String(loadPage + 1) })} className="underline">
                Next →
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* Trip Analysis (Phase 2 item 5) — trips touched by this period, all-in
          financials via the same computeTripNet the Trips list/detail use.
          Personal-conveyance miles surface ONLY here (Option C) — never in
          the top-level mileage KPIs above. */}
      <section className="mt-6 flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-fg">Trip performance</h2>
        <TripPerformanceTable trips={trips} fromPath={fromPath} />
      </section>
    </PageScroll>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5 border-r border-line pr-4 last:border-r-0 last:pr-0">
      <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-fg-muted">{label}</span>
      <span className="whitespace-nowrap text-[14px] font-semibold tabular-nums text-fg">{value}</span>
    </div>
  );
}
