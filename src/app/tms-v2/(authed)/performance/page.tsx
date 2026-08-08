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
import { getAnalyticsLoads, getMonthlyNetGoal } from "@/lib/data/analytics";
import { summarize, brokerStats, laneStats, laneKey, deadheadSplit, deltasBetween } from "@/lib/dispatch/performance";
import { rpm, pct } from "@/lib/dispatch/format";
import { currentPeriod, periodRange } from "@/lib/domain/attribution";
import { daysLeftInMonth, currentBusinessDate } from "@/lib/dispatch/goal-month";
import { computeGoalPace } from "@/lib/domain/goal-pace";
import { resolvePerformanceView, monthParam, shiftPeriod } from "./_lib/range";
import { isPartySortKey, sortPartyStats, type PartySortKey } from "./_lib/party-sort";
import { toLoadTableRows, filterLoadRows, sortLoadRows, isLoadSortKey, type LoadSortKey } from "./_lib/load-table";
import { DeltaChip } from "./_components/DeltaChip";
import { PartyBarChart } from "./_components/PartyBarChart";
import { PartyTable } from "./_components/PartyTable";
import { PartyDrillDown } from "./_components/PartyDrillDown";
import { LoadPerformanceTable } from "./_components/LoadPerformanceTable";
import { TrendChart, type TrendPoint } from "./_components/TrendChart";
import { DualTrendChart, type DualTrendPoint } from "./_components/DualTrendChart";
import { RateTrendChart, type RateTrendPoint } from "./_components/RateTrendChart";

const TREND_MONTHS = 6;
const LOAD_PAGE_SIZE = 50;
const SHORT_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Server-aggregated, range-scoped rollup — never the full load history
// re-aggregated client-side (v2-design.md §23's fixed weakness).
export const dynamic = "force-dynamic";

const NAV_BUTTON = "inline-flex h-8 items-center justify-center rounded-md border border-line-strong px-3 text-[13px] text-fg hover:bg-elevated";
const NAV_BUTTON_ACTIVE = "inline-flex h-8 items-center justify-center rounded-md border border-accent px-3 text-[13px] font-medium text-accent";

type PerformanceSearchParams = {
  month?: string;
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

export default async function PerformancePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const now = new Date();
  const view = resolvePerformanceView(sp, now);

  const anchorPeriod = view.mode === "month" ? view.period : currentPeriod(now);
  const trendPeriods = Array.from({ length: TREND_MONTHS }, (_, i) => shiftPeriod(anchorPeriod, i - (TREND_MONTHS - 1)));

  const [loads, prevLoads, monthlyGoal, trendLoadSets] = await Promise.all([
    getAnalyticsLoads(view.range),
    getAnalyticsLoads(view.prevRange),
    getMonthlyNetGoal(),
    Promise.all(trendPeriods.map((p) => getAnalyticsLoads(periodRange(p)))),
  ]);

  const trendSummaries = trendLoadSets.map((rows) => summarize(rows));
  const netTrend: TrendPoint[] = trendPeriods.map((p, i) => ({ label: SHORT_MONTH[p.month], value: trendSummaries[i].net }));
  const rateTrend: RateTrendPoint[] = trendPeriods.map((p, i) => ({
    label: SHORT_MONTH[p.month],
    grossRpm: trendSummaries[i].grossRpm,
    netRpm: trendSummaries[i].netRpm,
  }));
  const dualTrend: DualTrendPoint[] = trendPeriods.map((p, i) => ({
    label: SHORT_MONTH[p.month],
    gross: trendSummaries[i].gross,
    net: trendSummaries[i].net,
  }));

  const summary = summarize(loads);
  const prevSummary = summarize(prevLoads);
  const deltas = deltasBetween(summary, prevSummary);
  // No artificial cap (Phase 7) — the server-aggregation architecture was
  // already correct, this just stops slicing the full set down to 6.
  const brokerSortKey: PartySortKey = isPartySortKey(sp.brokerSort) ? sp.brokerSort : "net";
  const brokerDir = sp.brokerDir === "asc" ? "asc" : "desc";
  const brokers = sortPartyStats(brokerStats(loads, Infinity), brokerSortKey, brokerDir);
  const laneSortKey: PartySortKey = isPartySortKey(sp.laneSort) ? sp.laneSort : "netRpm";
  const laneDir = sp.laneDir === "asc" ? "asc" : "desc";
  const lanes = sortPartyStats(laneStats(loads, Infinity), laneSortKey, laneDir);
  const dh = deadheadSplit(loads);

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

  const thisMonthParam = monthParam(currentPeriod(now));
  const monthTabHref =
    view.mode === "month" ? `/tms-v2/performance?month=${monthParam(view.period)}` : `/tms-v2/performance?month=${thisMonthParam}`;
  const prevMonthParam = view.mode === "month" ? monthParam(shiftPeriod(view.period, -1)) : null;
  const nextMonthParam = view.mode === "month" ? monthParam(shiftPeriod(view.period, 1)) : null;

  const goalPct = monthlyGoal > 0 ? Math.min(100, Math.max(0, (summary.net / monthlyGoal) * 100)) : null;

  // Pace math (remaining/required-per-day/-week, on-pace verdict) only means
  // something for the month still in progress — a past month is over, a
  // future one hasn't started accruing. Other months keep the plain
  // percent-complete bar. Same shared module Today's dashboard consumes
  // (lib/domain/goal-pace.ts) — never a second calculation.
  const nowPeriod = currentPeriod(now);
  const isCurrentMonth = view.mode === "month" && view.period.year === nowPeriod.year && view.period.month === nowPeriod.month;
  const daysRemaining = daysLeftInMonth(now);
  const goalPace =
    isCurrentMonth && monthlyGoal > 0
      ? computeGoalPace({
          goal: monthlyGoal,
          currentNet: summary.net,
          daysElapsed: Number(currentBusinessDate(now).slice(8, 10)) || 1,
          daysRemaining,
        })
      : null;

  return (
    <PageScroll
      header={
        <>
          <PageHeader
            title="Performance"
            description="Net vs goal, rate/mile, deadhead, and top brokers/lanes — attributed by pickup date, the same rule Calendar uses."
          />

          {/* Mobile — compact period control: pill prev/next around the
              month label, custom range tucked into one tight row below.
              Same functionality as desktop's control, just less chrome. */}
          <div className="flex flex-col gap-2 lg:hidden">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {view.mode === "month" && prevMonthParam && nextMonthParam ? (
                  <>
                    <Link
                      href={`/tms-v2/performance?month=${prevMonthParam}`}
                      aria-label="Previous month"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-fg hover:bg-elevated"
                    >
                      ‹
                    </Link>
                    <span className="px-0.5 text-[15px] font-semibold text-fg">{view.label}</span>
                    <Link
                      href={`/tms-v2/performance?month=${nextMonthParam}`}
                      aria-label="Next month"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-fg hover:bg-elevated"
                    >
                      ›
                    </Link>
                  </>
                ) : (
                  <span className="rounded-full border border-accent px-3 py-1 text-[13px] font-medium text-accent">Custom: {view.label}</span>
                )}
              </div>
              {view.mode === "custom" ? (
                <Link href={monthTabHref} className="shrink-0 text-[12px] font-medium text-accent underline">
                  This month
                </Link>
              ) : null}
            </div>

            <form action="/tms-v2/performance" method="GET" className="flex items-center gap-1.5">
              <input
                type="date"
                name="from"
                defaultValue={view.mode === "custom" ? view.from : undefined}
                className="h-8 w-full min-w-0 rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg"
              />
              <span className="shrink-0 text-[12px] text-fg-muted">to</span>
              <input
                type="date"
                name="to"
                defaultValue={view.mode === "custom" ? view.to : undefined}
                className="h-8 w-full min-w-0 rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg"
              />
              <Button type="submit" variant="secondary" size="sm" className="shrink-0">
                Go
              </Button>
            </form>
          </div>

          {/* Desktop — unchanged (later PC pass owns this). */}
          <div className="hidden flex-wrap items-center justify-between gap-3 border-b border-line pb-4 lg:flex">
            <div className="flex items-center gap-2">
              <Link href={monthTabHref} className={view.mode === "month" ? NAV_BUTTON_ACTIVE : NAV_BUTTON}>
                Month
              </Link>
              {view.mode === "month" && prevMonthParam && nextMonthParam ? (
                <>
                  <Link href={`/tms-v2/performance?month=${prevMonthParam}`} className={NAV_BUTTON} aria-label="Previous month">
                    ‹
                  </Link>
                  <span className="px-1 text-[14px] font-medium text-fg">{view.label}</span>
                  <Link href={`/tms-v2/performance?month=${nextMonthParam}`} className={NAV_BUTTON} aria-label="Next month">
                    ›
                  </Link>
                </>
              ) : (
                <span className={view.mode === "custom" ? NAV_BUTTON_ACTIVE : "hidden"}>Custom: {view.label}</span>
              )}
            </div>

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
                Apply range
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
            </div>
          </div>

          {/* Desktop — unchanged four/three-tile KPI grids. */}
          <div className="hidden lg:grid lg:grid-cols-4 lg:gap-3">
            <KpiTile label="Net" value={formatMoney(summary.net)} delta={<DeltaChip delta={deltas.net} />} emphasis="dark" />
            <KpiTile label="Gross" value={<Money value={summary.gross} tone="none" />} delta={<DeltaChip delta={deltas.gross} />} />
            <KpiTile label="Loads" value={String(summary.loads)} />
            <KpiTile label="Margin" value={pct(summary.marginPct)} delta={<DeltaChip delta={deltas.margin} />} />
          </div>

          {goalPace ? (
            <GoalPaceCard label="Net vs goal" pace={goalPace} />
          ) : view.mode === "month" && monthlyGoal > 0 ? (
            <Card className="flex flex-col gap-1">
              <ProgressBar
                label="Net vs goal"
                valueLabel={`${formatMoney(summary.net)} / ${formatMoney(monthlyGoal)}`}
                value={goalPct ?? 0}
                tone={summary.net >= monthlyGoal ? "positive" : "accent"}
              />
            </Card>
          ) : null}

          <div className="hidden lg:grid lg:grid-cols-3 lg:gap-3">
            <KpiTile label="Net $/mi" value={rpm(summary.netRpm)} delta={<DeltaChip delta={deltas.netRpm} />} />
            <KpiTile label="Gross $/mi" value={rpm(summary.grossRpm)} />
            <KpiTile label="Deadhead" value={pct(dh.pct)} delta={<DeltaChip delta={deltas.deadhead} />} />
          </div>
        </>
      }
    >
      {/* Mobile — charts-forward: Net vs Gross, $/mi trend, then revenue by
          broker/lane as bar charts instead of plain number rows. */}
      <div className="mb-6 flex flex-col gap-3 lg:hidden">
        <Card>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Net vs gross · trailing {TREND_MONTHS} months</p>
          <div className="mt-3">
            <DualTrendChart points={dualTrend} />
          </div>
        </Card>
        <Card>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Gross vs net $/loaded-mi · trailing {TREND_MONTHS} months</p>
          <div className="mt-3">
            <RateTrendChart points={rateTrend} />
          </div>
        </Card>
        <Card>
          <PartyBarChart title="Brokers by net" rows={brokers} />
        </Card>
        <Card>
          <PartyBarChart title="Lanes by net" rows={lanes} />
        </Card>
      </div>

      {/* Desktop — unchanged (later PC pass owns this). */}
      <div className="hidden lg:block">
        <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Net · trailing {TREND_MONTHS} months</p>
            <div className="mt-3">
              <TrendChart points={netTrend} />
            </div>
          </Card>
          <Card>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Gross vs net $/loaded-mi · trailing {TREND_MONTHS} months</p>
            <div className="mt-3">
              <RateTrendChart points={rateTrend} />
            </div>
          </Card>
        </div>

        {drillTitle && drillLoads ? (
          <PartyDrillDown title={drillTitle} loads={drillLoads} closeHref={drillCloseHref} />
        ) : null}

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
