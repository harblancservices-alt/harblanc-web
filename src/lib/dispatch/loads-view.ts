import type { LeadStatus } from "./status";
import type { UrgencyChip } from "./urgency";

/**
 * Display-side taxonomy for the Loads work queue.
 *
 * The database stores 13 fine-grained lead_status values (see
 * ./status.ts). Operationally the dispatcher reasons about 8 coarser
 * buckets — every load surfaced in the work queue has one of these.
 * `mapToDisplayStatus` collapses the 13 DB values to these 8.
 *
 * Display status is a UI concept only. It is not persisted, not
 * directly editable. Source of truth remains `LeadStatus` on
 * `quote_requests.lead_status`. If the underlying status machine
 * changes, only the mapping below needs updating.
 */
export type LoadDisplayStatus =
  | "quoted"
  | "booked"
  | "scheduled"
  | "at_pickup"
  | "in_transit"
  | "delivered"
  | "archived"
  | "cancelled";

export const LOAD_DISPLAY_STATUS_LABELS: Record<LoadDisplayStatus, string> = {
  quoted: "Quoted",
  booked: "Booked",
  scheduled: "Scheduled",
  at_pickup: "At pickup",
  in_transit: "In transit",
  delivered: "Delivered",
  archived: "Archived",
  cancelled: "Cancelled",
};

export function mapToDisplayStatus(s: LeadStatus): LoadDisplayStatus {
  switch (s) {
    case "new":
    case "contacted":
    case "estimate_sent":
      return "quoted";
    case "awaiting_confirmation":
    case "booked":
      return "booked";
    case "awaiting_payment":
    case "ready_to_dispatch":
      return "scheduled";
    case "dispatched":
      return "at_pickup";
    case "picked_up":
    case "in_transit":
      return "in_transit";
    case "delivered":
      return "delivered";
    case "archived":
      return "archived";
    case "lost":
      return "cancelled";
  }
}

/**
 * Dark-mode pill classes for the display status. Restrained palette —
 * commercial half (quoted/booked) reads in zinc/indigo, scheduling and
 * movement walk through blue → amber → emerald → green, terminal
 * states (archived/cancelled) desaturated to zinc.
 *
 * Used inside the dark Loads workstation surface.
 */
export const LOAD_DISPLAY_STATUS_CLASSES: Record<LoadDisplayStatus, string> = {
  quoted: "border-zinc-700 bg-zinc-900 text-zinc-300",
  booked: "border-indigo-700 bg-indigo-950/40 text-indigo-300",
  scheduled: "border-blue-700 bg-blue-950/40 text-blue-300",
  at_pickup: "border-amber-700 bg-amber-950/40 text-amber-300",
  in_transit: "border-emerald-700 bg-emerald-950/40 text-emerald-300",
  delivered: "border-green-700 bg-green-950/40 text-green-300",
  archived: "border-zinc-800 bg-zinc-900/60 text-zinc-500",
  cancelled: "border-zinc-800 bg-zinc-900/60 text-zinc-500",
};

/**
 * Hex color for the 3px status rail on the left side of each row. Hex
 * (not Tailwind class) so it can be set via inline style on a
 * single-side border without a long generated class string.
 */
export const LOAD_DISPLAY_STATUS_RAIL: Record<LoadDisplayStatus, string> = {
  quoted: "#71717a",
  booked: "#6366f1",
  scheduled: "#3b82f6",
  at_pickup: "#f59e0b",
  in_transit: "#10b981",
  delivered: "#22c55e",
  archived: "#52525b",
  cancelled: "#52525b",
};

/**
 * Coarse next-step verb for a load. Derived from `leadStatus` + the
 * top urgency chip. The verb is the operator's imperative at a glance
 * ("Send invoice", "Call consignee"); the subtitle line carries the
 * urgency chip label when one is active so the row tells the operator
 * BOTH what to do AND why it's urgent.
 *
 * When the lead is in a terminal state (`archived` or `lost`), verb
 * collapses to an em-dash — the row has no next action.
 */
export type NextAction = {
  verb: string;
  subtitle: string;
};

export function nextAction(
  leadStatus: LeadStatus,
  topUrgencyLabel: string | null,
): NextAction {
  const verb = nextActionVerb(leadStatus);
  return {
    verb,
    subtitle: topUrgencyLabel ?? "",
  };
}

function nextActionVerb(leadStatus: LeadStatus): string {
  switch (leadStatus) {
    case "new":
      return "Reach out";
    case "contacted":
      return "Send quote";
    case "estimate_sent":
      return "Wait for accept";
    case "awaiting_confirmation":
      return "Confirm details";
    case "booked":
      return "Send rate con";
    case "awaiting_payment":
      return "Follow up payment";
    case "ready_to_dispatch":
      return "Assign truck";
    case "dispatched":
      return "Confirm pickup";
    case "picked_up":
      return "Track in transit";
    case "in_transit":
      return "Call consignee";
    case "delivered":
      return "Send invoice";
    case "archived":
    case "lost":
      return "—";
  }
}

/**
 * Format a load's revenue for display. Prefers the finalized quote's
 * total_amount when one has been sent; falls back to the estimate's
 * linehaul_low (or low–high range when the two differ). Returns null
 * when nothing has been quoted yet — the table renders that as "—".
 *
 * NOT a perfect "revenue" for the books — this is the most recently
 * communicated rate to the customer, not a paid amount. AR work
 * (paid vs. invoiced totals) belongs in a separate AR view later.
 */
export type RateInputs = {
  finalizedTotal: number | null;
  estimateLow: number | null;
  estimateHigh: number | null;
};

export function formatLoadRate(input: RateInputs): string | null {
  if (input.finalizedTotal != null && input.finalizedTotal > 0) {
    return formatUsd(input.finalizedTotal);
  }
  if (input.estimateLow != null && input.estimateLow > 0) {
    if (
      input.estimateHigh != null &&
      input.estimateHigh > 0 &&
      input.estimateHigh !== input.estimateLow
    ) {
      return `${formatUsd(input.estimateLow)}–${formatUsd(input.estimateHigh)}`;
    }
    return formatUsd(input.estimateLow);
  }
  return null;
}

function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * Compose a "City, ST 12345" string from optional parts. When city /
 * state are missing, falls back to the ZIP alone. Returns null only
 * when every part is missing — the table renders that as "Lane TBD".
 */
export function formatPlace(
  city: string | null,
  state: string | null,
  zip: string | null,
): string | null {
  const c = (city ?? "").trim();
  const s = (state ?? "").trim().toUpperCase();
  const z = (zip ?? "").trim();
  if (c && s && z) return `${c}, ${s} ${z}`;
  if (c && s) return `${c}, ${s}`;
  if (z) return z;
  if (c) return c;
  if (s) return s;
  return null;
}

/**
 * Attention-first comparator. Sorts rows so alert-severity flags
 * surface above warn-severity above no-flag rows. Within the same
 * severity bucket, older flags rise — they've been waiting longer.
 * Rows with no flag at all break ties by most-recently-touched.
 */
export type SortableRow = {
  topUrgency: UrgencyChip | null;
  lead_status_updated_at: string | null;
  created_at: string;
};

export function compareByAttentionThenDate(
  a: SortableRow,
  b: SortableRow,
): number {
  const sevRank = (chip: UrgencyChip | null): number =>
    chip == null ? 2 : chip.severity === "alert" ? 0 : 1;
  const ra = sevRank(a.topUrgency);
  const rb = sevRank(b.topUrgency);
  if (ra !== rb) return ra - rb;

  if (a.topUrgency && b.topUrgency) {
    return b.topUrgency.ageHours - a.topUrgency.ageHours;
  }

  const at = new Date(a.lead_status_updated_at ?? a.created_at).getTime() || 0;
  const bt = new Date(b.lead_status_updated_at ?? b.created_at).getTime() || 0;
  return bt - at;
}
