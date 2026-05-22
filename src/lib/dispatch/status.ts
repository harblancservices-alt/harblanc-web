/**
 * Lead status state machine for the dispatch workspace.
 *
 * Phase 5B extension — pipeline now covers shipment execution, not just
 * commercial agreement. 13 states across two halves:
 *
 *   COMMERCIAL (lead → booked):
 *     new                    → request just landed, untouched
 *     contacted              → Brent reached out, no estimate yet
 *     estimate_sent          → range proposal emailed
 *     awaiting_confirmation  → range accepted, intake submitted; working
 *                              out specifics, finalized quote pending
 *     booked                 → finalized quote sent (and accepted)
 *
 *   EXECUTION (booked → closed):
 *     awaiting_payment       → finalized quote sent; waiting on deposit
 *     ready_to_dispatch      → payment / deposit acceptable; truck not
 *                              yet locked
 *     dispatched             → truck assigned; on its way to shipper
 *     picked_up              → driver loaded at shipper
 *     in_transit             → between pickup and delivery
 *     delivered              → offloaded at consignee
 *     archived               → closed, complete, no further action
 *     lost                   → didn't win the freight, declined, cancelled
 *
 * Transitions are intentionally NOT strictly enforced in code. Real
 * dispatch is messier than a linear funnel — a delivered load can fall
 * back to lost if the customer disputes, etc. suggestedNext() hints at
 * the likely next state for one-tap advancement in the UI.
 */

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "estimate_sent",
  "awaiting_confirmation",
  "booked",
  "awaiting_payment",
  "ready_to_dispatch",
  "dispatched",
  "picked_up",
  "in_transit",
  "delivered",
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
  awaiting_payment: "Awaiting payment",
  ready_to_dispatch: "Ready to dispatch",
  dispatched: "Dispatched",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered: "Delivered",
  archived: "Archived",
  lost: "Lost",
};

/**
 * Tailwind classes for the status pill. Restrained operational palette.
 * Commercial half stays in the existing red/blue/amber/green family;
 * execution half steps progressively through emerald/teal/cyan tones
 * so the pill visibly walks across the truck-on-the-road lifecycle.
 */
export const LEAD_STATUS_CLASSES: Record<LeadStatus, string> = {
  new: "border-red-700 bg-red-950/40 text-red-300",
  contacted: "border-neutral-600 bg-neutral-900 text-neutral-200",
  estimate_sent: "border-blue-700 bg-blue-950/40 text-blue-300",
  awaiting_confirmation: "border-amber-700 bg-amber-950/40 text-amber-300",
  booked: "border-green-700 bg-green-950/40 text-green-300",
  awaiting_payment: "border-amber-600 bg-amber-950/30 text-amber-200",
  ready_to_dispatch: "border-emerald-700 bg-emerald-950/40 text-emerald-300",
  dispatched: "border-emerald-600 bg-emerald-950/50 text-emerald-200",
  picked_up: "border-teal-600 bg-teal-950/40 text-teal-200",
  in_transit: "border-cyan-600 bg-cyan-950/40 text-cyan-200",
  delivered: "border-sky-600 bg-sky-950/40 text-sky-200",
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
      return "awaiting_payment";
    case "awaiting_payment":
      return "ready_to_dispatch";
    case "ready_to_dispatch":
      return "dispatched";
    case "dispatched":
      return "picked_up";
    case "picked_up":
      return "in_transit";
    case "in_transit":
      return "delivered";
    case "delivered":
      return "archived";
    case "archived":
    case "lost":
      return null;
  }
}
