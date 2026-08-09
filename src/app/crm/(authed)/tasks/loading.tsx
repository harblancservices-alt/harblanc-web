import { PAGE_CONTAINER } from "../_shell/ui";

/**
 * Route-level loading skeleton for the global Tasks page — three group-shaped
 * placeholders (Overdue / Due today / Upcoming) so there's no layout jump
 * while the real groups load, on both the mobile card list and desktop table.
 */
export default function Loading() {
  return (
    <div className={PAGE_CONTAINER}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="h-10 w-32 animate-pulse bg-inset" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-line-strong bg-card">
            <div className="h-10 animate-pulse border-b border-line-strong bg-inset" />
            <div className="flex flex-col gap-2.5 p-3">
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="h-16 animate-pulse bg-inset" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
