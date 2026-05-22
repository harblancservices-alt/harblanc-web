"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logDispatchEvent } from "@/lib/dispatch/events";
import { resolveByToken } from "@/lib/quote-token/lookup";

/**
 * Server actions for the customer-facing /quote/accept/[token] page.
 *
 * No admin auth — the accept_token IS the authorization. resolveByToken
 * gates both Save Progress and Submit. Rejected lookups return cleanly
 * without leaking which step failed.
 */

type SaveMode = "save" | "submit";

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

function readIntakeFields(formData: FormData): Record<string, unknown> {
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
    pickup_window: s(formData.get("pickup_window")),

    delivery_company: s(formData.get("delivery_company")),
    delivery_contact_name: s(formData.get("delivery_contact_name")),
    delivery_contact_phone: s(formData.get("delivery_contact_phone")),
    delivery_contact_email: s(formData.get("delivery_contact_email")),
    delivery_address_line1: s(formData.get("delivery_address_line1")),
    delivery_address_line2: s(formData.get("delivery_address_line2")),
    delivery_city: s(formData.get("delivery_city")),
    delivery_state: s(formData.get("delivery_state")),
    delivery_zip: s(formData.get("delivery_zip")),
    delivery_window: s(formData.get("delivery_window")),

    commodity_details: s(formData.get("commodity_details")),
    length_in: n(formData.get("length_in")),
    width_in: n(formData.get("width_in")),
    height_in: n(formData.get("height_in")),
    exact_weight_lbs: n(formData.get("exact_weight_lbs")),

    loading_responsibility: s(formData.get("loading_responsibility")),
    unloading_responsibility: s(formData.get("unloading_responsibility")),
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

  // Look for an existing intake row.
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

  // Stamp accepted_at on the estimate when the customer first interacts.
  // Idempotent: only sets it the first time.
  if (!estimate.acceptedAt) {
    await sb
      .from("dispatch_estimates")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", estimate.id);
    await logDispatchEvent(sb, lead.id, "estimate_accepted", {
      mode,
      estimateId: estimate.id,
    });
  } else if (mode === "submit") {
    await logDispatchEvent(sb, lead.id, "intake_submitted", {
      estimateId: estimate.id,
    });
  }

  revalidatePath(`/admin/quotes/${lead.id}`);
  revalidatePath("/admin/quotes");
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
