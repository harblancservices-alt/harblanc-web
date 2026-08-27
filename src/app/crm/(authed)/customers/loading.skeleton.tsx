import { PAGE_CONTAINER } from "../_shell/ui";

/**
 * Route-level loading skeleton for Active Customers — mirrors the
 * Companies/Contacts skeleton (accounts/loading.tsx) so the mobile card grid
 * has no layout jump while data loads. Desktop's table renders directly
 * once the (fast, indexed) query resolves, same as the other lists.
 * 2026-08-20: breakpoint moved md -> lg, single-column stack (was a
 * 2/3/4-col grid) to match the real page's crm-design-aligned layout.
 */
export default function Loading() {
  return (
    <div className={PAGE_CONTAINER}>
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
