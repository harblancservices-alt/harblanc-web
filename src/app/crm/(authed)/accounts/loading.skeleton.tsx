import { PAGE_CONTAINER } from "../_shell/ui";

/**
 * Route-level loading skeleton for the Companies list — Next's automatic
 * Suspense fallback while page.tsx's server data fetch is in flight. Mirrors
 * the real page's shape (2026-08-20: single-column mobile card stack below
 * `lg`, a table above it — was a responsive 2/3/4-col grid at every width)
 * so there's no layout jump when the real content swaps in.
 */
export default function Loading() {
  return (
    <div className={PAGE_CONTAINER}>
      <div className="mb-5 h-7 w-40 animate-pulse bg-inset" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="h-10 w-40 animate-pulse bg-inset" />
        <div className="h-10 w-40 animate-pulse bg-inset" />
      </div>

      <div className="mb-4 h-16 animate-pulse rounded-lg border border-line-strong bg-card" />

      <div className="flex flex-col gap-2.5 lg:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-line-strong bg-card p-4">
            <div className="h-4 w-2/3 animate-pulse bg-inset" />
            <div className="h-3 w-1/3 animate-pulse bg-inset" />
          </div>
        ))}
      </div>
      <div className="hidden h-64 animate-pulse rounded-lg border border-line-strong bg-card lg:block" />
    </div>
  );
}
