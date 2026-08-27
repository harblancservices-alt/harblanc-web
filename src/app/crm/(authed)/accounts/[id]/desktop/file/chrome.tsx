import type { ReactNode } from "react";

/**
 * The company file's shared furniture.
 *
 * ── THE CARDS HAVE TO READ AS SEPARATE OBJECTS ────────────────────────
 *
 * Brent, 2026-08-26: "make the boarders and stuff the same color as the
 * side column darker card boarders and better card outlines for each. also
 * we removed the numbers from each card like 01 02 03 the cards are missing
 * seperation."
 *
 * One complaint, three symptoms. A white card with a #d3d7e1 hairline on a
 * #e7eaf1 canvas has almost no edge — put four of them side by side and
 * they read as one grey field with text in it. Three things fix it, and
 * they are cheap:
 *
 *   1. THE HEADER IS A DARK BAR, not a line of small caps on white. This is
 *      what does most of the work: every card now starts with a solid
 *      graphite band, so the eye counts four objects before it reads a
 *      single word.
 *   2. THE BORDER IS THE SIDEBAR'S OWN COLOUR — --graphite, the exact token
 *      the left column uses, not a darker grey picked to look right. The
 *      card outline and the app's main structural edge are now the same
 *      value.
 *   3. THE NUMBERS ARE BACK. 01 / 02 / 03 / 04 sit in the dark bar as a
 *      white chip. They are not decoration: the four panels are a real
 *      sequence — who do I call, what was said, what is owed, what do we
 *      still not know — which is the order you work a company in.
 *
 * BLUE IS FOR BUTTONS, NOT FOR STRUCTURE (same message: "i want to do the
 * blue for the buttons obviously"). Nothing here is accent-coloured. The
 * accent stays on things you click — the outcome buttons, Done, links, the
 * active tab, the current stage cell — so it keeps meaning "act on this"
 * rather than becoming another surface colour.
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
  // border-graphite, not border-line: the sidebar's colour, so a card edge
  // and the app's main structural edge are the same value.
  return (
    <section className={`border border-graphite bg-card ${className}`}>{children}</section>
  );
}

/**
 * A panel's header bar — solid graphite, white text.
 *
 * `n` renders the numbered chip. Omitting it gives the same dark bar
 * without a number, which is what the composer uses: "What happened" is
 * where you WRITE, not one of the four things you read, so it deliberately
 * sits outside the 01-04 sequence.
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
    <div className="flex items-center gap-2 bg-graphite px-3 py-2">
      {n && (
        // Inverted against the dark bar — white chip, graphite figure. The
        // old dark-on-white chip would disappear into this background.
        <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[2px] bg-white text-[10px] font-bold text-graphite crm-num">
          {n}
        </span>
      )}
      <Micro className="text-white">{title}</Micro>
      {count !== undefined && count !== null && (
        <span className="min-w-0 truncate text-[11.5px] text-white/55">{count}</span>
      )}
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}

/** The hairline between rows INSIDE a panel. Stays pale on purpose — the
 * dark border is what separates one card from the next, and using it again
 * between every row would turn a card into a grid and undo the separation
 * it just bought. */
export function Rule() {
  return <div className="h-px bg-line" />;
}
