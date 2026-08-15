import { Card } from "@/components/tms-v2/ui/Card";
import type { MonthDeltas, PartyStat, PeriodSummary, Takeaway, TrendBucket } from "@/lib/dispatch/performance";
import type { EfficiencyRow } from "./EfficiencyGrid";
import { DesktopKpiStrip } from "./DesktopKpiStrip";
import { NetProfitTrendChart } from "./NetProfitTrendChart";
import { GrossNetTrendChart } from "./GrossNetTrendChart";
import { PnlCard } from "./PnlCard";
import { EfficiencyGrid } from "./EfficiencyGrid";
import { MilesGrid } from "./MilesGrid";
import { PartyStatTable } from "./PartyStatTable";
import { InsightsGrid } from "./InsightsGrid";

const SECTION_LABEL = "mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted";

/**
 * lg:-and-up dashboard layout (v2-design.md "desktop table/line layout"
 * backlog item, Performance's turn) — a contained, centered multi-column
 * page instead of the mobile single-column stack stretched full-width.
 * Every figure here is a prop straight out of page.tsx's existing
 * summarize()/brokerStats()/laneStats()/rangeTrendBuckets() calls; this
 * component only lays them out differently, no new aggregation.
 */
export function DesktopPerformanceDashboard({
  summary,
  deltas,
  factoringPct,
  vsLabel,
  trendBuckets,
  trendLabel,
  efficiencyRows,
  miles,
  brokers,
  lanes,
  insights,
}: {
  summary: PeriodSummary;
  deltas: MonthDeltas;
  factoringPct: number;
  vsLabel: string;
  trendBuckets: TrendBucket[];
  trendLabel: string;
  efficiencyRows: EfficiencyRow[];
  miles: { total: number; loaded: number; deadhead: number; personal: number };
  brokers: PartyStat[];
  lanes: PartyStat[];
  insights: Takeaway[];
}) {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
      <DesktopKpiStrip summary={summary} deltas={deltas} />

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <p className={SECTION_LABEL}>Net profit · {trendLabel}</p>
          <NetProfitTrendChart points={trendBuckets.map((b) => ({ label: b.label, net: b.net }))} height={240} />
        </Card>
        <PnlCard summary={summary} netDelta={deltas.net} factoringPct={factoringPct} vsLabel={vsLabel} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <p className={SECTION_LABEL}>Gross vs net · {trendLabel}</p>
          <GrossNetTrendChart points={trendBuckets.map((b) => ({ label: b.label, gross: b.gross, net: b.net }))} />
        </Card>
        <div className="flex flex-col gap-4">
          <MilesGrid total={miles.total} loaded={miles.loaded} deadhead={miles.deadhead} personal={miles.personal} />
          <EfficiencyGrid rows={efficiencyRows} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <PartyStatTable title="Top brokers by net" rows={brokers} variant="broker" />
        </Card>
        <Card>
          <PartyStatTable title="Best lanes by $/mi" rows={lanes} variant="lane" />
        </Card>
      </div>

      <InsightsGrid items={insights} />
    </div>
  );
}
