import type { ReactNode } from "react";

/**
 * The company file's shared furniture.
 *
 * Brent, 2026-08-26, handing over a mockup: "make the company page look like
 * this inch for inch." The design leans hard on four repeated devices, so
 * they live here once rather than being re-typed in five panels and drifting:
 *
 *   FileCard      white card, hairline border, no radius to speak of
 *   SectionHead   the "01 WHO DO I CALL" bar — numbered chip, uppercase
 *                 title, a muted count, and an action on the right
 *   Micro         the uppercase micro-label used for OWNER / LANES / STAGE
 *   Rule          the hairline that separates rows inside a panel
 *
 * The numbered chips are NOT decoration. The design numbers four panels
 * 01-04 and the stage cells 01-10, and both sequences are real orders: the
 * panels run in the order you work a company (who do I call, what happened,
 * what is owed, what do we still not know), and the stages are the funnel.
 * Numbering something that is not a sequence is the thing to avoid; these
 * are sequences.
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
  return (
    <section className={`border border-line bg-card ${className}`}>{children}</section>
  );
}

/**
 * A panel's header bar. `n` renders the dark numbered chip; omitting it
 * gives the plain title bar the "WHAT HAPPENED" composer uses, which the
 * design deliberately leaves unnumbered because it is not one of the four
 * reading panels — it is the thing you type into.
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
    <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
      {n && (
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center bg-fg text-[10px] font-bold text-white crm-num">
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

/** The hairline between rows inside a panel. */
export function Rule() {
  return <div className="h-px bg-line" />;
}
