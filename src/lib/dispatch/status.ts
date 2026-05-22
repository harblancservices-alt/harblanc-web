/**
 * Lead status state machine for the dispatch workspace.
 *
 * Phase 4A expanded from 5 to 8 states:
 *
 *   new                    → request just landed, untouched
 *   contacted              → Brent reached out (phone / email) but no
 *                            estimate has been sent yet
 *   estimate_sent          → estimate emailed via the workspace composer
 *   awaiting_confirmation  → customer accepted the range; working out
 *                            specifics, formal PDF still pending
 *   booked                 → formal PDF quote sent + customer accepted
 *   dispatched             → load is on the truck / in motion
 *   archived               → closed, won, complete, no longer active
 *   lost                   → didn't win the freight, declined, cancelled
 *
 * Transitions are intentionally NOT strictly enforced in code. Real
 * dispatch is messier than a linear funnel — a booked load can fall
 * through to lost, an archived lead can come back to contacted, etc.
 * The `suggestedNext` helper just hints at the most likely next state.
 */

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "estimate_sent",
  "awaiting_confirmation",
  "booked",
  "dispatched",
  "archived",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isLeadStatus(s: string): s is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(s);
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New lead",
  contacted: "Contacted",
  estimate_sent: "Estimate sent",
  awaiting_confirmation: "Awaiting confirmation",
  booked: "Booked",
  dispatched: "Dispatched",
  archived: "Archived",
  lost: "Lost",
};

/**
 * Tailwind classes for the status pill. Restrained, operational palette:
 *
 *   new                   neutral red (incoming, needs action)
 *   contacted             muted neutral (engaged but not yet quoted)
 *   estimate_sent         blue (waiting on customer)
 *   awaiting_confirmation amber (in-motion, close to booking)
 *   booked                green (won)
 *   dispatched            deeper green (won + executing)
 *   archived              muted gray (off-funnel)
 *   lost                  muted red/gray (off-funnel, didn't win)
 */
export const LEAD_STATUS_CLASSES: Record<LeadStatus, string> = {
  new: "border-red-700 bg-red-950/40 text-red-300",
  contacted: "border-neutral-600 bg-neutral-900 text-neutral-200",
  estimate_sent: "border-blue-700 bg-blue-950/40 text-blue-300",
  awaiting_confirmation: "border-amber-700 bg-amber-950/40 text-amber-300",
  booked: "border-green-700 bg-green-950/40 text-green-300",
  dispatched: "border-emerald-600 bg-emerald-950/50 text-emerald-200",
  archived: "border-neutral-700 bg-neutral-900 text-neutral-400",
  lost: "border-neutral-700 bg-neutral-900/60 text-neutral-500",
};

/**
 * Suggest the most likely next state from a given state. Drives the
 * one-tap "advance" button in StatusSelector.
 */
export function suggestedNext(current: LeadStatus): LeadStatus | null {
  switch (current) {
    case "new":
      return "contacted";
    case "contacted":
      return "estimate_sent";
    case "estimate_sent":
      return "awaiting_confirmation";
    case "awaiting_confirmation":
      return "booked";
    case "booked":
      return "dispatched";
    case "dispatched":
      return "archived";
    case "archived":
    case "lost":
      return null;
  }
}
