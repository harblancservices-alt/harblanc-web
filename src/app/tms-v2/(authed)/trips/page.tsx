import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { DataList } from "@/components/tms-v2/ui/DataList";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { listTrips } from "@/lib/data/trips";
import { TRIP_COLUMNS } from "./trip-columns";
import { TripCard } from "./TripCard";
import { ClosedTripsSection } from "./ClosedTripsSection";
import { NewTripButton } from "./NewTripButton";

// Trips read live, request-scoped data (active/closed trips) — always
// fresh, matching Today's own dashboard.
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

  return (
    <PageScroll
      header={
        <PageHeader
          title="Trips"
          description="Out-and-back run grouping, for P&L individual loads can't carry alone."
          actions={<NewTripButton />}
        />
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-fg">Active ({active.rows.length})</h2>

          {/* Mobile — Load Board-style card list. */}
          <div className="no-scrollbar lg:hidden">
            {active.rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong bg-card px-4 py-10 text-center shadow-e1">
                <p className="text-[13px] text-fg-muted">No active trips right now.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {active.rows.map((t) => (
                  <TripCard key={t.id} trip={t} />
                ))}
              </div>
            )}
          </div>

          {/* Desktop — unchanged table (later PC pass owns this). */}
          <div className="hidden lg:block">
            <DataList
              columns={TRIP_COLUMNS}
              rows={active.rows}
              rowKey={(t) => t.id}
              getHref={(t) => `/tms-v2/trips/${t.id}`}
              emptyMessage="No active trips right now."
            />
          </div>
        </section>

        <ClosedTripsSection trips={closed.rows} />
      </div>
    </PageScroll>
  );
}
