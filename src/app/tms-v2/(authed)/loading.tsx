/**
 * Skeleton matching the typical KPI-strip + card page shape, not a generic
 * spinner — v2-design.md's Motion & feedback section prefers inline/
 * skeleton feedback over spinner-then-refetch. Shared across every
 * /tms-v2 route since no page-specific skeleton is warranted yet in this
 * foundation phase.
 */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="h-14 rounded-md bg-elevated" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-elevated" />
        ))}
      </div>
      <div className="h-32 rounded-lg bg-elevated" />
    </div>
  );
}
