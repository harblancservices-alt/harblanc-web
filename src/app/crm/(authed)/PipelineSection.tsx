import type { CSSProperties } from "react";
import Link from "next/link";
import { Card, CardHead } from "./_shell/ui";
import { SELECTABLE_LIFECYCLE_STAGES, LIFECYCLE_LABEL, type LifecycleStage } from "./accounts/lifecycle";

export type PipelineCounts = Record<LifecycleStage, number>;

/** Brent's per-stage outline color — the border IS the color, tile stays
 * white/black. Hover value is one shade darker of the same hue (matching the
 * rest of the CRM's own hover-darkens-the-accent convention), so the tile
 * "thickens/darkens slightly" without swapping to a different color family. */
const STAGE_COLOR: Record<(typeof SELECTABLE_LIFECYCLE_STAGES)[number], { base: string; hover: string }> = {
  lead: { base: "#2563eb", hover: "#1d4ed8" },
  researching: { base: "#7c3aed", hover: "#6d28d9" },
  contacted: { base: "#0891b2", hover: "#0e7490" },
  prospect: { base: "#d97706", hover: "#b45309" },
  in_the_door: { base: "#4f46e5", hover: "#4338ca" },
  quoted: { base: "#0d9488", hover: "#0f766e" },
  active_customer: { base: "#15803d", hover: "#166534" },
};

const TILE_INK = "#0b0f14";

/**
 * PIPELINE — one square outline tile per lifecycle stage, live company count
 * front and center. Each tile links to /crm/accounts?stage=<canonical-slug>
 * — the same `stage` query param AccountsFilters already reads and syncs its
 * select control to, so the click lands on a pre-filtered, shareable URL
 * with the visible filter UI matching. Only walks the approved 7-stage
 * funnel (SELECTABLE_LIFECYCLE_STAGES) — a company still sitting on a legacy
 * stage (qualified/inactive/lost) doesn't appear here, matching the
 * profile's own stage tracker and the Companies filter dropdown.
 *
 * Outline style, not filled (Brent's call): white card, thick colored
 * border in the stage's own hue, big BLACK number/label — the color is the
 * border, never a solid background wash.
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
            const color = STAGE_COLOR[stage];
            const style = {
              "--tile-border": color.base,
              "--tile-border-hover": color.hover,
            } as CSSProperties;
            return (
              <Link
                key={stage}
                href={`/crm/accounts?stage=${stage}`}
                prefetch={false}
                style={style}
                className="group flex aspect-square min-h-[92px] flex-col items-center justify-center gap-1 border-[3px] border-[var(--tile-border)] bg-card p-3 text-center shadow-e1 transition-all hover:-translate-y-0.5 hover:border-[4px] hover:border-[var(--tile-border-hover)] hover:shadow-e3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tile-border)]"
              >
                <span
                  className="font-mono text-[26px] font-bold leading-none tabular-nums"
                  style={{ color: TILE_INK }}
                >
                  {count}
                </span>
                <span
                  className="text-[11px] font-bold uppercase leading-tight tracking-[0.04em]"
                  style={{ color: TILE_INK }}
                >
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
