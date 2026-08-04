import type { HTMLAttributes } from "react";

/**
 * /tms-v2's Card primitive — see Button.tsx's header comment for why this
 * lives under components/tms-v2/ui rather than colliding with /admin's
 * existing components/ui/Card.
 *
 * Reserved for genuinely discrete objects (a KPI tile, a document
 * thumbnail) — NOT for "a section of a page" (v2-design.md house rule #4).
 * Lists use hairlines (<DataList>), not stacked card boxes. If you're
 * reaching for <Card> to wrap a page section, use a plain hairline
 * (`border-b border-line`) instead.
 */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-line bg-card p-4 ${className}`}
      {...props}
    />
  );
}
