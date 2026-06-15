"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logDispatchEvent } from "@/lib/dispatch/events";
import { resolveByToken } from "@/lib/quote-token/lookup";
import { isLeadStatus, type LeadStatus } from "@/lib/dispatch/status";

/**
 * Server actions for the customer-facing /quote/accept/[token] page.
 *
 * No admin auth — the accept_token IS the authorization. resolveByToken
 * gates both Save Progress and Submit. Rejected lookups return cleanly
 * without leaking which step failed.
 *
 * Submission-side bookkeeping (Phase 5C audit fix):
 *   - On first interaction (any mode): stamp dispatch_estimates.accepted_at
 *     and log estimate_accepted. Idempotent.
 *   - On Submit specifically: log intake_submitted regardless of whether
 *     the customer also accepted in the same call. The previous
 *     `if (!acceptedAt) { ... } else if (mode === "submit") { ... }`
 *     swallowed intake_submitted on the common single-session path.
 *   - On Submit, advance quote_requests.lead_status to
 *     awaiting_confirmation when the lead is still in {new, contacted,
 *     estimate_sent}. Logs status_changed. Status never moves backwards.
 */

type SaveMode = "save" | "submit";

/** Statuses from which Submit should advance the lead to awaiting_confirmation. */
const ADVANCE_FROM_STATUSES: ReadonlySet<LeadStatus> = new Set([
  "new",
  "contacted",
  "estimate_sent",
]);

function s(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const str = String(v).trim();
  return str.length === 0 ? null : str;
}

function n(v: FormDataEntryValue | null): number | null {
  const str = s(v);
  if (str == null) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

/**
 * Allowed appointment-status codes — must match the CHECK constraint
 * added in migration 20260539000000_intake_date_windows.sql. We
 * normalize anything that isn't on the list back to NULL so a stray
 * value from a malformed form post can't poison the row.
 */
const ALLOWED_APPOINTMENT_STATUS = new Set([
  "flexible",
  "appointment_needed",
  "already_scheduled",
  "call_to_schedule",
]);

function appointmentStatus(v: FormDataEntryValue | null): string | null {
  const raw = s(v);
  if (raw == null) return null;
  return ALLOWED_APPOINTMENT_STATUS.has(raw) ? raw : null;
}

/**
 * Derive a human-readable text representation of a date window into
 * the legacy pickup_window / delivery_window column. Email renderers,
 * the Finalized Quote workspace, and admin Load Details all read the
 * legacy column — keeping it populated means none of those layers
 * need to change.
 */
function deriveWindowText(
  start: string | null,
  end: string | null,
): string | null {
  if (!start && !end) return null;
  if (start && end && start !== end) return `${start} – ${end}`;
  return start ?? end ?? null;
}

function readIntakeFields(formData: FormData): Record<string, unknown> {
  const pickupStart = s(formData.get("pickup_window_start"));
  const pickupEndRaw = s(formData.get("pickup_window_end"));
  const deliveryStart = s(formData.get("delivery_window_start"));
  const deliveryEndRaw = s(formData.get("delivery_window_end"));

  // End-before-start is rejected at the schema CHECK level (the
  // migration adds shipment_intake_pickup_window_order_check). Strip
  // an out-of-order end here too so the row passes both checks and
  // the customer doesn't lose their start date to a failed update.
  const pickupEnd =
    pickupStart && pickupEndRaw && pickupEndRaw < pickupStart
      ? null
      : pickupEndRaw;
  const deliveryEnd =
    deliveryStart && deliveryEndRaw && deliveryEndRaw < deliveryStart
      ? null
      : deliveryEndRaw;

  return {
    pickup_company: s(formData.get("pickup_company")),
    pickup_contact_name: s(formData.get("pickup_contact_name")),
    pickup_contact_phone: s(formData.get("pickup_contact_phone")),
    pickup_contact_email: s(formData.get("pickup_contact_email")),
    pickup_address_line1: s(formData.get("pickup_address_line1")),
    pickup_address_line2: s(formData.get("pickup_address_line2")),
    pickup_city: s(formData.get("pickup_city")),
    pickup_state: s(formData.get("pickup_state")),
    pickup_zip: s(formData.get("pickup_zip")),
    pickup_window_start: pickupStart,
    pickup_window_end: pickupEnd,
    // Legacy text column — keep populating so email renderers / admin /
    // FQ stay in sync without code changes upstream.
    pickup_window: deriveWindowText(pickupStart, pickupEnd),

    delivery_company: s(formData.get("delivery_company")),
    delivery_contact_name: s(formData.get("delivery_contact_name")),
    delivery_contact_phone: s(formData.get("delivery_contact_phone")),
    delivery_contact_email: s(formData.get("delivery_contact_email")),
    delivery_address_line1: s(formData.get("delivery_address_line1")),
    delivery_address_line2: s(formData.get("delivery_address_line2")),
    delivery_city: s(formData.get("delivery_city")),
    delivery_state: s(formData.get("delivery_state")),
    delivery_zip: s(formData.get("delivery_zip")),
    delivery_window_start: deliveryStart,
    delivery_window_end: deliveryEnd,
    delivery_window: deriveWindowText(deliveryStart, deliveryEnd),

    commodity_details: s(formData.get("commodity_details")),
    length_in: n(formData.get("length_in")),
    width_in: n(formData.get("width_in")),
    height_in: n(formData.get("height_in")),
    exact_weight_lbs: n(formData.get("exact_weight_lbs")),

    loading_responsibility: s(formData.get("loading_responsibility")),
    unloading_responsibility: s(formData.get("unloading_responsibility")),
    appointment_status: appointmentStatus(formData.get("appointment_status")),
    special_requirements: s(formData.get("special_requirements")),
    reference_links: s(formData.get("reference_links")),
    notes: s(formData.get("notes")),
  };
}

export type IntakeSaveResult =
  | { ok: true; status: "in_progress" | "submitted" }
  | { ok: false; reason: string };

async function persistIntake(
  token: string,
  formData: FormData,
  mode: SaveMode,
): Promise<IntakeSaveResult> {
  const resolved = await resolveByToken(token);
  if (!resolved.ok) {
    return { ok: false, reason: "This quote link isn't valid anymore." };
  }
  const { estimate, lead } = resolved;
  if (estimate.declinedAt) {
    return { ok: false, reason: "This quote was already declined." };
  }

  const sb = createServiceRoleClient();
  const fields = readIntakeFields(formData);
  const status: "in_progress" | "submitted" =
    mode === "submit" ? "submitted" : "in_progress";
  const submittedAt = mode === "submit" ? new Date().toISOString() : null;

  // Upsert the intake row.
  const { data: existing } = await sb
    .from("shipment_intake")
    .select("id")
    .eq("dispatch_estimate_id", estimate.id)
    .maybeSingle<{ id: string }>();

  if (existing) {
    const update: Record<string, unknown> = { ...fields, status };
    if (submittedAt) update.submitted_at = submittedAt;
    const { error } = await sb
      .from("shipment_intake")
      .update(update)
      .eq("id", existing.id);
    if (error) return { ok: false, reason: error.message };
  } else {
    const { error } = await sb.from("shipment_intake").insert({
      dispatch_estimate_id: estimate.id,
      ...fields,
      status,
      submitted_at: submittedAt,
    });
    if (error) return { ok: false, reason: error.message };
  }

  // ── First-interaction bookkeeping ──────────────────────────────────────
  //
  // Stamp accepted_at on the estimate when the customer first touches the
  // intake. Idempotent — only the first call sets it.
  if (!estimate.acceptedAt) {
    await sb
      .from("dispatch_estimates")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", estimate.id);
    await logDispatchEvent(sb, lead.id, "estimate_accepted", {
      mode,
      estimateId: estimate.id,
    });
  }

  // ── Submit-only bookkeeping ────────────────────────────────────────────
  //
  // Log intake_submitted independently of acceptance. Previous logic
  // (else-if) swallowed this event on the most common path — customer
  // accepts and submits in one session.
  //
  // Then advance lead_status to awaiting_confirmation if the lead is
  // still in the early funnel. Never moves status backwards.
  if (mode === "submit") {
    await logDispatchEvent(sb, lead.id, "intake_submitted", {
      estimateId: estimate.id,
    });

    // NOTE: operator Load Details overrides are intentionally NOT cleared
    // here. The previous behaviour nulled the whole overrides blob on intake
    // submit, which silently wiped the operator's manually-entered stops,
    // addresses, and freight — the exact "sending the quote deleted my data"
    // bug. It isn't needed: applyLoadDetailsOverrides already layers
    // overrides ON TOP of the freshly-submitted intake, so the operator's
    // explicit edits win on the fields they set and the customer's intake
    // fills every field the operator never touched. If the operator wants the
    // customer's value to win for a field, they clear that field.

    const { data: leadStatusRow } = await sb
      .from("quote_requests")
      .select("lead_status")
      .eq("id", lead.id)
      .maybeSingle<{ lead_status: string }>();

    if (
      leadStatusRow &&
      isLeadStatus(leadStatusRow.lead_status) &&
      ADVANCE_FROM_STATUSES.has(leadStatusRow.lead_status)
    ) {
      const previous = leadStatusRow.lead_status;
      const now = new Date().toISOString();
      const { error: statusError } = await sb
        .from("quote_requests")
        .update({
          lead_status: "awaiting_confirmation",
          lead_status_updated_at: now,
        })
        .eq("id", lead.id);
      if (statusError) {
        console.error("[submitIntake] status advance failed", {
          leadId: lead.id,
          message: statusError.message,
        });
      } else {
        await logDispatchEvent(sb, lead.id, "status_changed", {
          from: previous,
          to: "awaiting_confirmation",
        });
      }
    }
  }

  revalidatePath(`/admin/quotes/${lead.id}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
  revalidatePath(`/quote/accept/${token}`);
  return { ok: true, status };
}

export async function saveIntakeProgress(
  token: string,
  formData: FormData,
): Promise<IntakeSaveResult> {
  return persistIntake(token, formData, "save");
}

export async function submitIntake(
  token: string,
  formData: FormData,
): Promise<IntakeSaveResult> {
  return persistIntake(token, formData, "submit");
}
