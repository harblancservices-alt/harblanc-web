import { PAGE_CONTAINER } from "../_shell/ui";

/**
 * Route-level loading skeleton for the Companies list — Next's automatic
 * Suspense fallback while page.tsx's server data fetch is in flight. Mirrors
 * the real grid's shape (filter bar + card grid) so there's no layout jump
 * when the real content swaps in.
 */
export default function Loading() {
  return (
    <div className={PAGE_CONTAINER}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="h-10 w-40 animate-pulse bg-inset" />
        <div className="h-10 w-40 animate-pulse bg-inset" />
      </div>

      <div className="mb-4 h-16 animate-pulse rounded-lg border border-line-strong bg-card" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex h-[172px] flex-col gap-3 rounded-lg border border-line-strong bg-card p-4">
            <div className="h-4 w-2/3 animate-pulse bg-inset" />
            <div className="h-3 w-1/3 animate-pulse bg-inset" />
            <div className="h-3 w-1/2 animate-pulse bg-inset" />
            <div className="mt-auto h-10 w-full animate-pulse bg-inset" />
          </div>
        ))}
      </div>
    </div>
  );
}
