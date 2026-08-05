import type { HTMLAttributes } from "react";

/**
 * /tms-v2's Card primitive — see Button.tsx's header comment for why this
 * lives under components/tms-v2/ui rather than colliding with /admin's
 * existing components/ui/Card.
 *
 * A raised white surface (shadow-e1) sitting above the gray --canvas page
 * background — the app's primary depth device (2026-08 depth pass). Used
 * for genuinely discrete objects (a KPI tile, a document thumbnail, a
 * page section that groups related content) as well as page sections that
 * benefit from being visually separated from the canvas. Lists still
 * prefer <DataList>'s own zebra/hairline rows for row-level data.
 *
 * `interactive` adds a hover elevation bump (shadow-e2) + pointer cursor
 * for cards that are themselves a click target (e.g. a summary card that
 * links elsewhere) — opt-in so static cards stay still.
 */
type CardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  /** Drop the shadow for a nested card inside another card (e.g. a
   * sub-panel) — keeps borders for separation without stacking shadows. */
  flat?: boolean;
};

export function Card({ className = "", interactive = false, flat = false, ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-line bg-card p-4 ${flat ? "" : "shadow-e1"} ${
        interactive ? "transition-shadow hover:shadow-e2" : ""
      } ${className}`}
      {...props}
    />
  );
}
