import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { Button } from "@/components/tms-v2/ui/Button";
import { Card } from "@/components/tms-v2/ui/Card";
import { ProgressBar } from "@/components/tms-v2/ui/ProgressBar";
import { formatMoney } from "@/lib/domain/money";
import { getAnalyticsLoads, getMonthlyNetGoal } from "@/lib/data/analytics";
import { summarize, brokerStats, laneStats, deadheadSplit, deltasBetween } from "@/lib/dispatch/performance";
import { rpm, pct } from "@/lib/dispatch/format";
import { currentPeriod } from "@/lib/domain/attribution";
import { resolvePerformanceView, monthParam, shiftPeriod } from "./_lib/range";
import { DeltaChip } from "./_components/DeltaChip";
import { PartyStatList } from "./_components/PartyStatList";

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

  const [loads, prevLoads, monthlyGoal] = await Promise.all([
    getAnalyticsLoads(view.range),
    getAnalyticsLoads(view.prevRange),
    getMonthlyNetGoal(),
  ]);

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Performance"
        description="Net vs goal, rate/mile, deadhead, and top brokers/lanes — attributed by pickup date, the same rule Calendar uses."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Net" value={formatMoney(summary.net)} delta={<DeltaChip delta={deltas.net} />} emphasis="dark" />
        <KpiTile label="Gross" value={<Money value={summary.gross} tone="none" />} delta={<DeltaChip delta={deltas.gross} />} />
        <KpiTile label="Loads" value={String(summary.loads)} />
        <KpiTile label="Margin" value={pct(summary.marginPct)} delta={<DeltaChip delta={deltas.margin} />} />
      </div>

      {view.mode === "month" && monthlyGoal > 0 ? (
        <Card className="flex flex-col gap-1">
          <ProgressBar
            label="Net vs goal"
            valueLabel={`${formatMoney(summary.net)} / ${formatMoney(monthlyGoal)}`}
            value={goalPct ?? 0}
            tone={summary.net >= monthlyGoal ? "positive" : "accent"}
          />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label="Net $/mi" value={rpm(summary.netRpm)} delta={<DeltaChip delta={deltas.netRpm} />} />
        <KpiTile label="Gross $/mi" value={rpm(summary.grossRpm)} />
        <KpiTile label="Deadhead" value={pct(dh.pct)} delta={<DeltaChip delta={deltas.deadhead} />} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PartyStatList title="Top brokers" rows={brokers} />
        <PartyStatList title="Top lanes" rows={lanes} />
      </div>
    </div>
  );
}
