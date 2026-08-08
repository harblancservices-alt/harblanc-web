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
import { summarize, brokerStats, laneStats, deadheadSplit, deltasBetween } from "@/lib/dispatch/performance";
import { rpm, pct } from "@/lib/dispatch/format";
import { currentPeriod, periodRange } from "@/lib/domain/attribution";
import { daysLeftInMonth, currentBusinessDate } from "@/lib/dispatch/goal-month";
import { computeGoalPace } from "@/lib/domain/goal-pace";
import { resolvePerformanceView, monthParam, shiftPeriod } from "./_lib/range";
import { DeltaChip } from "./_components/DeltaChip";
import { PartyStatList } from "./_components/PartyStatList";
import { PartyBarChart } from "./_components/PartyBarChart";
import { TrendChart, type TrendPoint } from "./_components/TrendChart";
import { DualTrendChart, type DualTrendPoint } from "./_components/DualTrendChart";

const TREND_MONTHS = 6;
const SHORT_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Server-aggregated, range-scoped rollup — never the full load history
// re-aggregated client-side (v2-design.md §23's fixed weakness).
export const dynamic = "force-dynamic";

const NAV_BUTTON = "inline-flex h-8 items-center justify-center rounded-md border border-line-strong px-3 text-[13px] text-fg hover:bg-elevated";
const NAV_BUTTON_ACTIVE = "inline-flex h-8 items-center justify-center rounded-md border border-accent px-3 text-[13px] font-medium text-accent";

type PageProps = { searchParams: Promise<{ month?: string; from?: string; to?: string }> };

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
  const rateTrend: TrendPoint[] = trendPeriods.map((p, i) => ({ label: SHORT_MONTH[p.month], value: trendSummaries[i].grossRpm ?? 0 }));
  const dualTrend: DualTrendPoint[] = trendPeriods.map((p, i) => ({
    label: SHORT_MONTH[p.month],
    gross: trendSummaries[i].gross,
    net: trendSummaries[i].net,
  }));

  const summary = summarize(loads);
  const prevSummary = summarize(prevLoads);
  const deltas = deltasBetween(summary, prevSummary);
  const brokers = brokerStats(loads, 6);
  const lanes = laneStats(loads, 6);
  const dh = deadheadSplit(loads);

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
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Rate ($/mi) · trailing {TREND_MONTHS} months</p>
          <div className="mt-3">
            <TrendChart points={rateTrend} formatValue={rpm} />
          </div>
        </Card>
        <Card>
          <PartyBarChart title="Revenue by broker" rows={brokers} />
        </Card>
        <Card>
          <PartyBarChart title="Revenue by lane" rows={lanes} />
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
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Rate ($/mi) · trailing {TREND_MONTHS} months</p>
            <div className="mt-3">
              <TrendChart points={rateTrend} formatValue={rpm} />
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PartyStatList title="Top brokers" rows={brokers} />
          <PartyStatList title="Top lanes" rows={lanes} />
        </div>
      </div>
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
