import { PAGE_CONTAINER } from "../_shell/ui";

/**
 * Route-level loading skeleton for the global Contacts directory. Mirrors
 * the real page's shape (2026-08-22 rebuild: a toolbar card carrying the
 * filter-as-you-type search, the chip row and the sort control, then letter
 * sections — a sticky accent-barred header band above a zebra list).
 */
export default function Loading() {
  return (
    <div className={PAGE_CONTAINER}>
      <div className="mb-5 h-7 w-32 animate-pulse bg-inset" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="h-10 w-40 animate-pulse bg-inset" />
        <div className="h-10 w-40 animate-pulse bg-inset" />
      </div>

      <div className="mb-4 space-y-2.5 rounded-lg border border-line-strong bg-card p-3">
        <div className="h-10 w-full animate-pulse rounded-[5px] bg-inset" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-7 w-24 animate-pulse rounded-full bg-inset" />
          ))}
        </div>
      </div>

      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s} className="mb-4">
          <div className="flex items-stretch overflow-hidden rounded-t-lg border border-b-0 border-line-strong">
            <span className="w-[3px] shrink-0 bg-accent" />
            <div className="flex-1 border-b border-line-strong bg-inset px-4 py-2">
              <div className="h-3.5 w-8 animate-pulse bg-elevated" />
            </div>
          </div>
          <div className="overflow-hidden rounded-b-lg border border-t-0 border-line-strong bg-card">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-inset" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-1/3 animate-pulse bg-inset" />
                  <div className="h-3 w-1/2 animate-pulse bg-inset" />
                </div>
                <div className="hidden gap-1.5 sm:flex">
                  {Array.from({ length: 3 }).map((_, b) => (
                    <div key={b} className="h-8 w-16 animate-pulse rounded-md bg-inset" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
