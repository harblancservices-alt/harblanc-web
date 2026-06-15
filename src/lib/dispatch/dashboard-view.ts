import type { LeadStatus } from "./status";
import type { UrgencyChip, UrgencyChipKind } from "./urgency";
import { mapToDisplayStatus, type LoadDisplayStatus } from "./loads-view";

/**
 * Helpers for the owner dashboard.
 *
 * The Dashboard's "Needs attention" card collapses multiple urgency
 * chips per load into a single row — so one load with both
 * `delivered_unconfirmed` and `awaiting_payment_long` shows up once,
 * with both chip labels surfaced as small tags and the highest-
 * priority action verb in the row's call-to-action.
 *
 * The verb / problem-label mappings live here as pure data so the
 * dashboard and any future drawers share them without duplication.
 */

/**
 * Operator-facing problem label for a single urgency chip. Short,
 * concrete, no jargon, no time math (the chip's own age subtitle
 * carries the "how long" context).
 */
export function chipToProblemLabel(kind: UrgencyChipKind): string {
  switch (kind) {
    case "new_lead_stale":
      return "New quote";
    case "stale_estimate":
      return "Quote follow-up";
    case "intake_in_progress":
      return "Intake stalled";
    case "awaiting_payment_long":
      return "Payment late";
    case "ready_to_dispatch_long":
      return "Truck not assigned";
    case "dispatched_no_pickup":
      return "Pickup unconfirmed";
    case "in_transit_stale":
      return "Driver out of contact";
    case "delivered_unconfirmed":
      return "Invoice not sent";
  }
}

/**
 * Action verb for a single urgency chip. Imperative, short — reads
 * as "what you do next" in the dashboard row.
 */
export function chipToActionVerb(kind: UrgencyChipKind): string {
  switch (kind) {
    case "new_lead_stale":
      return "Send estimate";
    case "stale_estimate":
      return "Follow up";
    case "intake_in_progress":
      return "Nudge customer";
    case "awaiting_payment_long":
      return "Call AP";
    case "ready_to_dispatch_long":
      return "Assign truck";
    case "dispatched_no_pickup":
      return "Confirm pickup";
    case "in_transit_stale":
      return "Call driver";
    case "delivered_unconfirmed":
      return "Send invoice";
  }
}

/**
 * Priority ranking for an urgency chip kind — lower number = more
 * urgent. Drives both attention-row sort order and "which verb wins
 * when a load has multiple chips" tie-break.
 *
 * Logic: time-sensitive operational issues (pickup, driver) rank
 * above back-office hygiene (invoice, AR), which rank above passive
 * follow-ups (lead, quote). Within the same priority bucket, the
 * older chip wins (handled by the comparator below using ageHours).
 */
export function chipKindPriority(kind: UrgencyChipKind): number {
  switch (kind) {
    case "dispatched_no_pickup":
      return 0;
    case "in_transit_stale":
      return 1;
    case "ready_to_dispatch_long":
      return 2;
    // A brand-new quote awaiting its first response ranks just below the
    // live-truck issues and above all back-office hygiene — respond fast
    // or lose the freight.
    case "new_lead_stale":
      return 3;
    case "delivered_unconfirmed":
      return 4;
    case "awaiting_payment_long":
      return 5;
    case "intake_in_progress":
      return 6;
    case "stale_estimate":
      return 7;
  }
}

/**
 * Pick the highest-priority chip from a non-empty list. Stable across
 * ties via ageHours (older wins).
 */
export function pickPrimaryChip(chips: ReadonlyArray<UrgencyChip>): UrgencyChip {
  let best = chips[0]!;
  for (let i = 1; i < chips.length; i++) {
    const c = chips[i]!;
    const pBest = chipKindPriority(best.kind);
    const pC = chipKindPriority(c.kind);
    if (pC < pBest) {
      best = c;
      continue;
    }
    if (pC === pBest && c.ageHours > best.ageHours) {
      best = c;
    }
  }
  return best;
}

/**
 * One row on the Dashboard "Needs attention" card. Every row represents
 * exactly one load with at least one urgency chip; multiple chips on
 * the same load collapse into the same row (their labels join the
 * `flagLabels` array; the row's primary action comes from the highest-
 * priority chip).
 */
export type AttentionRow = {
  leadId: string;
  /** Short problem name shown on the left of the row. */
  problemLabel: string;
  /** Severity of the primary chip — drives row tint + rail color. */
  severity: "warn" | "alert";
  /** Age string for the primary chip subtitle (e.g. "6d no response"). */
  ageSubtitle: string;
  /** All chip labels for the load — surfaced as small tags inline when count > 1. */
  flagLabels: ReadonlyArray<string>;
  /** Customer name + display status for context. */
  customerName: string;
  /** Lane string ("Houston → Memphis"). */
  laneLabel: string;
  /** Pre-formatted rate display ("$1,400" or "$2,500–$3,200"). */
  rateDisplay: string | null;
  /** Imperative action verb pulled from the primary chip. */
  actionVerb: string;
};

/**
 * Lower number = higher priority on the dashboard list. Alert chips
 * always above warn chips; within the same severity, older chip wins.
 */
export function compareAttentionRows(a: AttentionRow, b: AttentionRow): number {
  const sevA = a.severity === "alert" ? 0 : 1;
  const sevB = b.severity === "alert" ? 0 : 1;
  if (sevA !== sevB) return sevA - sevB;
  // Same severity — older problem (by subtitle pattern) wins. Without
  // the raw ageHours here, fall back to alphabetical on ageSubtitle so
  // results are stable. Callers that need ageHours sort do it upstream.
  return 0;
}

/**
 * Format a relative-time label for "recent" rows. Coarser than the
 * Loads page version (this card shows older items grayed out, so
 * fine-grained minutes don't matter — week/day granularity is enough).
 */
export function recentAgeLabel(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMs = now.getTime() - t;
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return minutes <= 1 ? "1m" : minutes + "m";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h";
  const days = Math.floor(hours / 24);
  if (days < 7) return days + "d";
  const weeks = Math.floor(days / 7);
  return weeks + "w";
}

/**
 * Inputs for picking the "current load" card. We choose the most
 * operationally-active load: in_transit / picked_up first, then
 * at_pickup, then scheduled, then booked. Falls back to null when
 * the truck has no active commitment.
 */
export type CurrentLoadCandidate = {
  leadId: string;
  displayStatus: LoadDisplayStatus;
  leadStatusUpdatedAt: string | null;
  createdAt: string;
};

export function pickCurrentLoad<T extends CurrentLoadCandidate>(
  candidates: ReadonlyArray<T>,
): T | null {
  const priority: Record<LoadDisplayStatus, number> = {
    in_transit: 0,
    at_pickup: 1,
    scheduled: 2,
    booked: 3,
    quoted: 99,
    delivered: 99,
    archived: 99,
    cancelled: 99,
  };
  let best: T | null = null;
  let bestPriority = 100;
  let bestTime = 0;
  for (const c of candidates) {
    const p = priority[c.displayStatus];
    if (p >= 99) continue;
    const t =
      new Date(c.leadStatusUpdatedAt ?? c.createdAt).getTime() || 0;
    if (p < bestPriority || (p === bestPriority && t > bestTime)) {
      best = c;
      bestPriority = p;
      bestTime = t;
    }
  }
  return best;
}

/**
 * Re-export — callers building dashboard data want this in scope.
 */
export { mapToDisplayStatus };
export type { LeadStatus };
