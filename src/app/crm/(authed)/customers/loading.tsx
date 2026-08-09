import { PAGE_CONTAINER } from "../_shell/ui";

/**
 * Route-level loading skeleton for Active Customers — mirrors the
 * Companies/Contacts skeleton (accounts/loading.tsx) so the mobile card grid
 * has no layout jump while data loads. Desktop's table renders directly
 * once the (fast, indexed) query resolves, same as the other lists.
 */
export default function Loading() {
  return (
    <div className={PAGE_CONTAINER}>
      <div className="grid grid-cols-1 gap-3 [grid-auto-rows:1fr] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex h-[172px] flex-col gap-3 border border-line-strong bg-card p-4">
            <div className="h-4 w-2/3 animate-pulse bg-inset" />
            <div className="h-3 w-1/3 animate-pulse bg-inset" />
            <div className="h-3 w-1/2 animate-pulse bg-inset" />
            <div className="mt-auto h-10 w-full animate-pulse bg-inset" />
          </div>
        ))}
      </div>

      <div className="hidden h-64 animate-pulse border border-line-strong bg-card md:block" />
    </div>
  );
}
