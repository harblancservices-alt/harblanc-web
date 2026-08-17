"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";
import { logDispatchEvent } from "@/lib/dispatch/events";
import { lookupZip } from "@/lib/dispatch/distance";
import { sendDispatchEstimateBytes } from "@/lib/email/estimate";
import { renderAcknowledgementEmail } from "@/lib/email/render";
import {
  updateLeadStatus as updateLeadStatusShared,
  saveDraftEstimate as saveDraftEstimateShared,
  sendEstimate as sendEstimateShared,
  buildEstimatePreview as buildEstimatePreviewShared,
  type EmailPreview,
} from "@/lib/domain/revenue-estimate";

const RETENTION_DAYS = 30;

/**
 * Move a quote to trash. Sets deleted_at = now, delete_after = +30 days.
 * Idempotent: calling on an already-trashed row just resets the clock.
 */
export async function softDeleteQuote(id: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
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

  revalidatePath("/admin/operations");
  revalidatePath("/admin/quotes/trash");
  revalidatePath(`/admin/quotes/${id}`);
  revalidatePath("/admin");
  redirect("/admin/operations?tab=quotes");
}

/**
 * Restore a trashed quote. Sets deleted_at and delete_after back to NULL.
 */
export async function restoreQuote(id: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
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

  revalidatePath("/admin/operations");
  revalidatePath("/admin/quotes/trash");
  revalidatePath(`/admin/quotes/${id}`);
  revalidatePath("/admin");
  redirect("/admin/operations?tab=quotes");
}

/**
 * Permanently delete a trashed quote. Server-side guardrail enforces that
 * the row must already be in trash (deleted_at NOT NULL) — even a direct
 * malformed call cannot delete an active record.
 */
export async function permanentlyDeleteQuote(id: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
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
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
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
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
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
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
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

function parseString(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
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
/*                                                                */
/* updateLeadStatus/saveDraftEstimate/sendEstimate delegate their */
/* core logic to @/lib/domain/revenue-estimate, shared with        */
/* /tms-v2's pipeline.ts (decoupling plan Phase 8). This file only */
/* adds the demo-mode gate + admin auth + admin's revalidatePath   */
/* targets on top.                                                 */
/* ────────────────────────────────────────────────────────────── */

export async function updateLeadStatus(
  id: string,
  newStatus: string,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await requireAdmin();
  await updateLeadStatusShared(id, newStatus);

  revalidatePath(`/admin/quotes/${id}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}

export async function saveDraftEstimate(formData: FormData): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await requireAdmin();
  await saveDraftEstimateShared(formData);

  const quoteRequestId = parseString(formData.get("quote_request_id"));
  if (quoteRequestId) revalidatePath(`/admin/quotes/${quoteRequestId}`);
}

/**
 * Finalize and send the dispatch estimate to the customer. Core logic
 * lives in @/lib/domain/revenue-estimate (shared with /tms-v2); this
 * wrapper adds the demo gate, admin auth, and admin's revalidatePath
 * targets.
 */
export async function sendEstimate(quoteRequestId: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: never send a real estimate email.
  await requireAdmin();
  await sendEstimateShared(quoteRequestId);

  revalidatePath(`/admin/quotes/${quoteRequestId}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}

/**
 * Update the lightweight "ownership" fields on a lead: dispatcher,
 * carrier, truck, trailer type. All four are free-text and nullable —
 * passing an empty string clears the field. Logged as a single note
 * event so the timeline reflects the change.
 */
export async function updateDispatchOwnership(formData: FormData): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await requireAdmin();
  const quoteRequestId = parseString(formData.get("quote_request_id"));
  if (!quoteRequestId) {
    throw new Error("Missing quote_request_id.");
  }

  const fields = {
    assigned_dispatcher: parseString(formData.get("assigned_dispatcher")),
    assigned_carrier: parseString(formData.get("assigned_carrier")),
    assigned_truck: parseString(formData.get("assigned_truck")),
    trailer_type: parseString(formData.get("trailer_type")),
  };

  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("quote_requests")
    .update(fields)
    .eq("id", quoteRequestId);
  if (error) {
    throw new Error(`Could not save ownership: ${error.message}`);
  }

  // Audit trail: keep changes visible in Activity. Stored as a note so
  // we don't need to introduce a new dispatch_events kind for what is
  // essentially metadata bookkeeping.
  const summary = [
    fields.assigned_dispatcher ? `Dispatcher: ${fields.assigned_dispatcher}` : null,
    fields.assigned_carrier ? `Carrier: ${fields.assigned_carrier}` : null,
    fields.assigned_truck ? `Truck: ${fields.assigned_truck}` : null,
    fields.trailer_type ? `Trailer: ${fields.trailer_type}` : null,
  ]
    .filter((v): v is string => v !== null)
    .join(" · ");
  await logDispatchEvent(sb, quoteRequestId, "note", {
    body: summary.length > 0
      ? `Dispatch ownership updated — ${summary}`
      : "Dispatch ownership cleared.",
  });

  revalidatePath(`/admin/quotes/${quoteRequestId}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}

export async function addDispatchNote(formData: FormData): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
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
/* Email preview action.                                          */
/*                                                                */
/* buildEstimatePreview: saves the draft + the rendered preview   */
/* snapshot. Returns the rendered email bytes for inline display. */
/* Send reads the saved snapshot back so preview-bytes ==         */
/* sent-bytes is guaranteed by construction.                      */
/* ────────────────────────────────────────────────────────────── */

/**
 * Save fields + render + persist the preview snapshot. Core logic lives
 * in @/lib/domain/revenue-estimate (shared with /tms-v2). No demo gate
 * here — matches the original: buildEstimatePreview never checked
 * blockedByDemo(), only requireAdmin(). No revalidatePath here either
 * — same reasoning as the original (see the shared module's own note).
 */
export async function buildEstimatePreview(
  formData: FormData,
): Promise<EmailPreview> {
  await requireAdmin();
  return buildEstimatePreviewShared(formData);
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


// ---------------------------------------------------------------------
//  Phase Q1 - resendEstimate
//
//  Redeliver a previously-sent estimate using the original row's
//  persisted preview bytes (preview/send byte parity guaranteed). A NEW
//  sent row is inserted; the source row stays exactly as it was. The
//  new row is linked back via resent_from_id. Status auto-advance is
//  intentionally NOT fired - a resend never regresses lead lifecycle.
// ---------------------------------------------------------------------

type SentEstimateSourceRow = {
  id: string;
  quote_request_id: string;
  linehaul_low: string | number | null;
  linehaul_high: string | number | null;
  miles_estimate: number | null;
  pickup_timing_notes: string | null;
  equipment_notes: string | null;
  dispatch_notes: string | null;
  expiration_at: string | null;
  closing_line: string | null;
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

export async function resendEstimate(
  sourceEstimateId: string,
  formData: FormData,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: never resend a real estimate email.
  await requireAdmin();
  if (!sourceEstimateId) {
    throw new Error("Missing source estimate id.");
  }

  const sb = createServiceRoleClient();

  const { data: source, error: srcErr } = await sb
    .from("dispatch_estimates")
    .select(
      "id, quote_request_id, linehaul_low, linehaul_high, miles_estimate, pickup_timing_notes, equipment_notes, dispatch_notes, expiration_at, closing_line, preview_subject, preview_preheader, preview_html, preview_text, preview_to, preview_from, preview_reply_to, preview_built_at, sent_at",
    )
    .eq("id", sourceEstimateId)
    .maybeSingle<SentEstimateSourceRow>();
  if (srcErr) throw new Error(`Source lookup failed: ${srcErr.message}`);
  if (!source) throw new Error("Source estimate not found.");
  if (!source.sent_at) {
    throw new Error("Source estimate has not been sent - nothing to resend.");
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
    throw new Error("Source estimate is missing preview bytes - cannot resend.");
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
    .from("dispatch_estimates")
    .insert({
      quote_request_id: source.quote_request_id,
      linehaul_low: source.linehaul_low,
      linehaul_high: source.linehaul_high,
      miles_estimate: source.miles_estimate,
      pickup_timing_notes: source.pickup_timing_notes,
      equipment_notes: source.equipment_notes,
      dispatch_notes: source.dispatch_notes,
      expiration_at: source.expiration_at,
      closing_line: source.closing_line,
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

  const result = await sendDispatchEstimateBytes({
    to: recipient,
    from: source.preview_from,
    replyTo: source.preview_reply_to,
    subject: source.preview_subject,
    html: source.preview_html,
    text: source.preview_text,
  });

  if (!result.ok) {
    await logDispatchEvent(sb, source.quote_request_id, "estimate_send_failed", {
      reason: result.reason,
      to: recipient,
    });
    throw new Error(`Could not resend estimate: ${result.reason}`);
  }

  const { error: markErr } = await sb
    .from("dispatch_estimates")
    .update({ sent_email_id: result.emailId })
    .eq("id", inserted.id);
  if (markErr) {
    console.error("[resendEstimate] mark-sent failed after delivery", {
      estimateId: inserted.id,
      message: markErr.message,
    });
  }

  await logDispatchEvent(sb, source.quote_request_id, "estimate_resent", {
    newEstimateId: inserted.id,
    resentFromId: source.id,
    to: recipient,
    emailId: result.emailId,
    reason,
  });

  revalidatePath(`/admin/quotes/${source.quote_request_id}`);
}
/**
 * Persist operator-side Load Details overrides on the lead row. The
 * Load Details tab lets dispatch edit every visible field; this action
 * writes that edit set as a JSON blob on quote_requests.load_details_overrides.
 *
 * The override is layered on TOP of intake + Quick Quote at render time
 * (see computeInitialValues in /admin/quotes/[id]/page.tsx) so:
 *   - operator-edited fields show the operator's value
 *   - fields the operator never touched fall through to the customer's
 *     intake submission / original Quick Quote
 *   - operator-cleared fields ("") stay cleared instead of reverting
 *
 * No schema enforcement on the JSON shape; keys are LoadDetailsInitial
 * field names. We accept whatever the form posts so adding a new card
 * field later does not require a server-action change.
 */
export type LoadDetailsOverridesPayload = Record<string, string>;

export async function saveLoadDetailsOverrides(
  quoteRequestId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (await blockedByDemo()) return { ok: true }; // DEMO: no-op, benign success.
  await requireAdmin();
  if (!quoteRequestId) {
    return { ok: false, reason: "Missing quote_request_id." };
  }

  const sb = createServiceRoleClient();

  // MERGE into the existing overrides rather than replacing the whole blob.
  // A full replace meant any save that posted a subset of fields wiped the
  // rest — e.g. a partial/racing autosave erasing stops & addresses, or a
  // form that omits dimensions clearing them. Reading the current blob and
  // layering the posted fields on top preserves everything not in this post.
  // "Cleared stays cleared" still holds: a cleared field posts "" and that
  // empty string overwrites the prior value.
  const { data: existing } = await sb
    .from("quote_requests")
    .select("load_details_overrides")
    .eq("id", quoteRequestId)
    .maybeSingle<{
      load_details_overrides: Record<string, string> | null;
    }>();

  const overrides: LoadDetailsOverridesPayload = {
    ...(existing?.load_details_overrides ?? {}),
  };
  for (const [key, raw] of formData.entries()) {
    if (key === "quote_request_id") continue;
    if (typeof raw === "string") {
      overrides[key] = raw;
    }
  }

  const { error } = await sb
    .from("quote_requests")
    .update({ load_details_overrides: overrides })
    .eq("id", quoteRequestId);
  if (error) {
    return { ok: false, reason: `Save failed: ${error.message}` };
  }

  revalidatePath(`/admin/quotes/${quoteRequestId}`);
  return { ok: true };
}

/**
 * Server-only ZIP → {city, state} lookup. Used by LoadDetailsCard to
 * auto-fill the city + state inputs when the operator pastes / edits a
 * ZIP. Returns null when the ZIP is not in the zipcodes dataset (very
 * rare but possible for new ZCTAs). Kept tiny — no admin auth gate
 * because the zipcodes data is public; this lookup is a thin wrapper
 * over a static dataset that ships in the bundle anyway.
 */
export async function lookupZipDetails(
  zip: string,
): Promise<{ city: string; state: string } | null> {
  const trimmed = zip.trim();
  if (!/^\d{5}$/.test(trimmed)) return null;
  const hit = lookupZip(trimmed);
  if (!hit) return null;
  return { city: hit.city, state: hit.state };
}
