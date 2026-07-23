"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";
import { logDispatchEvent } from "@/lib/dispatch/events";
import {
  renderBolEmail,
  sendBolBytes,
  type BolPayload,
} from "@/lib/email/bill-of-lading";

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

// ─── primitive parsers ────────────────────────────────────────────────────

function s(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const str = String(v).trim();
  return str.length === 0 ? null : str;
}

function n(v: FormDataEntryValue | null): number | null {
  const str = s(v);
  if (str === null) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

function int32(v: FormDataEntryValue | null): number | null {
  const num = n(v);
  return num === null ? null : Math.trunc(num);
}

/**
 * Strict boolean parser — BOL booleans are knowable by the time we
 * write paperwork, so no tri-state. "yes" / "true" → true, everything
 * else → false.
 */
function strictBool(v: FormDataEntryValue | null): boolean {
  const str = s(v);
  if (str === null) return false;
  return str === "yes" || str === "true" || str === "on";
}

// ─── type shapes for DB rows ──────────────────────────────────────────────

type BolDraftRow = {
  id: string;
  bol_number: string;
  finalized_quote_id: string;
  dispatch_estimate_id: string;
  quote_request_id: string;
};

type LatestFinalizedQuoteRow = {
  id: string;
  finalized_quote_number: string;
  dispatch_estimate_id: string;
  sent_at: string | null;
  total_amount: string | number | null;

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

  commodity: string | null;
  length_in: string | number | null;
  width_in: string | number | null;
  height_in: string | number | null;
  exact_weight_lbs: string | number | null;
  quantity: number | null;
  handling_type: string | null;
  securement_requirements: string | null;

  driver_assist_required: boolean | null;
  tarp_required: boolean | null;
  permits_required: boolean | null;
  escort_required: boolean | null;
  special_instructions: string | null;
};

type LeadSnapshotRow = {
  id: string;
  name: string;
  email: string;
};

function toNum(v: string | number | null): number | null {
  if (v == null) return null;
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : null;
}

function shortRef(uuid: string): string {
  const hex = uuid.replace(/-/g, "");
  if (hex.length < 8) return uuid.toUpperCase();
  const tail = hex.slice(-8).toUpperCase();
  return `${tail.slice(0, 4)}-${tail.slice(4)}`;
}

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
  if (!quoteRequestId) {
    return { ok: false, reason: "Missing quote_request_id." };
  }

  const sb = createServiceRoleClient();

  // 1. Find the most recently SENT finalized quote for this lead.
  const { data: fq, error: fqErr } = await sb
    .from("finalized_quotes")
    .select(
      "id, finalized_quote_number, dispatch_estimate_id, sent_at, total_amount, pickup_company, pickup_contact_name, pickup_contact_phone, pickup_contact_email, pickup_address_line1, pickup_address_line2, pickup_city, pickup_state, pickup_zip, pickup_window, delivery_company, delivery_contact_name, delivery_contact_phone, delivery_contact_email, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_zip, delivery_window, commodity, length_in, width_in, height_in, exact_weight_lbs, quantity, handling_type, securement_requirements, driver_assist_required, tarp_required, permits_required, escort_required, special_instructions",
    )
    .eq("quote_request_id", quoteRequestId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle<LatestFinalizedQuoteRow>();

  if (fqErr) {
    return { ok: false, reason: `Finalized quote lookup failed: ${fqErr.message}` };
  }
  if (!fq) {
    return {
      ok: false,
      reason:
        "No sent finalized quote found. Send a finalized quote before generating a BOL.",
    };
  }

  // 2. If a draft BOL already exists for this finalized quote, return it.
  const { data: existing } = await sb
    .from("bills_of_lading")
    .select(
      "id, bol_number, finalized_quote_id, dispatch_estimate_id, quote_request_id",
    )
    .eq("finalized_quote_id", fq.id)
    .is("sent_at", null)
    .maybeSingle<BolDraftRow>();

  if (existing) {
    return { ok: true, id: existing.id };
  }

  // 3. Map operational fields from the finalized quote. Booleans on the
  //    BOL are strict, so null on the FQ side resolves to false here.
  const driverAssist = fq.driver_assist_required === true;
  const tarp = fq.tarp_required === true;
  const permits = fq.permits_required === true;
  const escort = fq.escort_required === true;

  const dispatchRef = `HS-${shortRef(quoteRequestId)}`;
  const issueDate = new Date().toISOString().slice(0, 10);

  const { data: inserted, error: insertErr } = await sb
    .from("bills_of_lading")
    .insert({
      quote_request_id: quoteRequestId,
      dispatch_estimate_id: fq.dispatch_estimate_id,
      finalized_quote_id: fq.id,

      dispatch_reference: dispatchRef,
      issue_date: issueDate,

      // Shipper snapshot (from FQ pickup)
      shipper_company: fq.pickup_company,
      shipper_contact_name: fq.pickup_contact_name,
      shipper_contact_phone: fq.pickup_contact_phone,
      shipper_contact_email: fq.pickup_contact_email,
      shipper_address_line1: fq.pickup_address_line1,
      shipper_address_line2: fq.pickup_address_line2,
      shipper_city: fq.pickup_city,
      shipper_state: fq.pickup_state,
      shipper_zip: fq.pickup_zip,
      pickup_window: fq.pickup_window,
      pickup_instructions: null,

      // Consignee snapshot (from FQ delivery)
      consignee_company: fq.delivery_company,
      consignee_contact_name: fq.delivery_contact_name,
      consignee_contact_phone: fq.delivery_contact_phone,
      consignee_contact_email: fq.delivery_contact_email,
      consignee_address_line1: fq.delivery_address_line1,
      consignee_address_line2: fq.delivery_address_line2,
      consignee_city: fq.delivery_city,
      consignee_state: fq.delivery_state,
      consignee_zip: fq.delivery_zip,
      delivery_window: fq.delivery_window,
      delivery_instructions: null,

      // Freight snapshot
      commodity: fq.commodity,
      quantity: fq.quantity,
      handling_units_type: fq.handling_type,
      length_in: toNum(fq.length_in),
      width_in: toNum(fq.width_in),
      height_in: toNum(fq.height_in),
      weight_lbs: toNum(fq.exact_weight_lbs),
      nmfc_code: null,
      freight_class: null,
      hazmat: false,
      special_handling: fq.securement_requirements,

      // Operational handling (booleans default false; pulled from FQ
      // where unambiguous, dispatch can adjust before send).
      driver_assist_required: driverAssist,
      tarp_required: tarp,
      permits_required: permits,
      escort_required: escort,
      rigging_required: false,
      appointment_required: false,
      special_instructions: fq.special_instructions,

      dispatch_notes: null,
    })
    .select(
      "id, bol_number, finalized_quote_id, dispatch_estimate_id, quote_request_id",
    )
    .single<BolDraftRow>();

  if (insertErr || !inserted) {
    return {
      ok: false,
      reason: `Could not start BOL: ${insertErr?.message ?? "unknown"}`,
    };
  }

  await logDispatchEvent(sb, quoteRequestId, "bol_draft_started", {
    bolId: inserted.id,
    bolNumber: inserted.bol_number,
    finalizedQuoteId: fq.id,
  });

  revalidatePath(`/admin/quotes/${quoteRequestId}`);
  return { ok: true, id: inserted.id };
}

// ─────────────────────────────────────────────────────────────────────────
//  Field parsing — shared between save + preview.
// ─────────────────────────────────────────────────────────────────────────

type BolFields = {
  dispatch_reference: string | null;
  issue_date: string | null;

  shipper_company: string | null;
  shipper_contact_name: string | null;
  shipper_contact_phone: string | null;
  shipper_contact_email: string | null;
  shipper_address_line1: string | null;
  shipper_address_line2: string | null;
  shipper_city: string | null;
  shipper_state: string | null;
  shipper_zip: string | null;
  pickup_window: string | null;
  pickup_instructions: string | null;

  consignee_company: string | null;
  consignee_contact_name: string | null;
  consignee_contact_phone: string | null;
  consignee_contact_email: string | null;
  consignee_address_line1: string | null;
  consignee_address_line2: string | null;
  consignee_city: string | null;
  consignee_state: string | null;
  consignee_zip: string | null;
  delivery_window: string | null;
  delivery_instructions: string | null;

  commodity: string | null;
  quantity: number | null;
  handling_units_type: string | null;
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  weight_lbs: number | null;
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
};

function readBolFields(formData: FormData): BolFields {
  return {
    dispatch_reference: s(formData.get("dispatch_reference")),
    issue_date: s(formData.get("issue_date")),

    shipper_company: s(formData.get("shipper_company")),
    shipper_contact_name: s(formData.get("shipper_contact_name")),
    shipper_contact_phone: s(formData.get("shipper_contact_phone")),
    shipper_contact_email: s(formData.get("shipper_contact_email")),
    shipper_address_line1: s(formData.get("shipper_address_line1")),
    shipper_address_line2: s(formData.get("shipper_address_line2")),
    shipper_city: s(formData.get("shipper_city")),
    shipper_state: s(formData.get("shipper_state")),
    shipper_zip: s(formData.get("shipper_zip")),
    pickup_window: s(formData.get("pickup_window")),
    pickup_instructions: s(formData.get("pickup_instructions")),

    consignee_company: s(formData.get("consignee_company")),
    consignee_contact_name: s(formData.get("consignee_contact_name")),
    consignee_contact_phone: s(formData.get("consignee_contact_phone")),
    consignee_contact_email: s(formData.get("consignee_contact_email")),
    consignee_address_line1: s(formData.get("consignee_address_line1")),
    consignee_address_line2: s(formData.get("consignee_address_line2")),
    consignee_city: s(formData.get("consignee_city")),
    consignee_state: s(formData.get("consignee_state")),
    consignee_zip: s(formData.get("consignee_zip")),
    delivery_window: s(formData.get("delivery_window")),
    delivery_instructions: s(formData.get("delivery_instructions")),

    commodity: s(formData.get("commodity")),
    quantity: int32(formData.get("quantity")),
    handling_units_type: s(formData.get("handling_units_type")),
    length_in: n(formData.get("length_in")),
    width_in: n(formData.get("width_in")),
    height_in: n(formData.get("height_in")),
    weight_lbs: n(formData.get("weight_lbs")),
    nmfc_code: s(formData.get("nmfc_code")),
    freight_class: s(formData.get("freight_class")),
    hazmat: strictBool(formData.get("hazmat")),
    special_handling: s(formData.get("special_handling")),

    driver_assist_required: strictBool(formData.get("driver_assist_required")),
    tarp_required: strictBool(formData.get("tarp_required")),
    permits_required: strictBool(formData.get("permits_required")),
    escort_required: strictBool(formData.get("escort_required")),
    rigging_required: strictBool(formData.get("rigging_required")),
    appointment_required: strictBool(formData.get("appointment_required")),
    special_instructions: s(formData.get("special_instructions")),

    dispatch_notes: s(formData.get("dispatch_notes")),
  };
}

async function loadBolDraftById(
  sb: ReturnType<typeof createServiceRoleClient>,
  bolId: string,
): Promise<
  | { ok: true; row: BolDraftRow }
  | { ok: false; reason: string }
> {
  const { data, error } = await sb
    .from("bills_of_lading")
    .select(
      "id, bol_number, finalized_quote_id, dispatch_estimate_id, quote_request_id, sent_at",
    )
    .eq("id", bolId)
    .maybeSingle<BolDraftRow & { sent_at: string | null }>();
  if (error) {
    return { ok: false, reason: `Lookup failed: ${error.message}` };
  }
  if (!data) {
    return { ok: false, reason: "BOL not found." };
  }
  if (data.sent_at) {
    return {
      ok: false,
      reason: "This BOL was already sent — start a new draft to revise.",
    };
  }
  return { ok: true, row: data };
}

// ─────────────────────────────────────────────────────────────────────────
//  2. Save Draft — field-only UPDATE.
// ─────────────────────────────────────────────────────────────────────────

export async function saveBolDraft(formData: FormData): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await requireAdmin();
  const bolId = s(formData.get("bol_id"));
  if (!bolId) throw new Error("Missing bol_id.");

  const sb = createServiceRoleClient();
  const loaded = await loadBolDraftById(sb, bolId);
  if (!loaded.ok) throw new Error(loaded.reason);
  const draft = loaded.row;

  const fields = readBolFields(formData);

  const { error: updateErr } = await sb
    .from("bills_of_lading")
    .update(fields)
    .eq("id", draft.id);
  if (updateErr) {
    throw new Error(`Could not save BOL draft: ${updateErr.message}`);
  }

  await logDispatchEvent(sb, draft.quote_request_id, "bol_draft_saved", {
    bolId: draft.id,
    bolNumber: draft.bol_number,
  });

  revalidatePath(`/admin/quotes/${draft.quote_request_id}`);
}

// ─────────────────────────────────────────────────────────────────────────
//  3. Build Preview — save + render + persist snapshot.
// ─────────────────────────────────────────────────────────────────────────

export type BolEmailPreview = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

export async function buildBolPreview(
  formData: FormData,
): Promise<BolEmailPreview> {
  await requireAdmin();
  const bolId = s(formData.get("bol_id"));
  if (!bolId) throw new Error("Missing bol_id.");

  const sb = createServiceRoleClient();
  const loaded = await loadBolDraftById(sb, bolId);
  if (!loaded.ok) throw new Error(loaded.reason);
  const draft = loaded.row;

  const fields = readBolFields(formData);

  if (!fields.commodity) {
    throw new Error("Commodity is required before building the BOL preview.");
  }
  if (!fields.shipper_company && !fields.shipper_address_line1) {
    throw new Error("Shipper info is required (company or address).");
  }
  if (!fields.consignee_company && !fields.consignee_address_line1) {
    throw new Error("Consignee info is required (company or address).");
  }

  // Pull lead for the email "to" address.
  const { data: lead, error: leadErr } = await sb
    .from("quote_requests")
    .select("id, name, email")
    .eq("id", draft.quote_request_id)
    .maybeSingle<LeadSnapshotRow>();
  if (leadErr) throw new Error(`Lead lookup failed: ${leadErr.message}`);
  if (!lead) throw new Error("Lead not found.");

  // Resolve the finalized-quote number for the cross-reference field
  // on the BOL. Read it from the linked FQ row.
  const { data: fqRow } = await sb
    .from("finalized_quotes")
    .select("finalized_quote_number")
    .eq("id", draft.finalized_quote_id)
    .maybeSingle<{ finalized_quote_number: string }>();
  const finalizedQuoteNumber = fqRow?.finalized_quote_number ?? null;
  const rangeQuoteNumber = `HS-${shortRef(lead.id)}`;

  // Persist fields first so the row reflects the form even if rendering
  // throws.
  const { error: updateErr } = await sb
    .from("bills_of_lading")
    .update(fields)
    .eq("id", draft.id);
  if (updateErr) {
    throw new Error(`Could not save fields: ${updateErr.message}`);
  }

  const payload: BolPayload = {
    to: lead.email,
    recipientName: lead.name,
    bolNumber: draft.bol_number,
    dispatchReference: fields.dispatch_reference ?? `HS-${shortRef(lead.id)}`,
    rangeQuoteNumber,
    finalizedQuoteNumber,
    issueDate: fields.issue_date ?? new Date().toISOString().slice(0, 10),

    shipper: {
      company: fields.shipper_company,
      contactName: fields.shipper_contact_name,
      contactPhone: fields.shipper_contact_phone,
      contactEmail: fields.shipper_contact_email,
      addressLine1: fields.shipper_address_line1,
      addressLine2: fields.shipper_address_line2,
      city: fields.shipper_city,
      state: fields.shipper_state,
      zip: fields.shipper_zip,
      pickupWindow: fields.pickup_window,
      pickupInstructions: fields.pickup_instructions,
    },
    consignee: {
      company: fields.consignee_company,
      contactName: fields.consignee_contact_name,
      contactPhone: fields.consignee_contact_phone,
      contactEmail: fields.consignee_contact_email,
      addressLine1: fields.consignee_address_line1,
      addressLine2: fields.consignee_address_line2,
      city: fields.consignee_city,
      state: fields.consignee_state,
      zip: fields.consignee_zip,
      deliveryWindow: fields.delivery_window,
      deliveryInstructions: fields.delivery_instructions,
    },
    freight: {
      commodity: fields.commodity,
      quantity: fields.quantity,
      handlingUnitsType: fields.handling_units_type,
      lengthIn: fields.length_in,
      widthIn: fields.width_in,
      heightIn: fields.height_in,
      weightLbs: fields.weight_lbs,
      nmfcCode: fields.nmfc_code,
      freightClass: fields.freight_class,
      hazmat: fields.hazmat,
      specialHandling: fields.special_handling,
    },
    ops: {
      driverAssistRequired: fields.driver_assist_required,
      tarpRequired: fields.tarp_required,
      permitsRequired: fields.permits_required,
      escortRequired: fields.escort_required,
      riggingRequired: fields.rigging_required,
      appointmentRequired: fields.appointment_required,
      specialInstructions: fields.special_instructions,
    },
    dispatchNotes: fields.dispatch_notes,
    preparedBy: null,
  };

  const rendered = renderBolEmail(payload);

  const { error: snapErr } = await sb
    .from("bills_of_lading")
    .update({
      preview_subject: rendered.subject,
      preview_preheader: rendered.preheader,
      preview_html: rendered.html,
      preview_text: rendered.text,
      preview_to: rendered.to,
      preview_from: rendered.from,
      preview_reply_to: rendered.replyTo,
      preview_built_at: new Date().toISOString(),
    })
    .eq("id", draft.id);
  if (snapErr) {
    throw new Error(`Could not persist preview: ${snapErr.message}`);
  }

  await logDispatchEvent(sb, draft.quote_request_id, "bol_preview_built", {
    bolId: draft.id,
    bolNumber: draft.bol_number,
  });

  revalidatePath(`/admin/quotes/${draft.quote_request_id}`);

  return rendered;
}

// ─────────────────────────────────────────────────────────────────────────
//  4. Send — read snapshot, send verbatim, mark sent.
// ─────────────────────────────────────────────────────────────────────────

type BolSendRow = {
  id: string;
  bol_number: string;
  quote_request_id: string;
  sent_at: string | null;
  preview_subject: string | null;
  preview_preheader: string | null;
  preview_html: string | null;
  preview_text: string | null;
  preview_to: string | null;
  preview_from: string | null;
  preview_reply_to: string | null;
  preview_built_at: string | null;
};

export async function sendBol(bolId: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: never send a real BOL email.
  await requireAdmin();
  if (!bolId) throw new Error("Missing bol_id.");

  const sb = createServiceRoleClient();
  const { data: draft, error } = await sb
    .from("bills_of_lading")
    .select(
      "id, bol_number, quote_request_id, sent_at, preview_subject, preview_preheader, preview_html, preview_text, preview_to, preview_from, preview_reply_to, preview_built_at",
    )
    .eq("id", bolId)
    .maybeSingle<BolSendRow>();
  if (error) throw new Error(`Lookup failed: ${error.message}`);
  if (!draft) throw new Error("BOL not found.");
  if (draft.sent_at) throw new Error("This BOL was already sent.");
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

  const result = await sendBolBytes({
    to: draft.preview_to,
    from: draft.preview_from,
    replyTo: draft.preview_reply_to,
    subject: draft.preview_subject,
    html: draft.preview_html,
    text: draft.preview_text,
  });

  if (!result.ok) {
    await logDispatchEvent(sb, draft.quote_request_id, "bol_send_failed", {
      bolId: draft.id,
      bolNumber: draft.bol_number,
      reason: result.reason,
      to: draft.preview_to,
    });
    throw new Error(`Could not send BOL: ${result.reason}`);
  }

  const sentAt = new Date().toISOString();
  const { error: markErr } = await sb
    .from("bills_of_lading")
    .update({ sent_at: sentAt, sent_email_id: result.emailId })
    .eq("id", draft.id);
  if (markErr) {
    console.error("[sendBol] mark-sent failed after delivery", {
      bolId: draft.id,
      message: markErr.message,
    });
  }

  await logDispatchEvent(sb, draft.quote_request_id, "bol_sent", {
    bolId: draft.id,
    bolNumber: draft.bol_number,
    emailId: result.emailId,
    to: draft.preview_to,
  });

  revalidatePath(`/admin/quotes/${draft.quote_request_id}`);
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
