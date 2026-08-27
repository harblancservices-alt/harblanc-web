import type { ReactNode } from "react";

/**
 * The company file's shared furniture.
 *
 * ── ONE DARK REGION, NOT SIX (Brent, 2026-08-26) ──────────────────────
 *
 *   "we need a better color scheme this is hard on the eyes."
 *
 * He is right, and the previous revision is why. The brief before this one
 * was "darker card borders and better outlines", and the answer — a solid
 * graphite bar on every card header — was correct for one card and wrong
 * for the page. Stacked up you got a dark sidebar, a dark page header, then
 * four more full-width dark bands down the body: six heavy regions all
 * competing, and nowhere quiet to rest.
 *
 * So the weight is spent ONCE. The page header stays dark because it is the
 * anchor and it earns it. Everything below it separates with EDGES AND
 * SPACING instead:
 *
 *   - Card headers are a faint tint (--inset) on a white card, divided from
 *     the body by a hairline. Present, not loud.
 *   - The card border is --line-strong, a mid-grey. It has enough weight to
 *     read as a real edge against the canvas without announcing itself. A
 *     border's job is to separate, not to attract.
 *   - The white cards sit on --canvas, which is a blue-grey, so each card
 *     stands off the page on its own without needing a filled band.
 *
 * THE NUMBERS SURVIVED THE CHANGE, INVERTED. 01-04 are back to a dark chip
 * with white text, which is the right way round on a light header. They do
 * the same separation work the dark bands were doing, at a fraction of the
 * visual cost — which is the whole point: a numbered chip and a defined
 * border say "separate object" quietly, where a filled band shouts it.
 *
 * BLUE IS FOR ACTIONS ONLY, unchanged. Nothing structural is accent.
 */

/** The uppercase micro-label. Tight tracking at this size turns to mud, so
 * it opens up instead — the one place in the CRM that letter-spaces. */
export function Micro({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-[0.09em] ${className}`}>
      {children}
    </span>
  );
}

export function FileCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  // --line-strong, not --graphite: a mid-grey edge that separates the card
  // from the canvas without becoming another thing to look at.
  return (
    <section className={`border border-line-strong bg-card ${className}`}>{children}</section>
  );
}

/**
 * A panel's header — a faint tinted strip with a hairline under it.
 *
 * `n` renders the numbered chip. Omitting it gives the same strip without a
 * number, which is what the composer uses: "What happened" is where you
 * WRITE, not one of the four things you read, so it deliberately sits
 * outside the 01-04 sequence.
 */
export function SectionHead({
  n,
  title,
  count,
  action,
}: {
  n?: string;
  title: string;
  /** The muted figure beside the title — "3 people", "2 open". */
  count?: ReactNode;
  /** Right-aligned, usually a link or a small button. */
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line bg-inset px-3 py-2">
      {n && (
        <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[2px] bg-fg text-[10px] font-bold text-white crm-num">
          {n}
        </span>
      )}
      <Micro className="text-fg">{title}</Micro>
      {count !== undefined && count !== null && (
        <span className="min-w-0 truncate text-[11.5px] text-fg-subtle">{count}</span>
      )}
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}

/** The hairline between rows INSIDE a panel — deliberately lighter than the
 * card's own border, so a row division never competes with the edge that
 * separates one card from the next. */
export function Rule() {
  return <div className="h-px bg-line" />;
}
