/**
 * Lead status state machine for the dispatch workspace.
 *
 *   new       → request just landed, untouched
 *   engaged   → Brent sent a first reply (estimate / question / etc)
 *   booking   → customer accepted the range, working out details
 *   confirmed → formal PDF quote sent + customer acknowledged
 *   archived  → lost / not a fit / cancelled — out of the active funnel
 *
 * Transitions are intentionally NOT strictly enforced in code. Real
 * dispatch is messier than a linear funnel — a confirmed load can fall
 * through to archived, an archived lead can come back to engaged, etc.
 * The `nextStates` helper just orders the dropdown sensibly.
 */

export const LEAD_STATUSES = [
  "new",
  "engaged",
  "booking",
  "confirmed",
  "archived",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isLeadStatus(s: string): s is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(s);
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  engaged: "Engaged",
  booking: "Booking",
  confirmed: "Confirmed",
  archived: "Archived",
};

/**
 * Tailwind classes for the status pill. Restrained, industrial palette.
 * Red = needs action. Amber/yellow = in motion. Green = won. Gray = off-funnel.
 */
export const LEAD_STATUS_CLASSES: Record<LeadStatus, string> = {
  new: "border-red-700 bg-red-950/40 text-red-300",
  engaged: "border-amber-700 bg-amber-950/40 text-amber-300",
  booking: "border-blue-700 bg-blue-950/40 text-blue-300",
  confirmed: "border-green-700 bg-green-950/40 text-green-300",
  archived: "border-neutral-700 bg-neutral-900 text-neutral-400",
};

/**
 * Suggest the most likely next state from a given state. Used to highlight
 * a default action in the status selector. Not enforced.
 */
export function suggestedNext(current: LeadStatus): LeadStatus | null {
  switch (current) {
    case "new":
      return "engaged";
    case "engaged":
      return "booking";
    case "booking":
      return "confirmed";
    case "confirmed":
    case "archived":
      return null;
  }
}
