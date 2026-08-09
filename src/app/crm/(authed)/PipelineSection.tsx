import Link from "next/link";
import { SELECTABLE_LIFECYCLE_STAGES, LIFECYCLE_LABEL, type LifecycleStage } from "./accounts/lifecycle";

export type PipelineCounts = Record<LifecycleStage, number>;

/** Small per-stage accent dot color — Brent's palette, reused from the
 * earlier outline-tile pass. Kept as a thin accent only (a dot, not a
 * border/fill) now that the pills themselves are small and neutral. */
const STAGE_COLOR: Record<(typeof SELECTABLE_LIFECYCLE_STAGES)[number], string> = {
  lead: "#2563eb",
  researching: "#7c3aed",
  contacted: "#0891b2",
  prospect: "#d97706",
  in_the_door: "#4f46e5",
  quoted: "#0d9488",
  active_customer: "#15803d",
};

const PILL_INK = "#0b0f14";

/**
 * PIPELINE — a compact, wrapping row of small clickable stage pills (Brent's
 * call, replacing the earlier full-width outline-tile grid and its Card/
 * CardHead chrome entirely — no title bar, just the strip, sitting between
 * the button cockpit and Needs attention). Each pill is a small rounded-
 * square chip: a thin colored dot for the stage's accent, the live count,
 * and the stage label — black text throughout, no big colored fill/border.
 * Links to /crm/accounts?stage=<canonical-slug>, the same `stage` query
 * param AccountsFilters already reads and syncs its select control to. Only
 * walks the approved 7-stage funnel (SELECTABLE_LIFECYCLE_STAGES) — a
 * company still sitting on a legacy stage (qualified/inactive/lost) doesn't
 * appear here, matching the profile's own stage tracker.
 */
export function PipelineSection({ counts }: { counts: PipelineCounts }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SELECTABLE_LIFECYCLE_STAGES.map((stage) => {
        const count = counts[stage];
        return (
          <Link
            key={stage}
            href={`/crm/accounts?stage=${stage}`}
            prefetch={false}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3 shadow-e1 transition-all hover:-translate-y-0.5 hover:border-fg-subtle hover:shadow-e2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
            <span className="font-mono text-[13.5px] font-bold tabular-nums" style={{ color: PILL_INK }}>
              {count}
            </span>
            <span
              className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-[0.03em]"
              style={{ color: PILL_INK }}
            >
              {LIFECYCLE_LABEL[stage]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
