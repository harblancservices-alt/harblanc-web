import { PAGE_CONTAINER } from "./_shell/ui";

/**
 * Route-level loading skeleton for the CRM dashboard — mirrors the new
 * layout's section order (header, cockpit, What's next, recent activity,
 * pipeline, needs attention) so the skeleton doesn't jump around once real
 * content lands.
 */
export default function Loading() {
  return (
    <div className={PAGE_CONTAINER}>
      <div className="space-y-4">
        <div className="border border-line-strong bg-card p-4 sm:p-5">
          <div className="h-5 w-48 animate-pulse bg-inset" />
          <div className="mt-2 h-3 w-28 animate-pulse bg-inset" />
          <div className="mt-4 h-11 w-full animate-pulse bg-inset" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse border border-line-strong bg-inset" />
          ))}
        </div>

        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-line-strong bg-card">
            <div className="h-10 animate-pulse border-b border-line-strong bg-inset" />
            <div className="space-y-2 p-4">
              <div className="h-12 animate-pulse bg-inset" />
              <div className="h-12 animate-pulse bg-inset" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
