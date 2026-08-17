"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";
import { logDispatchEvent } from "@/lib/dispatch/events";
import { sendFinalizedQuoteBytes } from "@/lib/email/finalized-quote";
import {
  generateFinalizedQuoteDraft as generateFinalizedQuoteDraftShared,
  saveFinalizedQuoteDraft as saveFinalizedQuoteDraftShared,
  buildFinalizedQuotePreview as buildFinalizedQuotePreviewShared,
  sendFinalizedQuote as sendFinalizedQuoteShared,
  type FinalizedQuoteEmailPreview,
} from "@/lib/domain/revenue-finalized-quote";

/**
 * Server actions for the Finalized Quote / Rate Confirmation workflow.
 *
 * Separate file from the existing actions.ts to keep the new operational
 * layer distinct from the Range Proposal / legacy generated_quotes logic
 * and avoid bloat in a single 1000+-line module.
 *
 * Lifecycle:
 *   1. generateFinalizedQuoteDraft(quoteRequestId)
 *        → looks up the most recent SENT estimate for the lead
 *        → confirms its intake is submitted
 *        → INSERTs a finalized_quotes draft prefilled from intake (or
 *          returns the existing draft if one already exists — idempotent)
 *
 *   2. saveFinalizedQuoteDraft(formData)
 *        → UPDATE the draft with field edits. No email, no events
 *          beyond the audit row.
 *
 *   3. buildFinalizedQuotePreview(formData)
 *        → save fields, render the email, persist the rendered preview
 *          snapshot (subject/html/text/to/from/...) on the draft row.
 *
 *   4. sendFinalizedQuote(quoteRequestId)
 *        → read draft + snapshot, send the snapshot verbatim through
 *          Resend, mark sent_at / sent_email_id. The unique-while-draft
 *          index lets the next finalized-quote draft be created later
 *          if scope changes.
 *
 * Phase P1B: the Send action auto-advances lead_status from
 * `booked` to `awaiting_payment`. Sending the finalized quote IS the
 * moment payment becomes the next blocker, so the transition is
 * automatic. Status transitions FROM other states (e.g. someone sends
 * a re-issue while already at `awaiting_payment` or further) are
 * untouched -- the dispatcher controls status manually for everything
 * else. The subsequent `awaiting_payment` -> `ready_to_dispatch`
 * transition is driven by payments-actions.ts recordPayment.
 */

// ─────────────────────────────────────────────────────────────────────────
//  1. Generate Finalized Quote Draft — entry point from admin UI.
//
//     Idempotent: if a draft already exists for this dispatch_estimate,
//     return the existing one. The partial unique index ensures only
//     one open draft per estimate; sent rows are unconstrained.
// ─────────────────────────────────────────────────────────────────────────

export async function generateFinalizedQuoteDraft(
  quoteRequestId: string,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — changes aren't saved." };
  }
  await requireAdmin();
  const res = await generateFinalizedQuoteDraftShared(quoteRequestId);
  if (res.ok) {
    // Phase FLOW-FIX: revalidate even on the idempotent existing-draft
    // return. Most renders should already see this draft (the page
    // loader's loadFinalizedQuoteState reads the same row), so this is
    // belt-and-suspenders — covers the case where the operator clicks
    // Generate from a stale tab right after another tab created the
    // draft. router.refresh() on the client then reliably lands them
    // in the composer.
    revalidatePath(`/admin/quotes/${quoteRequestId}`);
  }
  return res;
}

// ─────────────────────────────────────────────────────────────────────────
//  2. Save Draft — field-only UPDATE. No render, no email.
// ─────────────────────────────────────────────────────────────────────────

export async function saveFinalizedQuoteDraft(
  formData: FormData,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await requireAdmin();
  const { quoteRequestId } = await saveFinalizedQuoteDraftShared(formData);

  revalidatePath(`/admin/quotes/${quoteRequestId}`);
}

// ─────────────────────────────────────────────────────────────────────────
//  3. Build Preview — save fields + render + persist snapshot.
//
//     Send reads back the saved preview snapshot verbatim, so the bytes
//     Brent reviewed are exactly the bytes the customer receives.
// ─────────────────────────────────────────────────────────────────────────

export async function buildFinalizedQuotePreview(
  formData: FormData,
): Promise<FinalizedQuoteEmailPreview> {
  await requireAdmin();
  return buildFinalizedQuotePreviewShared(formData);
}

// ─────────────────────────────────────────────────────────────────────────
//  4. Send — read snapshot, send verbatim, mark sent.
// ─────────────────────────────────────────────────────────────────────────

export async function sendFinalizedQuote(
  finalizedQuoteId: string,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: never send a real finalized quote.
  await requireAdmin();
  const { quoteRequestId } = await sendFinalizedQuoteShared(finalizedQuoteId);

  revalidatePath(`/admin/quotes/${quoteRequestId}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}


// ---------------------------------------------------------------------
//  Phase Q1 - resendFinalizedQuote
// ---------------------------------------------------------------------

type FinalizedQuoteResendSourceRow = {
  id: string;
  finalized_quote_number: string;
  quote_request_id: string;
  dispatch_estimate_id: string;
  issue_date: string | null;
  expiration_at: string | null;
  payment_due_at: string | null;
  pickup_company: string | null;
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;
  pickup_contact_email: string | null;
  pickup_address_line1: string | null;
  pickup_address_line2: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  pickup_zip: string | null;
  pickup_window: string | null;
  pickup_loading_hours: string | null;
  delivery_company: string | null;
  delivery_contact_name: string | null;
  delivery_contact_phone: string | null;
  delivery_contact_email: string | null;
  delivery_address_line1: string | null;
  delivery_address_line2: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  delivery_window: string | null;
  delivery_receiving_hours: string | null;
  commodity: string | null;
  length_in: string | number | null;
  width_in: string | number | null;
  height_in: string | number | null;
  exact_weight_lbs: string | number | null;
  quantity: number | null;
  handling_type: string | null;
  running_condition: string | null;
  securement_requirements: string | null;
  forklift_available: boolean | null;
  driver_assist_required: boolean | null;
  crane_required: boolean | null;
  permits_required: boolean | null;
  escort_required: boolean | null;
  tarp_required: boolean | null;
  special_instructions: string | null;
  linehaul: string | number | null;
  fuel_surcharge: string | number | null;
  permits_fee: string | number | null;
  accessorials: unknown;
  total_amount: string | number | null;
  detention_policy: string | null;
  tonu_policy: string | null;
  payment_instructions: string | null;
  dispatch_confirmation_statement: string | null;
  scheduling_statement: string | null;
  acceptance_acknowledgement: string | null;
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

export async function resendFinalizedQuote(
  sourceFinalizedQuoteId: string,
  formData: FormData,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: never resend a real finalized quote.
  await requireAdmin();
  if (!sourceFinalizedQuoteId) {
    throw new Error("Missing source finalized_quote id.");
  }

  const sb = createServiceRoleClient();

  const { data: source, error: srcErr } = await sb
    .from("finalized_quotes")
    .select(
      "id, finalized_quote_number, quote_request_id, dispatch_estimate_id, issue_date, expiration_at, payment_due_at, pickup_company, pickup_contact_name, pickup_contact_phone, pickup_contact_email, pickup_address_line1, pickup_address_line2, pickup_city, pickup_state, pickup_zip, pickup_window, pickup_loading_hours, delivery_company, delivery_contact_name, delivery_contact_phone, delivery_contact_email, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_zip, delivery_window, delivery_receiving_hours, commodity, length_in, width_in, height_in, exact_weight_lbs, quantity, handling_type, running_condition, securement_requirements, forklift_available, driver_assist_required, crane_required, permits_required, escort_required, tarp_required, special_instructions, linehaul, fuel_surcharge, permits_fee, accessorials, total_amount, detention_policy, tonu_policy, payment_instructions, dispatch_confirmation_statement, scheduling_statement, acceptance_acknowledgement, preview_subject, preview_preheader, preview_html, preview_text, preview_to, preview_from, preview_reply_to, preview_built_at, sent_at",
    )
    .eq("id", sourceFinalizedQuoteId)
    .maybeSingle<FinalizedQuoteResendSourceRow>();
  if (srcErr) throw new Error(`Source lookup failed: ${srcErr.message}`);
  if (!source) throw new Error("Source finalized quote not found.");
  if (!source.sent_at) {
    throw new Error("Source finalized quote has not been sent - nothing to resend.");
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
    throw new Error("Source finalized quote is missing preview bytes - cannot resend.");
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
    .from("finalized_quotes")
    .insert({
      quote_request_id: source.quote_request_id,
      dispatch_estimate_id: source.dispatch_estimate_id,
      issue_date: source.issue_date,
      expiration_at: source.expiration_at,
      payment_due_at: source.payment_due_at,
      pickup_company: source.pickup_company,
      pickup_contact_name: source.pickup_contact_name,
      pickup_contact_phone: source.pickup_contact_phone,
      pickup_contact_email: source.pickup_contact_email,
      pickup_address_line1: source.pickup_address_line1,
      pickup_address_line2: source.pickup_address_line2,
      pickup_city: source.pickup_city,
      pickup_state: source.pickup_state,
      pickup_zip: source.pickup_zip,
      pickup_window: source.pickup_window,
      pickup_loading_hours: source.pickup_loading_hours,
      delivery_company: source.delivery_company,
      delivery_contact_name: source.delivery_contact_name,
      delivery_contact_phone: source.delivery_contact_phone,
      delivery_contact_email: source.delivery_contact_email,
      delivery_address_line1: source.delivery_address_line1,
      delivery_address_line2: source.delivery_address_line2,
      delivery_city: source.delivery_city,
      delivery_state: source.delivery_state,
      delivery_zip: source.delivery_zip,
      delivery_window: source.delivery_window,
      delivery_receiving_hours: source.delivery_receiving_hours,
      commodity: source.commodity,
      length_in: source.length_in,
      width_in: source.width_in,
      height_in: source.height_in,
      exact_weight_lbs: source.exact_weight_lbs,
      quantity: source.quantity,
      handling_type: source.handling_type,
      running_condition: source.running_condition,
      securement_requirements: source.securement_requirements,
      forklift_available: source.forklift_available,
      driver_assist_required: source.driver_assist_required,
      crane_required: source.crane_required,
      permits_required: source.permits_required,
      escort_required: source.escort_required,
      tarp_required: source.tarp_required,
      special_instructions: source.special_instructions,
      linehaul: source.linehaul,
      fuel_surcharge: source.fuel_surcharge,
      permits_fee: source.permits_fee,
      accessorials: source.accessorials,
      total_amount: source.total_amount,
      detention_policy: source.detention_policy,
      tonu_policy: source.tonu_policy,
      payment_instructions: source.payment_instructions,
      dispatch_confirmation_statement: source.dispatch_confirmation_statement,
      scheduling_statement: source.scheduling_statement,
      acceptance_acknowledgement: source.acceptance_acknowledgement,
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

  const result = await sendFinalizedQuoteBytes({
    to: recipient,
    from: source.preview_from,
    replyTo: source.preview_reply_to,
    subject: source.preview_subject,
    html: source.preview_html,
    text: source.preview_text,
  });

  if (!result.ok) {
    await logDispatchEvent(
      sb,
      source.quote_request_id,
      "finalized_quote_send_failed",
      {
        finalizedQuoteId: inserted.id,
        finalizedQuoteNumber: source.finalized_quote_number,
        reason: result.reason,
        to: recipient,
      },
    );
    throw new Error(`Could not resend finalized quote: ${result.reason}`);
  }

  const { error: markErr } = await sb
    .from("finalized_quotes")
    .update({ sent_email_id: result.emailId })
    .eq("id", inserted.id);
  if (markErr) {
    console.error("[resendFinalizedQuote] mark-sent failed after delivery", {
      finalizedQuoteId: inserted.id,
      message: markErr.message,
    });
  }

  await logDispatchEvent(sb, source.quote_request_id, "finalized_quote_resent", {
    newFinalizedQuoteId: inserted.id,
    resentFromId: source.id,
    finalizedQuoteNumber: source.finalized_quote_number,
    to: recipient,
    emailId: result.emailId,
    reason,
  });

  revalidatePath(`/admin/quotes/${source.quote_request_id}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}
