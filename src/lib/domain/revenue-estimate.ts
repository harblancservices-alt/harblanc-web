import { createServiceRoleClient } from "@/lib/supabase/server";
import { logDispatchEvent } from "@/lib/dispatch/events";
import { isLeadStatus, type LeadStatus } from "@/lib/dispatch/status";
import { computeRpm } from "@/lib/dispatch/distance";
import { sendDispatchEstimateBytes } from "@/lib/email/estimate";
import { findTemplate } from "@/lib/dispatch/templates";
import {
  renderEstimateEmail,
  type EstimatePayload as EstimateRenderPayload,
} from "@/lib/email/render";

/**
 * Estimate (range proposal) — the first stage of the revenue pipeline
 * (Estimate → Quote → BOL → Payment). Shared by both /admin and /tms-v2,
 * each of which adds only its own app-specific behavior on top
 * (demo-mode gate + revalidatePath targets for /admin; revalidatePath
 * targets only for /tms-v2, which has no demo mode) — see the two
 * wrapper files: src/app/admin/(authed)/quotes/actions.ts and
 * src/actions/tms-v2/pipeline.ts.
 *
 * Deliberately EXCLUDES softDeleteQuote/restoreQuote/permanentlyDeleteQuote
 * (+ batch variants), updateDispatchOwnership, addDispatchNote,
 * buildAcknowledgementPreview, resendEstimate, saveLoadDetailsOverrides,
 * and lookupZipDetails — those stay in admin's quotes/actions.ts unchanged;
 * /tms-v2 doesn't call them (confirmed: pipeline.ts is tms-v2's only entry
 * point into the four quotes/*.ts admin files).
 *
 * No company/user scoping or per-caller authorization here by design —
 * this is a single-tenant domain, and every caller is already behind the
 * shared admin session gate (src/middleware.ts) before it can reach a
 * Server Action that calls these.
 */

const PUBLIC_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.harblancservices.com";

function acceptUrl(token: string): string {
  return `${PUBLIC_ORIGIN}/quote/accept/${token}`;
}
function declineUrl(token: string): string {
  return `${PUBLIC_ORIGIN}/quote/decline/${token}`;
}

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

type LeadStatusRow = {
  lead_status: LeadStatus;
};

export async function updateLeadStatus(
  id: string,
  newStatus: string,
): Promise<void> {
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
    fuel_surcharge: input.fuelSurcharge,
    accessorials: input.accessorials,
    payment_terms: input.paymentTerms,
    special_instructions: input.specialInstructions,
  };
}

export async function saveDraftEstimate(formData: FormData): Promise<void> {
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
 * exact bytes the operator reviewed in Build Preview — never the live
 * form fields. preview-bytes == sent-bytes by construction. If no
 * preview exists, send is refused.
 *
 * On success the draft row is converted in-place to a historical sent
 * record (sent_at + sent_email_id set). The partial unique index
 * `dispatch_estimates_one_draft_per_request` only constrains sent_at IS
 * NULL rows, so this clears the way for the next draft to be created.
 */
export async function sendEstimate(quoteRequestId: string): Promise<void> {
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
}

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
    // preview_html / preview_text snapshot.
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

  // NOTE: intentionally NO revalidatePath here — same reasoning as the
  // original admin implementation. Building a preview is a
  // read-only-to-the-page operation — the rendered email is returned to
  // the client and shown in the modal from that return value.
  // Revalidating the load route forced a server re-render of the whole
  // page mid-edit, which raced with the Load Details auto-save and wiped
  // freshly-typed stops & addresses. The draft estimate is still
  // persisted above; the page picks up its new state on the next real
  // navigation or on Send. Callers do their own revalidatePath.

  return rendered;
}
