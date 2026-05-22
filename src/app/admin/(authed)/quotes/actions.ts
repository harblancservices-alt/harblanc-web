"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { renderQuotePdfBuffer } from "@/lib/pdf/renderQuotePdf";
import type { QuotePdfData } from "@/lib/pdf/QuotePDF";
import { logDispatchEvent } from "@/lib/dispatch/events";
import { isLeadStatus, type LeadStatus } from "@/lib/dispatch/status";
import { computeRpm } from "@/lib/dispatch/distance";
import { sendDispatchEstimate } from "@/lib/email/estimate";
import { findTemplate } from "@/lib/dispatch/templates";
import {
  renderEstimateEmail,
  renderAcknowledgementEmail,
  type EstimatePayload as EstimateRenderPayload,
} from "@/lib/email/render";

const RETENTION_DAYS = 30;
const QUOTES_BUCKET = "quotes";

/**
 * Move a quote to trash. Sets deleted_at = now, delete_after = +30 days.
 * Idempotent: calling on an already-trashed row just resets the clock.
 */
export async function softDeleteQuote(id: string): Promise<void> {
  await requireAdmin();
  const sb = createServiceRoleClient();
  const now = new Date();
  const deleteAfter = new Date(
    now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const { error } = await sb
    .from("quote_requests")
    .update({
      deleted_at: now.toISOString(),
      delete_after: deleteAfter.toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Soft delete failed: ${error.message}`);
  }

  revalidatePath("/admin/quotes");
  revalidatePath("/admin/quotes/trash");
  revalidatePath(`/admin/quotes/${id}`);
  revalidatePath("/admin");
  redirect("/admin/quotes");
}

/**
 * Restore a trashed quote. Sets deleted_at and delete_after back to NULL.
 */
export async function restoreQuote(id: string): Promise<void> {
  await requireAdmin();
  const sb = createServiceRoleClient();

  const { error } = await sb
    .from("quote_requests")
    .update({
      deleted_at: null,
      delete_after: null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Restore failed: ${error.message}`);
  }

  revalidatePath("/admin/quotes");
  revalidatePath("/admin/quotes/trash");
  revalidatePath(`/admin/quotes/${id}`);
  revalidatePath("/admin");
  redirect("/admin/quotes");
}

/**
 * Permanently delete a trashed quote. Server-side guardrail enforces that
 * the row must already be in trash (deleted_at NOT NULL) — even a direct
 * malformed call cannot delete an active record.
 */
export async function permanentlyDeleteQuote(id: string): Promise<void> {
  await requireAdmin();
  const sb = createServiceRoleClient();

  const { data: row, error: readError } = await sb
    .from("quote_requests")
    .select("deleted_at")
    .eq("id", id)
    .maybeSingle<{ deleted_at: string | null }>();

  if (readError) {
    throw new Error(`Lookup failed: ${readError.message}`);
  }
  if (!row) {
    throw new Error("Quote not found.");
  }
  if (row.deleted_at === null) {
    throw new Error(
      "Cannot permanently delete an active quote. Move it to trash first.",
    );
  }

  const { error: deleteError } = await sb
    .from("quote_requests")
    .delete()
    .eq("id", id);

  if (deleteError) {
    throw new Error(`Permanent delete failed: ${deleteError.message}`);
  }

  revalidatePath("/admin/quotes");
  revalidatePath("/admin/quotes/trash");
  revalidatePath("/admin");
  redirect("/admin/quotes/trash");
}

/* ────────────────────────────────────────────────────────────── */
/* Batch variants for bulk selection in list views.               */
/* These do NOT redirect — caller is a client component using     */
/* useTransition that clears its selection state on completion.   */
/* ────────────────────────────────────────────────────────────── */

function readIds(formData: FormData): string[] {
  return formData
    .getAll("ids")
    .map((v) => String(v))
    .filter((s) => s.length > 0);
}

export async function softDeleteQuotes(formData: FormData): Promise<void> {
  await requireAdmin();
  const ids = readIds(formData);
  if (ids.length === 0) return;

  const sb = createServiceRoleClient();
  const now = new Date();
  const deleteAfter = new Date(
    now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const { error } = await sb
    .from("quote_requests")
    .update({
      deleted_at: now.toISOString(),
      delete_after: deleteAfter.toISOString(),
    })
    .in("id", ids);

  if (error) {
    throw new Error(`Bulk soft delete failed: ${error.message}`);
  }

  revalidatePath("/admin/quotes");
  revalidatePath("/admin/quotes/trash");
  revalidatePath("/admin");
}

export async function restoreQuotes(formData: FormData): Promise<void> {
  await requireAdmin();
  const ids = readIds(formData);
  if (ids.length === 0) return;

  const sb = createServiceRoleClient();

  const { error } = await sb
    .from("quote_requests")
    .update({ deleted_at: null, delete_after: null })
    .in("id", ids);

  if (error) {
    throw new Error(`Bulk restore failed: ${error.message}`);
  }

  revalidatePath("/admin/quotes");
  revalidatePath("/admin/quotes/trash");
  revalidatePath("/admin");
}

/**
 * Bulk permanent delete. Same server-side guardrail as the single-row
 * action: every id must already be in trash (deleted_at NOT NULL). If
 * any row is active, the whole batch is refused.
 */
export async function permanentlyDeleteQuotes(formData: FormData): Promise<void> {
  await requireAdmin();
  const ids = readIds(formData);
  if (ids.length === 0) return;

  const sb = createServiceRoleClient();

  const { data: rows, error: readError } = await sb
    .from("quote_requests")
    .select("id, deleted_at")
    .in("id", ids)
    .returns<{ id: string; deleted_at: string | null }[]>();

  if (readError) {
    throw new Error(`Lookup failed: ${readError.message}`);
  }
  if (!rows || rows.length === 0) {
    throw new Error("No matching quotes found.");
  }

  const stillActive = rows.filter((r) => r.deleted_at === null);
  if (stillActive.length > 0) {
    throw new Error(
      `Cannot permanently delete: ${stillActive.length} of ${rows.length} selected row(s) are still active. Move them to trash first.`,
    );
  }

  const { error: deleteError } = await sb
    .from("quote_requests")
    .delete()
    .in("id", ids);

  if (deleteError) {
    throw new Error(`Bulk permanent delete failed: ${deleteError.message}`);
  }

  revalidatePath("/admin/quotes/trash");
  revalidatePath("/admin");
}


/* ────────────────────────────────────────────────────────────── */
/* Phase 1 quote-generation action — Premium Carrier Quote.      */
/*                                                                */
/* Flow:                                                          */
/*  1. INSERT row → DB assigns quote_number via next_quote_number */
/*  2. RENDER PDF via @react-pdf/renderer (server-only)           */
/*  3. UPLOAD PDF to private "quotes" bucket                      */
/*  4. UPDATE row with pdf_storage_path + pdf_generated_at        */
/*                                                                */
/* If render/upload fails, the inserted row is deleted to avoid   */
/* orphan rows without a PDF.                                     */
/* ────────────────────────────────────────────────────────────── */

type AccessorialInput = { label: string; amount: number };

function parseNumber(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseInt32(v: FormDataEntryValue | null): number | null {
  const n = parseNumber(v);
  return n === null ? null : Math.trunc(n);
}

function parseString(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function parseAccessorials(formData: FormData): AccessorialInput[] {
  const labels = formData.getAll("accessorial_label").map((v) => String(v));
  const amounts = formData
    .getAll("accessorial_amount")
    .map((v) => parseNumber(v));
  const result: AccessorialInput[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i].trim();
    const amount = amounts[i];
    if (label.length > 0 && amount !== null && amount > 0) {
      result.push({ label, amount });
    }
  }
  return result;
}

export async function generateQuote(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const quoteRequestId = parseString(formData.get("quote_request_id"));
  if (!quoteRequestId) {
    throw new Error("Missing quote_request_id.");
  }

  // Required fields
  const linehaul = parseNumber(formData.get("linehaul"));
  if (linehaul === null || linehaul <= 0) {
    throw new Error("Linehaul must be a positive number.");
  }
  const origin = parseString(formData.get("origin"));
  const destination = parseString(formData.get("destination"));
  if (!origin || !destination) {
    throw new Error("Origin and destination are required.");
  }

  // Optional fields
  const fuelSurcharge = parseNumber(formData.get("fuel_surcharge")) ?? 0;
  const accessorials = parseAccessorials(formData);
  const accessorialsTotal = accessorials.reduce((sum, a) => sum + a.amount, 0);
  const totalAmount = linehaul + fuelSurcharge + accessorialsTotal;

  const expiresAtRaw = parseString(formData.get("expires_at"));
  const expiresAt = expiresAtRaw
    ? new Date(expiresAtRaw).toISOString()
    : null;

  const sb = createServiceRoleClient();

  // 1. INSERT — DB assigns quote_number via DEFAULT next_quote_number()
  const { data: inserted, error: insertError } = await sb
    .from("generated_quotes")
    .insert({
      quote_request_id: quoteRequestId,
      customer_name: parseString(formData.get("customer_name")),
      customer_contact: parseString(formData.get("customer_contact")),
      customer_email: parseString(formData.get("customer_email")),
      customer_phone: parseString(formData.get("customer_phone")),
      origin,
      destination,
      pickup_window: parseString(formData.get("pickup_window")),
      delivery_window: parseString(formData.get("delivery_window")),
      commodity: parseString(formData.get("commodity")),
      weight_lbs: parseInt32(formData.get("weight_lbs")),
      pieces: parseInt32(formData.get("pieces")),
      equipment_type: parseString(formData.get("equipment_type")),
      special_instructions: parseString(formData.get("special_instructions")),
      linehaul,
      fuel_surcharge: fuelSurcharge,
      accessorials,
      total_amount: totalAmount,
      payment_terms: parseString(formData.get("payment_terms")) ?? "Net 30",
      expires_at: expiresAt,
      prepared_by:
        parseString(formData.get("prepared_by")) ?? admin.email,
    })
    .select(
      "id, quote_number, issued_at, expires_at, customer_name, customer_contact, customer_email, customer_phone, origin, destination, pickup_window, delivery_window, commodity, weight_lbs, pieces, equipment_type, special_instructions, linehaul, fuel_surcharge, accessorials, total_amount, payment_terms, prepared_by",
    )
    .single();

  if (insertError || !inserted) {
    throw new Error(
      `Could not save generated quote: ${insertError?.message ?? "unknown error"}`,
    );
  }

  try {
    // 2. RENDER PDF
    const pdfData: QuotePdfData = {
      quoteNumber: inserted.quote_number,
      issuedAt: inserted.issued_at,
      expiresAt: inserted.expires_at,
      customerName: inserted.customer_name,
      customerContact: inserted.customer_contact,
      customerEmail: inserted.customer_email,
      customerPhone: inserted.customer_phone,
      origin: inserted.origin,
      destination: inserted.destination,
      pickupWindow: inserted.pickup_window,
      deliveryWindow: inserted.delivery_window,
      commodity: inserted.commodity,
      weightLbs: inserted.weight_lbs,
      pieces: inserted.pieces,
      equipmentType: inserted.equipment_type,
      linehaul: inserted.linehaul ? Number(inserted.linehaul) : null,
      fuelSurcharge: inserted.fuel_surcharge
        ? Number(inserted.fuel_surcharge)
        : null,
      accessorials: (inserted.accessorials as AccessorialInput[]) ?? [],
      totalAmount: inserted.total_amount
        ? Number(inserted.total_amount)
        : null,
      paymentTerms: inserted.payment_terms,
      specialInstructions: inserted.special_instructions,
      preparedBy: inserted.prepared_by,
    };
    const buffer = await renderQuotePdfBuffer(pdfData);

    // 3. UPLOAD PDF
    const storagePath = `${inserted.quote_number}.pdf`;
    const { error: uploadError } = await sb.storage
      .from(QUOTES_BUCKET)
      .upload(storagePath, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`PDF upload failed: ${uploadError.message}`);
    }

    // 4. UPDATE row with path + timestamp
    const { error: updateError } = await sb
      .from("generated_quotes")
      .update({
        pdf_storage_path: storagePath,
        pdf_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", inserted.id);
    if (updateError) {
      throw new Error(`Could not finalise quote: ${updateError.message}`);
    }
  } catch (err) {
    // Clean up the orphan row so the next attempt starts fresh.
    await sb.from("generated_quotes").delete().eq("id", inserted.id);
    throw err instanceof Error
      ? err
      : new Error("Quote generation failed.");
  }

  // Log to the dispatch timeline. Failure is non-fatal — see logDispatchEvent.
  await logDispatchEvent(sb, quoteRequestId, "pdf_generated", {
    quoteNumber: inserted.quote_number,
  });

  revalidatePath(`/admin/quotes/${quoteRequestId}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}


/* ────────────────────────────────────────────────────────────── */
/* Phase 3A — Dispatch Response Workspace actions.                */
/*                                                                */
/*   updateLeadStatus  — move a lead between funnel states        */
/*   saveDraftEstimate — UPSERT a draft estimate (one per request)*/
/*   sendEstimate      — finalize draft + send customer email     */
/*   addDispatchNote   — append a manual note to the timeline     */
/*                                                                */
/* All four require admin, all four log to dispatch_events, none  */
/* of them touch the existing generated_quotes / PDF flow.        */
/* ────────────────────────────────────────────────────────────── */

type LeadStatusRow = {
  lead_status: LeadStatus;
};

export async function updateLeadStatus(
  id: string,
  newStatus: string,
): Promise<void> {
  await requireAdmin();
  if (!isLeadStatus(newStatus)) {
    throw new Error(`Invalid lead status: ${newStatus}`);
  }

  const sb = createServiceRoleClient();

  // Read current status so we can log the transition.
  const { data: row, error: readError } = await sb
    .from("quote_requests")
    .select("lead_status")
    .eq("id", id)
    .maybeSingle<LeadStatusRow>();
  if (readError) {
    throw new Error(`Lookup failed: ${readError.message}`);
  }
  if (!row) {
    throw new Error("Quote not found.");
  }
  const previous = row.lead_status;

  // No-op if status is unchanged.
  if (previous === newStatus) {
    return;
  }

  const now = new Date().toISOString();
  const { error: updateError } = await sb
    .from("quote_requests")
    .update({
      lead_status: newStatus,
      lead_status_updated_at: now,
    })
    .eq("id", id);
  if (updateError) {
    throw new Error(`Status update failed: ${updateError.message}`);
  }

  await logDispatchEvent(sb, id, "status_changed", {
    from: previous,
    to: newStatus,
  });

  revalidatePath(`/admin/quotes/${id}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}

type DraftEstimateRow = {
  id: string;
  linehaul_low: string | number | null;
  linehaul_high: string | number | null;
};

/**
 * UPSERT-like helper: keep at most one DRAFT (sent_at IS NULL) estimate
 * per quote_request. If one exists, UPDATE it. Otherwise INSERT a new one.
 */
async function upsertDraftEstimate(
  sb: ReturnType<typeof createServiceRoleClient>,
  quoteRequestId: string,
  fields: {
    linehaul_low: number | null;
    linehaul_high: number | null;
    miles_estimate: number | null;
    rpm_low: number | null;
    rpm_high: number | null;
    pickup_timing_notes: string | null;
    equipment_notes: string | null;
    dispatch_notes: string | null;
    expiration_at: string | null;
  },
): Promise<DraftEstimateRow> {
  // Check for existing draft.
  const { data: existing } = await sb
    .from("dispatch_estimates")
    .select("id, linehaul_low, linehaul_high")
    .eq("quote_request_id", quoteRequestId)
    .is("sent_at", null)
    .maybeSingle<DraftEstimateRow>();

  if (existing) {
    const { data, error } = await sb
      .from("dispatch_estimates")
      .update(fields)
      .eq("id", existing.id)
      .select("id, linehaul_low, linehaul_high")
      .single<DraftEstimateRow>();
    if (error || !data) {
      throw new Error(`Draft update failed: ${error?.message ?? "unknown"}`);
    }
    return data;
  }

  const { data, error } = await sb
    .from("dispatch_estimates")
    .insert({ quote_request_id: quoteRequestId, ...fields })
    .select("id, linehaul_low, linehaul_high")
    .single<DraftEstimateRow>();
  if (error || !data) {
    throw new Error(`Draft insert failed: ${error?.message ?? "unknown"}`);
  }
  return data;
}

/**
 * Pull lane + draft fields from formData, compute miles + RPM, save the
 * draft. Does NOT send any email. Brent uses this to park work-in-progress.
 */
type DraftEstimateInput = {
  quoteRequestId: string;
  linehaulLow: number | null;
  linehaulHigh: number | null;
  milesEstimate: number | null;
  rpmLow: number | null;
  rpmHigh: number | null;
  pickupTimingNotes: string | null;
  equipmentNotes: string | null;
  dispatchNotes: string | null;
  expirationAt: string | null;
};

function readDraftEstimateInput(formData: FormData): DraftEstimateInput {
  const quoteRequestId = parseString(formData.get("quote_request_id"));
  if (!quoteRequestId) {
    throw new Error("Missing quote_request_id.");
  }
  const linehaulLow = parseNumber(formData.get("linehaul_low"));
  const linehaulHigh = parseNumber(formData.get("linehaul_high"));
  // miles may be auto-computed but Brent can override.
  const milesEstimate = parseInt32(formData.get("miles_estimate"));
  const rpmLow =
    linehaulLow !== null && milesEstimate !== null
      ? computeRpm(linehaulLow, milesEstimate)
      : null;
  const rpmHigh =
    linehaulHigh !== null && milesEstimate !== null
      ? computeRpm(linehaulHigh, milesEstimate)
      : null;
  const expirationAtRaw = parseString(formData.get("expiration_at"));

  return {
    quoteRequestId,
    linehaulLow,
    linehaulHigh,
    milesEstimate,
    rpmLow,
    rpmHigh,
    pickupTimingNotes: parseString(formData.get("pickup_timing_notes")),
    equipmentNotes: parseString(formData.get("equipment_notes")),
    dispatchNotes: parseString(formData.get("dispatch_notes")),
    expirationAt: expirationAtRaw, // ISO YYYY-MM-DD or null
  };
}

export async function saveDraftEstimate(formData: FormData): Promise<void> {
  await requireAdmin();
  const input = readDraftEstimateInput(formData);
  const sb = createServiceRoleClient();

  await upsertDraftEstimate(sb, input.quoteRequestId, {
    linehaul_low: input.linehaulLow,
    linehaul_high: input.linehaulHigh,
    miles_estimate: input.milesEstimate,
    rpm_low: input.rpmLow,
    rpm_high: input.rpmHigh,
    pickup_timing_notes: input.pickupTimingNotes,
    equipment_notes: input.equipmentNotes,
    dispatch_notes: input.dispatchNotes,
    expiration_at: input.expirationAt,
  });

  await logDispatchEvent(sb, input.quoteRequestId, "estimate_draft_saved", {
    linehaulLow: input.linehaulLow,
    linehaulHigh: input.linehaulHigh,
  });

  revalidatePath(`/admin/quotes/${input.quoteRequestId}`);
}

type LeadEmailRow = {
  name: string;
  email: string;
  commodity: string;
  weight: string;
  pickup_zip: string | null;
  delivery_zip: string | null;
  pickup_date: string | null;
  lead_status: LeadStatus;
};

/**
 * Finalize and send the dispatch estimate to the customer.
 *
 * Flow:
 *   1. Save the draft (so the row matches the email body that goes out)
 *   2. Resolve lane + load + closing line
 *   3. Send the email via Resend
 *   4. On success: mark sent_at + email id, log estimate_sent, advance
 *      status from 'new' → 'engaged' if currently 'new'
 *   5. On failure: leave draft intact, log estimate_send_failed, throw
 */
export async function sendEstimate(formData: FormData): Promise<void> {
  await requireAdmin();
  const input = readDraftEstimateInput(formData);
  if (input.linehaulLow === null || input.linehaulLow <= 0) {
    throw new Error("Linehaul (low) must be a positive number to send.");
  }

  const sb = createServiceRoleClient();

  // 1. Save / refresh the draft.
  const draft = await upsertDraftEstimate(sb, input.quoteRequestId, {
    linehaul_low: input.linehaulLow,
    linehaul_high: input.linehaulHigh,
    miles_estimate: input.milesEstimate,
    rpm_low: input.rpmLow,
    rpm_high: input.rpmHigh,
    pickup_timing_notes: input.pickupTimingNotes,
    equipment_notes: input.equipmentNotes,
    dispatch_notes: input.dispatchNotes,
    expiration_at: input.expirationAt,
  });

  // 2. Read the lead so we know who to email + the lane.
  const { data: lead, error: leadError } = await sb
    .from("quote_requests")
    .select(
      "name, email, commodity, weight, pickup_zip, delivery_zip, pickup_date, lead_status",
    )
    .eq("id", input.quoteRequestId)
    .maybeSingle<LeadEmailRow>();
  if (leadError) {
    throw new Error(`Lead lookup failed: ${leadError.message}`);
  }
  if (!lead) {
    throw new Error("Lead not found.");
  }
  if (!lead.pickup_zip || !lead.delivery_zip) {
    throw new Error(
      "Lead is missing pickup or delivery ZIP — can't send a lane-recap email.",
    );
  }

  // 3. Resolve the closing line. Template id wins; otherwise custom text.
  const templateId = parseString(formData.get("template_id"));
  const customClosing = parseString(formData.get("closing_line"));
  let closingLine: string;
  if (templateId) {
    const tpl = findTemplate(templateId);
    if (!tpl) {
      throw new Error(`Unknown template: ${templateId}`);
    }
    closingLine = tpl.body;
  } else if (customClosing) {
    closingLine = customClosing;
  } else {
    throw new Error("Choose a template or write a closing line before sending.");
  }

  // 4. Send the email.
  const result = await sendDispatchEstimate({
    to: lead.email,
    name: lead.name,
    lane: {
      pickupZip: lead.pickup_zip,
      deliveryZip: lead.delivery_zip,
    },
    load: {
      commodity: lead.commodity,
      weight: lead.weight,
      pickup: lead.pickup_date ?? "ASAP",
    },
    rate: {
      low: input.linehaulLow,
      high: input.linehaulHigh,
    },
    miles: input.milesEstimate,
    pickupTimingNotes: input.pickupTimingNotes,
    equipmentNotes: input.equipmentNotes,
    closingLine,
    expirationAt: input.expirationAt,
    leadId: input.quoteRequestId,
  });

  if (!result.ok) {
    await logDispatchEvent(sb, input.quoteRequestId, "estimate_send_failed", {
      reason: result.reason,
      to: lead.email,
    });
    throw new Error(`Could not send estimate: ${result.reason}`);
  }

  // 5. Mark sent + log event + advance status.
  const sentAt = new Date().toISOString();
  const { error: markError } = await sb
    .from("dispatch_estimates")
    .update({ sent_at: sentAt, sent_email_id: result.emailId })
    .eq("id", draft.id);
  if (markError) {
    // Email already went out — log but don't throw. The estimate exists,
    // it's just missing its sent_at. Operator can re-send if needed.
    console.error("[sendEstimate] mark-sent failed after delivery", {
      estimateId: draft.id,
      message: markError.message,
    });
  }

  await logDispatchEvent(sb, input.quoteRequestId, "estimate_sent", {
    emailId: result.emailId,
    linehaulLow: input.linehaulLow,
    linehaulHigh: input.linehaulHigh,
    to: lead.email,
  });

  // Advance funnel: new → engaged on first send. Don't move already-
  // progressed leads backward.
  if (lead.lead_status === "new") {
    const now = new Date().toISOString();
    const { error: statusError } = await sb
      .from("quote_requests")
      .update({ lead_status: "engaged", lead_status_updated_at: now })
      .eq("id", input.quoteRequestId);
    if (statusError) {
      console.error("[sendEstimate] status advance failed", {
        message: statusError.message,
      });
    } else {
      await logDispatchEvent(sb, input.quoteRequestId, "status_changed", {
        from: "new",
        to: "engaged",
      });
    }
  }

  revalidatePath(`/admin/quotes/${input.quoteRequestId}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}

export async function addDispatchNote(formData: FormData): Promise<void> {
  await requireAdmin();
  const quoteRequestId = parseString(formData.get("quote_request_id"));
  const body = parseString(formData.get("body"));
  if (!quoteRequestId) {
    throw new Error("Missing quote_request_id.");
  }
  if (!body) {
    throw new Error("Note body is required.");
  }
  if (body.length > 4000) {
    throw new Error("Note is too long (max 4000 chars).");
  }

  const sb = createServiceRoleClient();
  await logDispatchEvent(sb, quoteRequestId, "note", { body });

  revalidatePath(`/admin/quotes/${quoteRequestId}`);
}


/* ────────────────────────────────────────────────────────────── */
/* Phase 3C — Email preview action.                               */
/*                                                                */
/* buildEstimatePreview: saves the draft (so DB is in sync with   */
/* what's about to be sent) and returns the rendered email bytes  */
/* — subject, html, text, headers — for inline display.           */
/*                                                                */
/* No email is sent. The matching send action (sendEstimate) is   */
/* unchanged: it reads the same draft from DB and dispatches via  */
/* Resend, so preview-bytes == sent-bytes (both produced by       */
/* renderEstimateEmail with the same payload).                    */
/* ────────────────────────────────────────────────────────────── */

export type EmailPreview = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

export async function buildEstimatePreview(
  formData: FormData,
): Promise<EmailPreview> {
  await requireAdmin();
  const input = readDraftEstimateInput(formData);
  if (input.linehaulLow === null || input.linehaulLow <= 0) {
    throw new Error("Set the rate (low) before building a preview.");
  }

  const sb = createServiceRoleClient();

  // Save / refresh the draft so DB matches the preview the admin sees.
  await upsertDraftEstimate(sb, input.quoteRequestId, {
    linehaul_low: input.linehaulLow,
    linehaul_high: input.linehaulHigh,
    miles_estimate: input.milesEstimate,
    rpm_low: input.rpmLow,
    rpm_high: input.rpmHigh,
    pickup_timing_notes: input.pickupTimingNotes,
    equipment_notes: input.equipmentNotes,
    dispatch_notes: input.dispatchNotes,
    expiration_at: input.expirationAt,
  });

  // Pull lead fields we need to fill the rendered email.
  const { data: lead, error: leadError } = await sb
    .from("quote_requests")
    .select("name, email, commodity, weight, pickup_zip, delivery_zip, pickup_date")
    .eq("id", input.quoteRequestId)
    .maybeSingle<{
      name: string;
      email: string;
      commodity: string;
      weight: string;
      pickup_zip: string | null;
      delivery_zip: string | null;
      pickup_date: string | null;
    }>();
  if (leadError) {
    throw new Error(`Lead lookup failed: ${leadError.message}`);
  }
  if (!lead) {
    throw new Error("Lead not found.");
  }
  if (!lead.pickup_zip || !lead.delivery_zip) {
    throw new Error(
      "Lead is missing pickup or delivery ZIP — can't build a lane-recap preview.",
    );
  }

  // Resolve closing line — same logic as sendEstimate so the preview
  // exactly matches what would be sent.
  const templateId = parseString(formData.get("template_id"));
  const customClosing = parseString(formData.get("closing_line"));
  let closingLine: string;
  if (templateId) {
    const tpl = findTemplate(templateId);
    if (!tpl) {
      throw new Error(`Unknown template: ${templateId}`);
    }
    closingLine = tpl.body;
  } else if (customClosing) {
    closingLine = customClosing;
  } else {
    throw new Error("Pick a template or write a closing line first.");
  }

  const payload: EstimateRenderPayload = {
    to: lead.email,
    name: lead.name,
    lane: {
      pickupZip: lead.pickup_zip,
      deliveryZip: lead.delivery_zip,
    },
    load: {
      commodity: lead.commodity,
      weight: lead.weight,
      pickup: lead.pickup_date ?? "ASAP",
    },
    rate: {
      low: input.linehaulLow,
      high: input.linehaulHigh,
    },
    miles: input.milesEstimate,
    pickupTimingNotes: input.pickupTimingNotes,
    equipmentNotes: input.equipmentNotes,
    closingLine,
    expirationAt: input.expirationAt,
    leadId: input.quoteRequestId,
  };

  const rendered = renderEstimateEmail(payload);

  revalidatePath(`/admin/quotes/${input.quoteRequestId}`);

  return rendered;
}

/**
 * Preview of the auto-fired acknowledgement email — useful for Brent to
 * see exactly what the customer received on lead capture. No send, no
 * draft, no event log. Pure read + render.
 */
export async function buildAcknowledgementPreview(
  quoteRequestId: string,
): Promise<EmailPreview> {
  await requireAdmin();
  const sb = createServiceRoleClient();

  const { data: lead, error } = await sb
    .from("quote_requests")
    .select("id, name, email, commodity, weight, pickup_zip, delivery_zip, pickup_date")
    .eq("id", quoteRequestId)
    .maybeSingle<{
      id: string;
      name: string;
      email: string;
      commodity: string;
      weight: string;
      pickup_zip: string | null;
      delivery_zip: string | null;
      pickup_date: string | null;
    }>();
  if (error) {
    throw new Error(`Lookup failed: ${error.message}`);
  }
  if (!lead) {
    throw new Error("Lead not found.");
  }
  if (!lead.pickup_zip || !lead.delivery_zip) {
    throw new Error("Lead missing lane ZIPs — can't render preview.");
  }

  return renderAcknowledgementEmail({
    to: lead.email,
    name: lead.name,
    pickupZip: lead.pickup_zip,
    deliveryZip: lead.delivery_zip,
    commodity: lead.commodity,
    weight: lead.weight,
    pickupDate: lead.pickup_date,
    leadId: lead.id,
  });
}
