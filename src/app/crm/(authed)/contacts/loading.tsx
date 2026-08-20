import { PAGE_CONTAINER } from "../_shell/ui";

/**
 * Route-level loading skeleton for the global Contacts directory. Mirrors
 * the real page's shape (2026-08-20: ONE unified list, every breakpoint —
 * was a card-grid skeleton left over from before Contacts was rebuilt to
 * match crm-design's single-list Contacts page).
 */
export default function Loading() {
  return (
    <div className={PAGE_CONTAINER}>
      <div className="mb-5 h-7 w-32 animate-pulse bg-inset" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="h-10 w-40 animate-pulse bg-inset" />
        <div className="h-10 w-40 animate-pulse bg-inset" />
      </div>

      <div className="mb-4 h-16 animate-pulse rounded-lg border border-line-strong bg-card" />

      <div className="overflow-hidden rounded-lg border border-line-strong bg-card">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-inset" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-1/3 animate-pulse bg-inset" />
              <div className="h-3 w-1/2 animate-pulse bg-inset" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
