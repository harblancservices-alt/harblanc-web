"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logDispatchEvent } from "@/lib/dispatch/events";
import { isLeadStatus, type LeadStatus } from "@/lib/dispatch/status";
import { computeRpm, lookupZip } from "@/lib/dispatch/distance";
import { sendDispatchEstimateBytes } from "@/lib/email/estimate";
import { findTemplate } from "@/lib/dispatch/templates";
import {
  renderEstimateEmail,
  renderAcknowledgementEmail,
  type EstimatePayload as EstimateRenderPayload,
} from "@/lib/email/render";

/**
 * Public origin used in customer-facing Accept / Decline URLs embedded
 * in sent estimate emails. Falls back to the production hostname when
 * the env var isn't set so local previews still render valid-looking
 * URLs.
 */
const PUBLIC_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.harblancservices.com";

function acceptUrl(token: string): string {
  return `${PUBLIC_ORIGIN}/quote/accept/${token}`;
}
function declineUrl(token: string): string {
  return `${PUBLIC_ORIGIN}/quote/decline/${token}`;
}

const RETENTION_DAYS = 30;

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
  accept_token: string | null;
};

type DraftPersistFields = {
  linehaul_low: number | null;
  linehaul_high: number | null;
  miles_estimate: number | null;
  rpm_low: number | null;
  rpm_high: number | null;
  pickup_timing_notes: string | null;
  equipment_notes: string | null;
  dispatch_notes: string | null;
  expiration_at: string | null;
  closing_line: string | null;
  // Phase REBUILD-3 — Quote Range workspace state persistence. These four
  // fields were previously only baked into preview_html / preview_text at
  // build time; the schema migration 20260540000000_dispatch_estimates_range_persistence
  // adds them as columns so the workspace can hydrate them on page load.
  fuel_surcharge: number | null;
  accessorials: AccessorialInput[] | null;
  payment_terms: string | null;
  special_instructions: string | null;
};

/**
 * UPSERT-like helper: keep at most one DRAFT (sent_at IS NULL) estimate
 * per quote_request. If one exists, UPDATE it. Otherwise INSERT a new one.
 *
 * Optional `previewSnapshot` overwrites the saved preview HTML/text on
 * the draft row. Field-only saves (Save Draft, send-time bookkeeping)
 * leave the preview untouched.
 */
async function upsertDraftEstimate(
  sb: ReturnType<typeof createServiceRoleClient>,
  quoteRequestId: string,
  fields: DraftPersistFields,
  previewSnapshot?: {
    preview_subject: string;
    preview_preheader: string;
    preview_html: string;
    preview_text: string;
    preview_to: string;
    preview_from: string;
    preview_reply_to: string;
    preview_built_at: string;
  },
): Promise<DraftEstimateRow> {
  const writePayload = previewSnapshot
    ? { ...fields, ...previewSnapshot }
    : fields;

  // Check for existing draft.
  const { data: existing } = await sb
    .from("dispatch_estimates")
    .select("id, linehaul_low, linehaul_high, accept_token")
    .eq("quote_request_id", quoteRequestId)
    .is("sent_at", null)
    .maybeSingle<DraftEstimateRow>();

  if (existing) {
    const { data, error } = await sb
      .from("dispatch_estimates")
      .update(writePayload)
      .eq("id", existing.id)
      .select("id, linehaul_low, linehaul_high, accept_token")
      .single<DraftEstimateRow>();
    if (error || !data) {
      throw new Error(`Draft update failed: ${error?.message ?? "unknown"}`);
    }
    return data;
  }

  const { data, error } = await sb
    .from("dispatch_estimates")
    .insert({ quote_request_id: quoteRequestId, ...writePayload })
    .select("id, linehaul_low, linehaul_high, accept_token")
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
  closingLine: string | null;
  fuelSurcharge: number | null;
  accessorials: AccessorialInput[];
  paymentTerms: string | null;
  specialInstructions: string | null;
};

/**
 * Resolve the resolved closing line from FormData. Either `template_id`
 * (canonical template body) or `closing_line` (custom override). Returns
 * null when neither is present — callers that require a closing line
 * (build preview, send) check for null explicitly.
 */
function resolveClosingLine(formData: FormData): string | null {
  const templateId = parseString(formData.get("template_id"));
  if (templateId) {
    const tpl = findTemplate(templateId);
    if (!tpl) {
      throw new Error(`Unknown template: ${templateId}`);
    }
    return tpl.body;
  }
  return parseString(formData.get("closing_line"));
}

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
    closingLine: resolveClosingLine(formData),
    fuelSurcharge: parseNumber(formData.get("fuel_surcharge")),
    accessorials: parseAccessorials(formData),
    paymentTerms: parseString(formData.get("payment_terms")),
    specialInstructions: parseString(formData.get("special_instructions")),
  };
}

function toDraftPersistFields(input: DraftEstimateInput): DraftPersistFields {
  return {
    linehaul_low: input.linehaulLow,
    linehaul_high: input.linehaulHigh,
    miles_estimate: input.milesEstimate,
    rpm_low: input.rpmLow,
    rpm_high: input.rpmHigh,
    pickup_timing_notes: input.pickupTimingNotes,
    equipment_notes: input.equipmentNotes,
    dispatch_notes: input.dispatchNotes,
    expiration_at: input.expirationAt,
    closing_line: input.closingLine,
    // New persisted fields land here as well. accessorials persists as
    // JSONB; an empty array is fine to store (workspace coalesces null
    // and [] to the same empty state on read).
    fuel_surcharge: input.fuelSurcharge,
    accessorials: input.accessorials,
    payment_terms: input.paymentTerms,
    special_instructions: input.specialInstructions,
  };
}

export async function saveDraftEstimate(formData: FormData): Promise<void> {
  await requireAdmin();
  const input = readDraftEstimateInput(formData);
  const sb = createServiceRoleClient();

  // Field-only save. Leaves any existing preview snapshot intact — the
  // composer's stale indicator will flip on once the next field edit
  // diverges from the snapshot.
  await upsertDraftEstimate(sb, input.quoteRequestId, toDraftPersistFields(input));

  await logDispatchEvent(sb, input.quoteRequestId, "estimate_draft_saved", {
    linehaulLow: input.linehaulLow,
    linehaulHigh: input.linehaulHigh,
  });

  revalidatePath(`/admin/quotes/${input.quoteRequestId}`);
}

type DraftPreviewSnapshotRow = {
  id: string;
  linehaul_low: string | number | null;
  linehaul_high: string | number | null;
  preview_subject: string | null;
  preview_preheader: string | null;
  preview_html: string | null;
  preview_text: string | null;
  preview_to: string | null;
  preview_from: string | null;
  preview_reply_to: string | null;
  preview_built_at: string | null;
};

/**
 * Finalize and send the dispatch estimate to the customer.
 *
 * Send uses the *persisted preview snapshot* on the draft row — the
 * exact bytes Brent reviewed in Build Preview — never the live form
 * fields. preview-bytes == sent-bytes by construction. If no preview
 * exists, send is refused.
 *
 * On success the draft row is converted in-place to a historical sent
 * record (sent_at + sent_email_id set). The partial unique index
 * `dispatch_estimates_one_draft_per_request` only constrains sent_at IS
 * NULL rows, so this clears the way for the next draft to be created.
 */
export async function sendEstimate(quoteRequestId: string): Promise<void> {
  await requireAdmin();
  if (!quoteRequestId) {
    throw new Error("Missing quote_request_id.");
  }

  const sb = createServiceRoleClient();

  // 1. Read the current draft + its persisted preview snapshot.
  const { data: draft, error: draftError } = await sb
    .from("dispatch_estimates")
    .select(
      "id, linehaul_low, linehaul_high, preview_subject, preview_preheader, preview_html, preview_text, preview_to, preview_from, preview_reply_to, preview_built_at",
    )
    .eq("quote_request_id", quoteRequestId)
    .is("sent_at", null)
    .maybeSingle<DraftPreviewSnapshotRow>();
  if (draftError) {
    throw new Error(`Draft lookup failed: ${draftError.message}`);
  }
  if (!draft) {
    throw new Error("No draft estimate found. Build a preview first.");
  }
  if (
    !draft.preview_built_at ||
    !draft.preview_subject ||
    !draft.preview_html ||
    !draft.preview_text ||
    !draft.preview_to ||
    !draft.preview_from ||
    !draft.preview_reply_to
  ) {
    throw new Error("Preview hasn't been built yet. Build a preview first.");
  }

  // 2. Read lead lead_status so we know whether to advance it.
  const { data: lead, error: leadError } = await sb
    .from("quote_requests")
    .select("lead_status")
    .eq("id", quoteRequestId)
    .maybeSingle<{ lead_status: LeadStatus }>();
  if (leadError) {
    throw new Error(`Lead lookup failed: ${leadError.message}`);
  }
  if (!lead) {
    throw new Error("Lead not found.");
  }

  // 3. Send the saved preview verbatim.
  const result = await sendDispatchEstimateBytes({
    to: draft.preview_to,
    from: draft.preview_from,
    replyTo: draft.preview_reply_to,
    subject: draft.preview_subject,
    html: draft.preview_html,
    text: draft.preview_text,
  });

  if (!result.ok) {
    await logDispatchEvent(sb, quoteRequestId, "estimate_send_failed", {
      reason: result.reason,
      to: draft.preview_to,
    });
    throw new Error(`Could not send estimate: ${result.reason}`);
  }

  // 4. Mark draft as sent.
  const sentAt = new Date().toISOString();
  const { error: markError } = await sb
    .from("dispatch_estimates")
    .update({ sent_at: sentAt, sent_email_id: result.emailId })
    .eq("id", draft.id);
  if (markError) {
    console.error("[sendEstimate] mark-sent failed after delivery", {
      estimateId: draft.id,
      message: markError.message,
    });
  }

  const linehaulLow =
    draft.linehaul_low === null ? null : Number(draft.linehaul_low);
  const linehaulHigh =
    draft.linehaul_high === null ? null : Number(draft.linehaul_high);

  await logDispatchEvent(sb, quoteRequestId, "estimate_sent", {
    emailId: result.emailId,
    linehaulLow,
    linehaulHigh,
    to: draft.preview_to,
  });

  if (lead.lead_status === "new" || lead.lead_status === "contacted") {
    const previous = lead.lead_status;
    const now = new Date().toISOString();
    const { error: statusError } = await sb
      .from("quote_requests")
      .update({ lead_status: "estimate_sent", lead_status_updated_at: now })
      .eq("id", quoteRequestId);
    if (statusError) {
      console.error("[sendEstimate] status advance failed", {
        message: statusError.message,
      });
    } else {
      await logDispatchEvent(sb, quoteRequestId, "status_changed", {
        from: previous,
        to: "estimate_sent",
      });
    }
  }

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
  // closingLine is optional — the workspace's Special Instructions
  // field synthesizes it, and operators are allowed to leave it
  // blank. The renderer suppresses the Confirmation band when
  // closingLine is empty so the email closes cleanly.

  const sb = createServiceRoleClient();

  // Pull lead fields we need to fill the rendered email.
  const { data: lead, error: leadError } = await sb
    .from("quote_requests")
    .select(
      "name, email, commodity, weight, pickup_zip, delivery_zip, pickup_date, pickup_city, pickup_state, delivery_city, delivery_state",
    )
    .eq("id", input.quoteRequestId)
    .maybeSingle<{
      name: string;
      email: string;
      commodity: string;
      weight: string;
      pickup_zip: string | null;
      delivery_zip: string | null;
      pickup_date: string | null;
      pickup_city: string | null;
      pickup_state: string | null;
      delivery_city: string | null;
      delivery_state: string | null;
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

  // First pass: persist the form fields so the row exists and we can
  // read back its accept_token (auto-populated by the DB default on
  // first insert, preserved on subsequent updates).
  const draftRow = await upsertDraftEstimate(
    sb,
    input.quoteRequestId,
    toDraftPersistFields(input),
  );
  if (!draftRow.accept_token) {
    // Older row inserted before the token column existed and missed the
    // backfill — generate one now so the email can render Accept/Decline.
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error: tokenError } = await sb
      .from("dispatch_estimates")
      .update({ accept_token: token })
      .eq("id", draftRow.id);
    if (tokenError) {
      throw new Error(`Could not assign accept token: ${tokenError.message}`);
    }
    draftRow.accept_token = token;
  }

  const payload: EstimateRenderPayload = {
    to: lead.email,
    name: lead.name,
    lane: {
      pickupZip: lead.pickup_zip,
      deliveryZip: lead.delivery_zip,
      pickupCity: lead.pickup_city ?? null,
      pickupState: lead.pickup_state ?? null,
      deliveryCity: lead.delivery_city ?? null,
      deliveryState: lead.delivery_state ?? null,
    },
    load: {
      commodity: lead.commodity,
      weight: lead.weight,
      // When the customer didn't supply a pickup date, print an em-dash
      // in the rendered email instead of "ASAP". Reads as standard
      // dispatch paperwork — "—" means "not yet set" rather than
      // implying same-day urgency.
      pickup: lead.pickup_date ?? "—",
    },
    rate: {
      low: input.linehaulLow,
      high: input.linehaulHigh,
    },
    miles: input.milesEstimate,
    pickupTimingNotes: input.pickupTimingNotes,
    equipmentNotes: input.equipmentNotes,
    // Optional rate-breakdown line items. These are NOT persisted to
    // dispatch_estimates columns (schema unchanged); they only need
    // to survive the single render call before being baked into the
    // preview_html / preview_text snapshot. fuel_surcharge is a
    // single non-negative number; accessorial_label[] +
    // accessorial_amount[] are parallel arrays parsed by the existing
    // parseAccessorials() helper. When both are absent the rate
    // breakdown collapses to Linehaul → Total.
    fuelSurcharge: parseNumber(formData.get("fuel_surcharge")),
    accessorials: parseAccessorials(formData),
    // closingLine is parsed as string|null but the renderer's
    // EstimatePayload expects string. Coalesce to "" — the renderer
    // already suppresses the Confirmation band on empty closing lines.
    closingLine: input.closingLine ?? "",
    expirationAt: input.expirationAt,
    leadId: input.quoteRequestId,
    acceptUrl: acceptUrl(draftRow.accept_token),
    declineUrl: declineUrl(draftRow.accept_token),
  };

  const rendered = renderEstimateEmail(payload);

  // Second pass: persist the rendered snapshot. preview-bytes ==
  // sent-bytes by construction because Send reads these back verbatim.
  await upsertDraftEstimate(
    sb,
    input.quoteRequestId,
    toDraftPersistFields(input),
    {
      preview_subject: rendered.subject,
      preview_preheader: rendered.preheader,
      preview_html: rendered.html,
      preview_text: rendered.text,
      preview_to: rendered.to,
      preview_from: rendered.from,
      preview_reply_to: rendered.replyTo,
      preview_built_at: new Date().toISOString(),
    },
  );

  // NOTE: intentionally NO revalidatePath here. Building a preview is a
  // read-only-to-the-page operation — the rendered email is returned to the
  // client and shown in the modal from that return value. Revalidating the
  // load route forced a server re-render of the whole page mid-edit, which
  // raced with the Load Details auto-save and wiped freshly-typed stops &
  // addresses. The draft estimate is still persisted above; the page picks
  // up its new state on the next real navigation or on Send.

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
