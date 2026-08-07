"use client";

import { useState } from "react";
import { DataList } from "@/components/tms-v2/ui/DataList";
import type { TripWithFinancials } from "@/lib/data/trips";
import { TRIP_COLUMNS } from "./trip-columns";
import { TripCard } from "./TripCard";

/**
 * Closed trips, collapsed to the most recent 5 with a "view all" expander
 * (v2-design.md §6: "Closed trips (collapsed by default past the most
 * recent 5)") — same pattern the trip detail page's linked-loads list and
 * the approved /admin trips redesign both already use.
 */
const VISIBLE_COUNT = 5;

export function ClosedTripsSection({ trips }: { trips: TripWithFinancials[] }) {
  const [showAll, setShowAll] = useState(false);
  if (trips.length === 0) return null;

  const visible = showAll ? trips : trips.slice(0, VISIBLE_COUNT);
  const hiddenCount = trips.length - visible.length;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[15px] font-semibold text-fg">Closed ({trips.length})</h2>

      {/* Mobile — Load Board-style card list. */}
      <div className="no-scrollbar flex flex-col gap-3 lg:hidden">
        {visible.map((t) => (
          <TripCard key={t.id} trip={t} />
        ))}
      </div>

      {/* Desktop — unchanged table (later PC pass owns this). */}
      <div className="hidden lg:block">
        <DataList
          columns={TRIP_COLUMNS}
          rows={visible}
          rowKey={(t) => t.id}
          getHref={(t) => `/tms-v2/trips/${t.id}`}
        />
      </div>

      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="self-start text-[13px] font-semibold text-accent hover:underline"
        >
          View all {trips.length} closed trips
        </button>
      ) : null}
    </section>
  );
}
