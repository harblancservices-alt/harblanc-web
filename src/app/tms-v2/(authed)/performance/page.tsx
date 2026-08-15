import Link from "next/link";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Button } from "@/components/tms-v2/ui/Button";
import { Card } from "@/components/tms-v2/ui/Card";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { formatMoney } from "@/lib/domain/money";
import { getAnalyticsLoads, getAnalyticsTrips, getNetGoals, getFuelSettings } from "@/lib/data/analytics";
import {
  summarize,
  brokerStats,
  laneStats,
  deadheadSplit,
  deltasBetween,
  takeaways,
  efficiencyTakeaways,
  rangeTrendBuckets,
  type TakeawayContext,
} from "@/lib/dispatch/performance";
import { rpm, pct } from "@/lib/dispatch/format";
import { currentPeriod } from "@/lib/domain/attribution";
import { daysLeftInMonth } from "@/lib/dispatch/goal-month";
import { resolvePerformanceView, monthParam, shiftPeriod, type PerformanceView } from "./_lib/range";
import { toLoadTableRows, filterLoadRows, sortLoadRows, isLoadSortKey, type LoadSortKey } from "./_lib/load-table";
import { DeltaChip } from "./_components/DeltaChip";
import { PartyBarChart } from "./_components/PartyBarChart";
import { LoadPerformanceTable } from "./_components/LoadPerformanceTable";
import { TripPerformanceTable } from "./_components/TripPerformanceTable";
import { InsightsStrip } from "./_components/InsightsStrip";
import { RangeMenu, type RangeMenuOption } from "./_components/RangeMenu";
import { PnlCard } from "./_components/PnlCard";
import { EfficiencyGrid, type EfficiencyRow } from "./_components/EfficiencyGrid";
import { MilesGrid } from "./_components/MilesGrid";
import { NetProfitTrendChart } from "./_components/NetProfitTrendChart";
import { DesktopPerformanceDashboard } from "./_components/DesktopPerformanceDashboard";

const LOAD_PAGE_SIZE = 50;

// Server-aggregated, range-scoped rollup — never the full load history
// re-aggregated client-side (v2-design.md §23's fixed weakness).
export const dynamic = "force-dynamic";

const NAV_ARROW = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-fg hover:bg-elevated";
const GRANULARITY_LABEL: Record<PerformanceView["granularity"], string> = { week: "weekly", month: "monthly" };

type PerformanceSearchParams = {
  month?: string;
  year?: string;
  range?: string;
  from?: string;
  to?: string;
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

/** What "vs ___" means for the efficiency-review Insights sentences —
 * always the immediately-preceding equal-length period, phrased in whatever
 * unit the selected view itself is in. */
function vsPeriodLabel(view: PerformanceView): string {
  switch (view.mode) {
    case "month":
      return "last month";
    case "year":
      return "last year";
    case "ytd":
      return "the same period last year";
    case "range":
      return view.preset === "this_quarter" ? "last quarter" : "the prior week";
    case "custom":
      return "the prior period";
  }
}

export default async function PerformancePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const now = new Date();
  const view = resolvePerformanceView(sp, now);
  const nowPeriod = currentPeriod(now);
  const nowYear = nowPeriod.year;

  const [loads, prevLoads, netGoals, fuel] = await Promise.all([
    getAnalyticsLoads(view.range),
    getAnalyticsLoads(view.prevRange),
    getNetGoals(),
    getFuelSettings(),
  ]);
  // Trip Analysis needs the tripIds already present on the range-scoped
  // `loads` above — no second, wider load query to find "which trips".
  const trips = await getAnalyticsTrips(loads);
  const personalMiles = trips.reduce((s, t) => s + t.financials.pcMiles, 0);

  const summary = summarize(loads);
  const prevSummary = summarize(prevLoads);
  const deltas = deltasBetween(summary, prevSummary);
  const dh = deadheadSplit(loads);

  // Adaptive trend (week/month granularity only — day-level bucketing was
  // removed 2026-08-08, Brent thinks in weeks/months) — buckets the SAME
  // range-scoped `loads` at the granularity the selected view calls for,
  // never a separate trailing-months fetch.
  const trendBuckets = rangeTrendBuckets(loads, view.range, view.granularity);
  const trendLabel = GRANULARITY_LABEL[view.granularity];

  // Top brokers by net / best lanes by net $/mi — brokerStats/laneStats'
  // own default ranking already matches these two questions exactly, so no
  // page-local sort/limit plumbing is needed for this tight view.
  const brokers = brokerStats(loads);
  const lanes = laneStats(loads);

  // Analytical Load Board — the same range-bounded `loads` array already
  // fetched above (never a second, wider query), filtered/sorted/paginated
  // in memory since it's already server-side and bounded. Demoted behind a
  // collapsed <details> below — reachable, not cluttering the tight view.
  const loadSearch = typeof sp.q === "string" ? sp.q : "";
  const loadSortKey: LoadSortKey = isLoadSortKey(sp.loadSort) ? sp.loadSort : "date";
  const loadDir = sp.loadDir === "asc" ? "asc" : "desc";
  const loadTableRows = sortLoadRows(filterLoadRows(toLoadTableRows(loads), loadSearch), loadSortKey, loadDir);
  const loadPage = Math.max(1, Number(sp.loadPage) || 1);
  const loadPageCount = Math.max(1, Math.ceil(loadTableRows.length / LOAD_PAGE_SIZE));
  const loadPageRows = loadTableRows.slice((loadPage - 1) * LOAD_PAGE_SIZE, loadPage * LOAD_PAGE_SIZE);
  const fromPath = buildHref(sp, {});

  // Insights, reframed as "where to do better" (a performance REVIEW, not a
  // dashboard) — efficiencyTakeaways() leads with deterministic sentences
  // tied directly to the hero metrics (Deadhead %, Net $/mi, Gross $/mi),
  // then takeaways()'s existing broker/lane/pay findings fill out the rest.
  // Both are pure aggregations of summarize()/brokerStats()/etc, no new
  // money math.
  const takeawayCtx: TakeawayContext = {
    year: view.mode === "month" ? view.period.year : nowPeriod.year,
    month: view.mode === "month" ? view.period.month : nowPeriod.month,
    monthlyGoal: netGoals.monthly,
    daysRemaining: daysLeftInMonth(now),
  };
  const vsLabel = vsPeriodLabel(view);
  const efficiency = efficiencyTakeaways(summary, prevSummary, vsLabel);
  const insights = [...efficiency, ...takeaways(loads, takeawayCtx)].slice(0, 6);

  const rangeOptions: RangeMenuOption[] = [
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

  const efficiencyRows: EfficiencyRow[] = [
    { label: "Net per mile", value: rpm(summary.netRpm), delta: deltas.netRpm },
    { label: "Gross per mile", value: rpm(summary.grossRpm), delta: deltas.grossRpm },
    { label: "Deadhead %", value: pct(summary.deadheadPct), delta: deltas.deadhead },
  ];

  return (
    <PageScroll
      header={
        <>
          {/* Compact header (Brent: the old tall pinned header caused the
              mobile stuck-scroll — a header this short leaves PageScroll's
              own scroll container room to actually scroll on a phone). */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <h1 className="text-[15px] font-semibold text-fg">Performance</h1>
              {view.mode === "month" ? (
                <div className="flex items-center gap-1">
                  <Link href={rangeHref(sp, { month: monthParam(shiftPeriod(view.period, -1)) })} className={NAV_ARROW} aria-label="Previous month">
                    ‹
                  </Link>
                  <Link href={rangeHref(sp, { month: monthParam(shiftPeriod(view.period, 1)) })} className={NAV_ARROW} aria-label="Next month">
                    ›
                  </Link>
                </div>
              ) : view.mode === "year" ? (
                <div className="flex items-center gap-1">
                  <Link href={rangeHref(sp, { year: String(view.year - 1) })} className={NAV_ARROW} aria-label="Previous year">
                    ‹
                  </Link>
                  <Link href={rangeHref(sp, { year: String(view.year + 1) })} className={NAV_ARROW} aria-label="Next year">
                    ›
                  </Link>
                </div>
              ) : null}
            </div>

            <RangeMenu
              currentLabel={view.label}
              options={rangeOptions}
              customFrom={view.mode === "custom" ? view.from : undefined}
              customTo={view.mode === "custom" ? view.to : undefined}
              customActive={view.mode === "custom"}
            />
          </div>

          {/* Desktop's 5-tile DesktopKpiStrip below covers Net profit as its
              own dark hero tile — this pinned mobile hero stays lg:hidden so
              the figure isn't shown twice at desktop widths. */}
          <div className="lg:hidden">
            <KpiTile label="Net profit" value={formatMoney(summary.net)} delta={<DeltaChip delta={deltas.net} />} emphasis="dark" />
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* < lg: the original tight single-column review, byte-for-byte
            unchanged, just newly wrapped in lg:hidden so it steps aside for
            the desktop dashboard below at the lg breakpoint. */}
        <div className="flex flex-col gap-4 lg:hidden">
          <PnlCard summary={summary} netDelta={deltas.net} factoringPct={fuel.factoringPct} vsLabel={vsLabel} />

          <EfficiencyGrid rows={efficiencyRows} />

          <MilesGrid total={dh.total} loaded={dh.loaded} deadhead={dh.deadhead} personal={personalMiles} />

          <Card>
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Net profit · {trendLabel}</p>
            <NetProfitTrendChart points={trendBuckets.map((b) => ({ label: b.label, net: b.net }))} />
          </Card>

          <div className="grid grid-cols-1 gap-4">
            <Card>
              <PartyBarChart title="Top brokers by net" rows={brokers} metric="net" />
            </Card>
            <Card>
              <PartyBarChart title="Best lanes by $/mi" rows={lanes} metric="rpm" />
            </Card>
          </div>

          <InsightsStrip items={insights} />
        </div>

        {/* lg and up: contained multi-column dashboard — KPI strip, axis
            trend chart + P&L, gross-vs-net + miles/efficiency, broker/lane
            tables, insights. See DesktopPerformanceDashboard's own header
            comment for the full section-by-section rationale. */}
        <div className="hidden lg:block">
          <DesktopPerformanceDashboard
            summary={summary}
            deltas={deltas}
            factoringPct={fuel.factoringPct}
            vsLabel={vsLabel}
            trendBuckets={trendBuckets}
            trendLabel={trendLabel}
            efficiencyRows={efficiencyRows}
            miles={{ total: dh.total, loaded: dh.loaded, deadhead: dh.deadhead, personal: personalMiles }}
            brokers={brokers}
            lanes={lanes}
            insights={insights}
          />
        </div>

        {/* Demoted, not deleted — Brent's full analytical Load Board and
            Trip Analysis stay reachable behind a closed-by-default
            disclosure instead of cluttering the tight review above. */}
        <details className="group rounded-xl border border-line bg-card shadow-e1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[14px] font-semibold text-fg [&::-webkit-details-marker]:hidden">
            <span>
              View loads <span className="font-normal text-fg-muted">→ {loadTableRows.length} load{loadTableRows.length === 1 ? "" : "s"}</span>
            </span>
            <span aria-hidden className="text-fg-muted transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="flex flex-col gap-2 border-t border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-fg">Load performance</h2>
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
          </div>
        </details>

        <details className="group rounded-xl border border-line bg-card shadow-e1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[14px] font-semibold text-fg [&::-webkit-details-marker]:hidden">
            <span>
              View trips <span className="font-normal text-fg-muted">→ {trips.length} trip{trips.length === 1 ? "" : "s"}</span>
            </span>
            <span aria-hidden className="text-fg-muted transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="flex flex-col gap-2 border-t border-line p-3">
            <h2 className="text-[13px] font-semibold text-fg">Trip performance</h2>
            <TripPerformanceTable trips={trips} fromPath={fromPath} />
          </div>
        </details>
      </div>
    </PageScroll>
  );
}
