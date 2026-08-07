import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { DataList } from "@/components/tms-v2/ui/DataList";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { formatMoney } from "@/lib/domain/money";
import { currentPeriod, periodLabel, isInPeriod } from "@/lib/domain/attribution";
import { listTrips } from "@/lib/data/trips";
import { TRIP_COLUMNS, tripPeriodDate } from "./trip-columns";
import { ClosedTripsSection } from "./ClosedTripsSection";
import { NewTripButton } from "./NewTripButton";

// Trips read live, request-scoped data (active/closed trips, this month's
// rollup) — always fresh, matching Today's own dashboard.
export const dynamic = "force-dynamic";

// Bounded, not unbounded: a one-truck operation runs a small number of
// trips at once and accumulates them gradually, so 100 active + 100 closed
// comfortably covers real usage while staying an explicit, capped query
// (v2-architecture.md §3c) — never a "give me everything" read.
const TRIPS_FETCH_SIZE = 100;

export default async function TripsPage() {
  const [active, closed] = await Promise.all([
    listTrips({ status: "active", pageSize: TRIPS_FETCH_SIZE }),
    listTrips({ status: "closed", pageSize: TRIPS_FETCH_SIZE }),
  ]);

  const period = currentPeriod();
  const monthTrips = [...active.rows, ...closed.rows].filter((t) =>
    isInPeriod(tripPeriodDate(t), period),
  );
  const monthGross = monthTrips.reduce((sum, t) => sum + t.financials.gross, 0);
  const monthNet = monthTrips.reduce((sum, t) => sum + t.financials.net, 0);
  const withMargin = monthTrips.filter((t) => t.financials.profitPct != null);
  const avgProfitPct =
    withMargin.length > 0
      ? withMargin.reduce((sum, t) => sum + (t.financials.profitPct ?? 0), 0) / withMargin.length
      : null;
  const ongoingCount = active.rows.filter((t) => !t.endedAt).length;

  return (
    <PageScroll
      header={
        <>
          <PageHeader
            title="Trips"
            description="Out-and-back run grouping, for P&L individual loads can't carry alone."
            actions={<NewTripButton />}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile
              label="Active Trips"
              value={String(active.rows.length)}
              delta={
                ongoingCount > 0 ? (
                  <span className="inline-flex w-fit items-center rounded-full border border-warn/40 bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn">
                    {ongoingCount} ongoing
                  </span>
                ) : undefined
              }
            />
            <KpiTile label={`Gross · ${periodLabel(period)}`} value={<Money value={monthGross} tone="none" />} />
            <KpiTile label={`Net · ${periodLabel(period)}`} value={formatMoney(monthNet)} emphasis="dark" />
            <KpiTile
              label="Avg Profit %"
              value={avgProfitPct != null ? `${Math.round(avgProfitPct)}%` : "—"}
            />
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-fg">Active ({active.rows.length})</h2>
          <DataList
            columns={TRIP_COLUMNS}
            rows={active.rows}
            rowKey={(t) => t.id}
            getHref={(t) => `/tms-v2/trips/${t.id}`}
            emptyMessage="No active trips right now."
          />
        </section>

        <ClosedTripsSection trips={closed.rows} />
      </div>
    </PageScroll>
  );
}
