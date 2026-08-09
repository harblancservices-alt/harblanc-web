import Link from "next/link";
import { Card, CardHead } from "./_shell/ui";
import { SELECTABLE_LIFECYCLE_STAGES, LIFECYCLE_LABEL, type LifecycleStage } from "./accounts/lifecycle";

export type PipelineCounts = Record<LifecycleStage, number>;

/**
 * PIPELINE — one square tile per lifecycle stage, live company count front
 * and center. Each tile links to /crm/accounts?stage=<canonical-slug> — the
 * same `stage` query param AccountsFilters already reads and syncs its
 * select control to, so the click lands on a pre-filtered, shareable URL
 * with the visible filter UI matching. Only walks the approved 7-stage
 * funnel (SELECTABLE_LIFECYCLE_STAGES) — a company still sitting on a legacy
 * stage (qualified/inactive/lost) doesn't appear here, matching the
 * profile's own stage tracker and the Companies filter dropdown.
 */
export function PipelineSection({ counts }: { counts: PipelineCounts }) {
  const total = SELECTABLE_LIFECYCLE_STAGES.reduce((sum, s) => sum + counts[s], 0);

  return (
    <Card>
      <CardHead title="Pipeline" hint={total ? `${total} companies` : undefined} />
      {total === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-fg-muted">No companies yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-7">
          {SELECTABLE_LIFECYCLE_STAGES.map((stage) => {
            const count = counts[stage];
            const isCustomer = stage === "active_customer";
            return (
              <Link
                key={stage}
                href={`/crm/accounts?stage=${stage}`}
                prefetch={false}
                className="group flex aspect-square min-h-[92px] flex-col items-center justify-center gap-1 border border-line-strong bg-card p-3 text-center shadow-e1 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-e3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span
                  className={`font-mono text-[26px] font-bold leading-none tabular-nums transition-colors group-hover:text-accent ${
                    isCustomer ? "text-ok" : "text-fg"
                  }`}
                >
                  {count}
                </span>
                <span className="text-[11.5px] font-semibold leading-tight text-fg-muted transition-colors group-hover:text-accent">
                  {LIFECYCLE_LABEL[stage]}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
