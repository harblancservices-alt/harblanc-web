import { Card, CardHead } from "./_shell/ui";
import { SELECTABLE_LIFECYCLE_STAGES, LIFECYCLE_LABEL, type LifecycleStage } from "./accounts/lifecycle";

export type PipelineCounts = Record<LifecycleStage, number>;

/**
 * PIPELINE — count of companies per lifecycle stage, horizontal bars (blue,
 * green for Customer) sized relative to the busiest stage. Only walks the
 * approved 5-stage funnel (SELECTABLE_LIFECYCLE_STAGES) — a company still
 * sitting on a legacy stage (qualified/inactive/lost) doesn't appear here,
 * matching the profile's own stage tracker.
 */
export function PipelineSection({ counts }: { counts: PipelineCounts }) {
  const total = SELECTABLE_LIFECYCLE_STAGES.reduce((sum, s) => sum + counts[s], 0);
  const max = Math.max(1, ...SELECTABLE_LIFECYCLE_STAGES.map((s) => counts[s]));

  return (
    <Card>
      <CardHead title="Pipeline" hint={total ? `${total} companies` : undefined} />
      {total === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-fg-muted">No companies yet.</p>
      ) : (
        <ul className="flex flex-col gap-3 p-4">
          {SELECTABLE_LIFECYCLE_STAGES.map((stage) => {
            const count = counts[stage];
            const pct = Math.max(count > 0 ? 4 : 0, Math.round((count / max) * 100));
            const isCustomer = stage === "customer";
            return (
              <li key={stage} className="flex items-center gap-3">
                <span className="w-[92px] shrink-0 text-[12.5px] font-semibold text-fg-muted">
                  {LIFECYCLE_LABEL[stage]}
                </span>
                <span className="h-5 min-w-0 flex-1 bg-inset">
                  <span
                    className={`block h-full ${isCustomer ? "bg-ok" : "bg-accent"}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right text-[13px] font-bold tabular-nums text-fg">
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
