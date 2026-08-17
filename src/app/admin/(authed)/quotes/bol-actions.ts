"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";
import { logDispatchEvent } from "@/lib/dispatch/events";
import { sendBolBytes } from "@/lib/email/bill-of-lading";
import {
  generateBolDraft as generateBolDraftShared,
  saveBolDraft as saveBolDraftShared,
  buildBolPreview as buildBolPreviewShared,
  sendBol as sendBolShared,
  type BolEmailPreview,
} from "@/lib/domain/revenue-bol";

/**
 * Server actions for the Bill of Lading (BOL) execution workflow.
 *
 * Separate file from actions.ts and finalized-quote-actions.ts to keep
 * each operational layer self-contained.
 *
 * Lifecycle:
 *   1. generateBolDraft(quoteRequestId)
 *        → looks up the most recent SENT finalized quote for the lead
 *        → INSERTs a bills_of_lading draft prefilled from the FQ
 *          (or returns the existing draft if one is already open —
 *          idempotent, same pattern as the finalized-quote layer)
 *
 *   2. saveBolDraft(formData)
 *        → UPDATE the draft with field edits. No render.
 *
 *   3. buildBolPreview(formData)
 *        → save fields, render the BOL document, persist the rendered
 *          preview snapshot.
 *
 *   4. sendBol(bolId)
 *        → read draft + snapshot, send the snapshot verbatim through
 *          Resend, mark sent_at / sent_email_id. The next draft can
 *          then be created (the partial unique index gates only open
 *          drafts).
 *
 * The Send action does NOT auto-advance lead_status. The dispatcher
 * controls the execution-status pipeline manually because real
 * dispatch reality doesn't always match a tidy linear sequence.
 */

// ─────────────────────────────────────────────────────────────────────────
//  1. Generate BOL Draft — entry point from admin UI.
//
//     Idempotent: returns the existing draft if one is already open.
// ─────────────────────────────────────────────────────────────────────────

export async function generateBolDraft(
  quoteRequestId: string,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — changes aren't saved." };
  }
  await requireAdmin();
  const res = await generateBolDraftShared(quoteRequestId);
  if (res.ok) {
    revalidatePath(`/admin/quotes/${quoteRequestId}`);
  }
  return res;
}

// ─────────────────────────────────────────────────────────────────────────
//  2. Save Draft — field-only UPDATE.
// ─────────────────────────────────────────────────────────────────────────

export async function saveBolDraft(formData: FormData): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await requireAdmin();
  const { quoteRequestId } = await saveBolDraftShared(formData);

  revalidatePath(`/admin/quotes/${quoteRequestId}`);
}

// ─────────────────────────────────────────────────────────────────────────
//  3. Build Preview — save + render + persist snapshot.
// ─────────────────────────────────────────────────────────────────────────

export async function buildBolPreview(
  formData: FormData,
): Promise<BolEmailPreview> {
  await requireAdmin();
  const { quoteRequestId, ...rendered } = await buildBolPreviewShared(formData);
  revalidatePath(`/admin/quotes/${quoteRequestId}`);
  return rendered;
}

// ─────────────────────────────────────────────────────────────────────────
//  4. Send — read snapshot, send verbatim, mark sent.
// ─────────────────────────────────────────────────────────────────────────

export async function sendBol(bolId: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: never send a real BOL email.
  await requireAdmin();
  const { quoteRequestId } = await sendBolShared(bolId);

  revalidatePath(`/admin/quotes/${quoteRequestId}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}


// ---------------------------------------------------------------------
//  Phase Q1 - resendBol
// ---------------------------------------------------------------------

type BolResendSourceRow = {
  id: string;
  bol_number: string;
  quote_request_id: string;
  dispatch_estimate_id: string;
  finalized_quote_id: string;
  dispatch_reference: string | null;
  issue_date: string | null;
  shipper_company: string | null;
  shipper_contact_name: string | null;
  shipper_contact_phone: string | null;
  shipper_contact_email: string | null;
  shipper_city: string | null;
  shipper_state: string | null;
  shipper_zip: string | null;
  pickup_window: string | null;
  pickup_instructions: string | null;
  consignee_company: string | null;
  consignee_contact_name: string | null;
  consignee_contact_phone: string | null;
  consignee_contact_email: string | null;
  consignee_city: string | null;
  consignee_state: string | null;
  consignee_zip: string | null;
  delivery_window: string | null;
  delivery_instructions: string | null;
  commodity: string | null;
  quantity: number | null;
  handling_units_type: string | null;
  length_in: string | number | null;
  width_in: string | number | null;
  height_in: string | number | null;
  weight_lbs: string | number | null;
  nmfc_code: string | null;
  freight_class: string | null;
  hazmat: boolean;
  special_handling: string | null;
  driver_assist_required: boolean;
  tarp_required: boolean;
  permits_required: boolean;
  escort_required: boolean;
  rigging_required: boolean;
  appointment_required: boolean;
  special_instructions: string | null;
  dispatch_notes: string | null;
  prepared_by: string | null;
  preview_subject: string | null;
  preview_preheader: string | null;
  preview_html: string | null;
  preview_text: string | null;
  preview_to: string | null;
  preview_from: string | null;
  preview_reply_to: string | null;
  preview_built_at: string | null;
  sent_at: string | null;
};

export async function resendBol(
  sourceBolId: string,
  formData: FormData,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: never resend a real BOL email.
  await requireAdmin();
  if (!sourceBolId) {
    throw new Error("Missing source BOL id.");
  }

  const sb = createServiceRoleClient();

  const { data: source, error: srcErr } = await sb
    .from("bills_of_lading")
    .select(
      "id, bol_number, quote_request_id, dispatch_estimate_id, finalized_quote_id, dispatch_reference, issue_date, shipper_company, shipper_contact_name, shipper_contact_phone, shipper_contact_email, shipper_city, shipper_state, shipper_zip, pickup_window, pickup_instructions, consignee_company, consignee_contact_name, consignee_contact_phone, consignee_contact_email, consignee_city, consignee_state, consignee_zip, delivery_window, delivery_instructions, commodity, quantity, handling_units_type, length_in, width_in, height_in, weight_lbs, nmfc_code, freight_class, hazmat, special_handling, driver_assist_required, tarp_required, permits_required, escort_required, rigging_required, appointment_required, special_instructions, dispatch_notes, prepared_by, preview_subject, preview_preheader, preview_html, preview_text, preview_to, preview_from, preview_reply_to, preview_built_at, sent_at",
    )
    .eq("id", sourceBolId)
    .maybeSingle<BolResendSourceRow>();
  if (srcErr) throw new Error(`Source lookup failed: ${srcErr.message}`);
  if (!source) throw new Error("Source BOL not found.");
  if (!source.sent_at) {
    throw new Error("Source BOL has not been sent - nothing to resend.");
  }
  if (
    !source.preview_subject ||
    !source.preview_html ||
    !source.preview_text ||
    !source.preview_to ||
    !source.preview_from ||
    !source.preview_reply_to ||
    !source.preview_built_at
  ) {
    throw new Error("Source BOL is missing preview bytes - cannot resend.");
  }

  const toRaw = (formData.get("to") ?? "").toString().trim();
  const reasonRaw = (formData.get("reason") ?? "").toString().trim();
  const overrideTo = toRaw.length > 0 ? toRaw : null;
  const reason = reasonRaw.length > 0 ? reasonRaw : null;
  const recipient = overrideTo ?? source.preview_to;

  if (overrideTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(overrideTo)) {
    throw new Error("Override recipient does not look like an email address.");
  }

  const nowIso = new Date().toISOString();

  const { data: inserted, error: insErr } = await sb
    .from("bills_of_lading")
    .insert({
      quote_request_id: source.quote_request_id,
      dispatch_estimate_id: source.dispatch_estimate_id,
      finalized_quote_id: source.finalized_quote_id,
      dispatch_reference: source.dispatch_reference,
      issue_date: source.issue_date,
      shipper_company: source.shipper_company,
      shipper_contact_name: source.shipper_contact_name,
      shipper_contact_phone: source.shipper_contact_phone,
      shipper_contact_email: source.shipper_contact_email,
      shipper_city: source.shipper_city,
      shipper_state: source.shipper_state,
      shipper_zip: source.shipper_zip,
      pickup_window: source.pickup_window,
      pickup_instructions: source.pickup_instructions,
      consignee_company: source.consignee_company,
      consignee_contact_name: source.consignee_contact_name,
      consignee_contact_phone: source.consignee_contact_phone,
      consignee_contact_email: source.consignee_contact_email,
      consignee_city: source.consignee_city,
      consignee_state: source.consignee_state,
      consignee_zip: source.consignee_zip,
      delivery_window: source.delivery_window,
      delivery_instructions: source.delivery_instructions,
      commodity: source.commodity,
      quantity: source.quantity,
      handling_units_type: source.handling_units_type,
      length_in: source.length_in,
      width_in: source.width_in,
      height_in: source.height_in,
      weight_lbs: source.weight_lbs,
      nmfc_code: source.nmfc_code,
      freight_class: source.freight_class,
      hazmat: source.hazmat,
      special_handling: source.special_handling,
      driver_assist_required: source.driver_assist_required,
      tarp_required: source.tarp_required,
      permits_required: source.permits_required,
      escort_required: source.escort_required,
      rigging_required: source.rigging_required,
      appointment_required: source.appointment_required,
      special_instructions: source.special_instructions,
      dispatch_notes: source.dispatch_notes,
      prepared_by: source.prepared_by,
      preview_subject: source.preview_subject,
      preview_preheader: source.preview_preheader,
      preview_html: source.preview_html,
      preview_text: source.preview_text,
      preview_to: recipient,
      preview_from: source.preview_from,
      preview_reply_to: source.preview_reply_to,
      preview_built_at: source.preview_built_at,
      sent_at: nowIso,
      resent_from_id: source.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (insErr || !inserted) {
    throw new Error(
      `Resend insert failed: ${insErr?.message ?? "no row returned"}`,
    );
  }

  const result = await sendBolBytes({
    to: recipient,
    from: source.preview_from,
    replyTo: source.preview_reply_to,
    subject: source.preview_subject,
    html: source.preview_html,
    text: source.preview_text,
  });

  if (!result.ok) {
    await logDispatchEvent(sb, source.quote_request_id, "bol_send_failed", {
      bolId: inserted.id,
      bolNumber: source.bol_number,
      reason: result.reason,
      to: recipient,
    });
    throw new Error(`Could not resend BOL: ${result.reason}`);
  }

  const { error: markErr } = await sb
    .from("bills_of_lading")
    .update({ sent_email_id: result.emailId })
    .eq("id", inserted.id);
  if (markErr) {
    console.error("[resendBol] mark-sent failed after delivery", {
      bolId: inserted.id,
      message: markErr.message,
    });
  }

  await logDispatchEvent(sb, source.quote_request_id, "bol_resent", {
    newBolId: inserted.id,
    resentFromId: source.id,
    bolNumber: source.bol_number,
    to: recipient,
    emailId: result.emailId,
    reason,
  });

  revalidatePath(`/admin/quotes/${source.quote_request_id}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}
