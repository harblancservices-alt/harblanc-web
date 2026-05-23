import type { LeadStatus } from "./status";

/**
 * Server-side urgency / aging signal computation for a lead.
 *
 * The dispatcher home and the quote detail page surface "urgency chips"
 * — short operational warnings that aren't part of the status enum but
 * matter for what needs attention RIGHT NOW.
 *
 * Each chip carries:
 *   - kind: stable identifier (used for filtering / counters)
 *   - label: short operator-facing string
 *   - severity: "warn" (amber) or "alert" (red)
 *
 * The function is purely deterministic — no DB calls. Callers fetch the
 * row + its derived timestamps (latest sent estimate, latest finalized
 * quote sent, latest BOL sent) and hand them in. Keeps the helper
 * cacheable and easy to test.
 */

export type UrgencyChipKind =
  | "stale_estimate"
  | "intake_in_progress"
  | "awaiting_payment_long"
  | "ready_to_dispatch_long"
  | "dispatched_no_pickup"
  | "in_transit_stale"
  | "delivered_unconfirmed"
  | "new_lead_stale";

export type UrgencySeverity = "warn" | "alert";

export type UrgencyChip = {
  kind: UrgencyChipKind;
  label: string;
  severity: UrgencySeverity;
  /** Hours since the trigger event — handy for tooltips / sort. */
  ageHours: number;
};

/**
 * Inputs are the few timestamps urgency depends on. Everything is
 * optional because not every lead has every artifact.
 */
export type UrgencyInputs = {
  /** Current lead status. */
  leadStatus: LeadStatus;
  /** When the lead landed (quote_requests.created_at). */
  createdAt: string;
  /** Most recent dispatch_estimates.sent_at, if any. */
  latestEstimateSentAt: string | null;
  /** shipment_intake.created_at when status === 'in_progress'. */
  intakeStartedAt: string | null;
  /** shipment_intake.submitted_at when status === 'submitted'. */
  intakeSubmittedAt: string | null;
  /** Most recent finalized_quotes.sent_at, if any. */
  latestFinalizedSentAt: string | null;
  /** Most recent bills_of_lading.sent_at, if any. */
  latestBolSentAt: string | null;
  /** lead_status_updated_at — when the lead entered its current status. */
  leadStatusUpdatedAt: string | null;
  /** Server's "now" — passed in so the helper is deterministic in tests. */
  now: Date;
};

const HOUR_MS = 60 * 60 * 1000;

function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return ms / HOUR_MS;
}

function fmtAge(hours: number): string {
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

/**
 * Compute the urgency chips for one lead. Returns 0..N chips depending on
 * which triggers are active. Empty array means "no operational warnings"
 * — the dispatcher can move on.
 */
export function computeUrgency(input: UrgencyInputs): UrgencyChip[] {
  const chips: UrgencyChip[] = [];
  const { leadStatus, now } = input;

  // ── New lead stale: untouched for > 2 hours ───────────────────────────
  if (leadStatus === "new") {
    const h = hoursSince(input.createdAt, now);
    if (h !== null && h >= 2) {
      chips.push({
        kind: "new_lead_stale",
        label: `New lead ${fmtAge(h)} no response`,
        severity: h >= 24 ? "alert" : "warn",
        ageHours: h,
      });
    }
  }

  // ── Stale estimate: sent > 24h, customer hasn't engaged ───────────────
  if (leadStatus === "estimate_sent") {
    const h = hoursSince(input.latestEstimateSentAt, now);
    if (h !== null && h >= 24) {
      chips.push({
        kind: "stale_estimate",
        label: `Estimate ${fmtAge(h)} no response`,
        severity: h >= 72 ? "alert" : "warn",
        ageHours: h,
      });
    }
  }

  // ── Intake in progress: started but not submitted, > 12h ──────────────
  //
  // We treat this as urgent only when the customer started the intake
  // (so a row exists) but hasn't submitted it yet. The lead might still
  // be in estimate_sent or already moved to awaiting_confirmation
  // depending on whether they accepted via Save Progress or Submit.
  if (input.intakeStartedAt && !input.intakeSubmittedAt) {
    const h = hoursSince(input.intakeStartedAt, now);
    if (h !== null && h >= 12) {
      chips.push({
        kind: "intake_in_progress",
        label: `Intake idle ${fmtAge(h)}`,
        severity: h >= 48 ? "alert" : "warn",
        ageHours: h,
      });
    }
  }

  // ── Awaiting payment for too long ─────────────────────────────────────
  if (leadStatus === "awaiting_payment") {
    const trigger = input.latestFinalizedSentAt ?? input.leadStatusUpdatedAt;
    const h = hoursSince(trigger, now);
    if (h !== null && h >= 24) {
      chips.push({
        kind: "awaiting_payment_long",
        label: `Awaiting payment ${fmtAge(h)}`,
        severity: h >= 72 ? "alert" : "warn",
        ageHours: h,
      });
    }
  }

  // ── Ready to dispatch but not yet assigned ────────────────────────────
  if (leadStatus === "ready_to_dispatch") {
    const h = hoursSince(input.leadStatusUpdatedAt, now);
    if (h !== null && h >= 12) {
      chips.push({
        kind: "ready_to_dispatch_long",
        label: `Ready ${fmtAge(h)} — assign truck`,
        severity: h >= 48 ? "alert" : "warn",
        ageHours: h,
      });
    }
  }

  // ── Dispatched but no pickup confirmation ─────────────────────────────
  if (leadStatus === "dispatched") {
    const h = hoursSince(input.leadStatusUpdatedAt, now);
    if (h !== null && h >= 18) {
      chips.push({
        kind: "dispatched_no_pickup",
        label: `Dispatched ${fmtAge(h)} — confirm pickup`,
        severity: h >= 36 ? "alert" : "warn",
        ageHours: h,
      });
    }
  }

  // ── In transit too long ───────────────────────────────────────────────
  if (leadStatus === "in_transit") {
    const h = hoursSince(input.leadStatusUpdatedAt, now);
    if (h !== null && h >= 48) {
      chips.push({
        kind: "in_transit_stale",
        label: `In transit ${fmtAge(h)} — check on driver`,
        severity: h >= 96 ? "alert" : "warn",
        ageHours: h,
      });
    }
  }

  // ── Delivered but not closed out (POD / invoice) ──────────────────────
  if (leadStatus === "delivered") {
    const h = hoursSince(input.leadStatusUpdatedAt, now);
    if (h !== null && h >= 24) {
      chips.push({
        kind: "delivered_unconfirmed",
        label: `Delivered ${fmtAge(h)} — close out`,
        severity: h >= 72 ? "alert" : "warn",
        ageHours: h,
      });
    }
  }

  return chips;
}

/**
 * Pick the single highest-severity chip from a list. Used when we have
 * limited space (e.g. list rows) and need to pick which warning gets
 * the prime real estate.
 */
export function topUrgency(chips: ReadonlyArray<UrgencyChip>): UrgencyChip | null {
  if (chips.length === 0) return null;
  return chips.reduce((best, c) => {
    if (c.severity === "alert" && best.severity !== "alert") return c;
    if (c.severity === best.severity && c.ageHours > best.ageHours) return c;
    return best;
  });
}

/**
 * Tailwind classes for the urgency chip pill, by severity.
 */
export const URGENCY_SEVERITY_CLASSES: Record<UrgencySeverity, string> = {
  warn: "border-amber-700 bg-amber-950/40 text-amber-300",
  alert: "border-red-700 bg-red-950/50 text-red-300",
};

/**
 * Phase COLOR-2: light-mode twin for URGENCY_SEVERITY_CLASSES. Same
 * 2-key shape, switched to the Tailwind light-pill family. NOT YET
 * wired into consumers — the dark mapping above remains the source
 * of truth until the COLOR-3+ admin retheme switches each consumer.
 */
export const URGENCY_SEVERITY_CLASSES_LIGHT: Record<UrgencySeverity, string> = {
  warn: "border-amber-300 bg-amber-50 text-amber-800",
  alert: "border-red-300 bg-red-50 text-red-800",
};
