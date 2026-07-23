"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";
import { logDispatchEvent } from "@/lib/dispatch/events";
import { type LeadStatus } from "@/lib/dispatch/status";
import {
  renderFinalizedQuoteEmail,
  sendFinalizedQuoteBytes,
  type FinalizedQuoteAccessorial,
  type FinalizedQuotePayload,
} from "@/lib/email/finalized-quote";

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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_VALIDITY_DAYS = 5;
const DEFAULT_PAYMENT_DUE_DAYS = 3;

/**
 * Public origin for customer-facing token URLs (the confirm-rate link
 * the email's action band points at). Mirrors the PUBLIC_ORIGIN
 * pattern in actions.ts so a missing env var falls back to the prod
 * domain — local previews still produce valid-looking URLs.
 */
const PUBLIC_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.harblancservices.com";

function confirmUrl(token: string): string {
  return `${PUBLIC_ORIGIN}/quote/confirm/${token}`;
}

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
 * Tri-state boolean parser. Form values are "yes" / "no" / "" — the
 * empty string maps to null so dispatch can leave a field unanswered.
 */
function triBool(v: FormDataEntryValue | null): boolean | null {
  const str = s(v);
  if (str === null) return null;
  if (str === "yes" || str === "true") return true;
  if (str === "no" || str === "false") return false;
  return null;
}

function parseAccessorialsArray(formData: FormData): FinalizedQuoteAccessorial[] {
  const labels = formData.getAll("accessorial_label").map((v) => String(v));
  const amounts = formData.getAll("accessorial_amount").map((v) => n(v));
  const out: FinalizedQuoteAccessorial[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i].trim();
    const amount = amounts[i];
    if (label.length > 0 && amount !== null && amount !== 0) {
      out.push({ label, amount });
    }
  }
  return out;
}

function computeTotal(
  linehaul: number | null,
  fuelSurcharge: number | null,
  permitsFee: number | null,
  accessorials: ReadonlyArray<FinalizedQuoteAccessorial>,
): number {
  const a = linehaul ?? 0;
  const f = fuelSurcharge ?? 0;
  const p = permitsFee ?? 0;
  const x = accessorials.reduce((sum, ax) => sum + ax.amount, 0);
  return Number((a + f + p + x).toFixed(2));
}

function isoDateOrNull(s: string | null): string | null {
  if (!s) return null;
  // Caller hands us a YYYY-MM-DD string from a <input type="date">.
  // Pass through; Supabase will coerce to date.
  return s;
}

function daysFromNowISO(days: number): string {
  const d = new Date(Date.now() + days * ONE_DAY_MS);
  return d.toISOString().slice(0, 10);
}

// ─── type shapes for DB rows ──────────────────────────────────────────────

type FinalizedQuoteDraftRow = {
  id: string;
  finalized_quote_number: string;
  dispatch_estimate_id: string;
  quote_request_id: string;
};

type FinalizedQuoteSendRow = {
  id: string;
  finalized_quote_number: string;
  total_amount: string | number | null;
  preview_subject: string | null;
  preview_preheader: string | null;
  preview_html: string | null;
  preview_text: string | null;
  preview_to: string | null;
  preview_from: string | null;
  preview_reply_to: string | null;
  preview_built_at: string | null;
};

type LatestEstimateRow = {
  id: string;
  quote_request_id: string;
  sent_at: string | null;
};

type IntakeSnapshotRow = {
  id: string;
  status: "in_progress" | "submitted";
  submitted_at: string | null;

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

  commodity_details: string | null;
  length_in: string | number | null;
  width_in: string | number | null;
  height_in: string | number | null;
  exact_weight_lbs: string | number | null;
  loading_responsibility: string | null;
  unloading_responsibility: string | null;
  special_requirements: string | null;
  reference_links: string | null;
  notes: string | null;
};

type LeadSnapshotRow = {
  id: string;
  name: string;
  email: string;
  commodity: string;
};

function toNum(v: string | number | null): number | null {
  if (v == null) return null;
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : null;
}

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
  if (!quoteRequestId) {
    return { ok: false, reason: "Missing quote_request_id." };
  }

  const sb = createServiceRoleClient();

  // 1. Find the most recently SENT estimate for this lead. That's the
  //    estimate the customer accepted and then submitted intake against.
  const { data: estimate, error: estErr } = await sb
    .from("dispatch_estimates")
    .select("id, quote_request_id, sent_at")
    .eq("quote_request_id", quoteRequestId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle<LatestEstimateRow>();

  if (estErr) {
    return { ok: false, reason: `Estimate lookup failed: ${estErr.message}` };
  }
  if (!estimate) {
    return {
      ok: false,
      reason:
        "No sent estimate found. Send a range proposal and wait for the customer's intake before generating a finalized quote.",
    };
  }

  // 2. If a draft already exists for this estimate, return it.
  const { data: existing } = await sb
    .from("finalized_quotes")
    .select("id, finalized_quote_number, dispatch_estimate_id, quote_request_id")
    .eq("dispatch_estimate_id", estimate.id)
    .is("sent_at", null)
    .maybeSingle<FinalizedQuoteDraftRow>();

  if (existing) {
    // Phase FLOW-FIX: revalidate even on the idempotent existing-draft
    // return. Most renders should already see this draft (the page
    // loader's loadFinalizedQuoteState reads the same row), so this is
    // belt-and-suspenders — covers the case where the operator clicks
    // Generate from a stale tab right after another tab created the
    // draft. router.refresh() on the client then reliably lands them
    // in the composer.
    revalidatePath(`/admin/quotes/${quoteRequestId}`);
    return { ok: true, id: existing.id };
  }

  // 3. Pull the intake snapshot so we can prefill the new draft.
  const { data: intake, error: intakeErr } = await sb
    .from("shipment_intake")
    .select(
      "id, status, submitted_at, pickup_company, pickup_contact_name, pickup_contact_phone, pickup_contact_email, pickup_address_line1, pickup_address_line2, pickup_city, pickup_state, pickup_zip, pickup_window, delivery_company, delivery_contact_name, delivery_contact_phone, delivery_contact_email, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_zip, delivery_window, commodity_details, length_in, width_in, height_in, exact_weight_lbs, loading_responsibility, unloading_responsibility, special_requirements, reference_links, notes",
    )
    .eq("dispatch_estimate_id", estimate.id)
    .maybeSingle<IntakeSnapshotRow>();

  if (intakeErr) {
    return { ok: false, reason: `Intake lookup failed: ${intakeErr.message}` };
  }
  if (!intake) {
    return {
      ok: false,
      reason:
        "No shipment intake found. Customer hasn't started the intake yet.",
    };
  }
  if (intake.status !== "submitted") {
    return {
      ok: false,
      reason:
        "Shipment intake is still in progress. Wait for the customer to submit before generating a finalized quote.",
    };
  }

  // 4. Pull the lead so we can prefill commodity.
  const { data: lead } = await sb
    .from("quote_requests")
    .select("id, name, email, commodity")
    .eq("id", quoteRequestId)
    .maybeSingle<LeadSnapshotRow>();

  if (!lead) {
    return { ok: false, reason: "Lead not found." };
  }

  // 5. Translate loading_responsibility / unloading_responsibility into
  //    operational hints. The intake values are radio-style codes
  //    ("shipper_forklift", "driver_load", etc.); we map them onto the
  //    finalized-quote booleans where the mapping is unambiguous, and
  //    leave the rest null for dispatch to decide.
  const forkliftAvailable = (() => {
    if (intake.loading_responsibility === "shipper_forklift") return true;
    if (intake.loading_responsibility === "shipper_hand") return false;
    if (intake.loading_responsibility === "driver_load") return false;
    return null;
  })();
  const driverAssistRequired = (() => {
    if (intake.loading_responsibility === "driver_load") return true;
    if (intake.unloading_responsibility === "driver_unload") return true;
    return null;
  })();
  const craneRequired = (() => {
    if (
      intake.loading_responsibility === "rigging_required" ||
      intake.unloading_responsibility === "rigging_required"
    ) {
      return true;
    }
    return null;
  })();

  // Range quote number — reuse the lead reference ID compressed into
  // the same HS-XXXX-XXXX form used elsewhere. Lives only as a label
  // here; nothing keys off it.
  const rangeQuoteNumber = `HS-${shortRef(quoteRequestId)}`;

  const issueDate = new Date().toISOString().slice(0, 10);
  const defaultExpiration = daysFromNowISO(DEFAULT_VALIDITY_DAYS);
  const defaultPaymentDue = daysFromNowISO(DEFAULT_PAYMENT_DUE_DAYS);

  const { data: inserted, error: insertErr } = await sb
    .from("finalized_quotes")
    .insert({
      quote_request_id: quoteRequestId,
      dispatch_estimate_id: estimate.id,

      issue_date: issueDate,
      expiration_at: defaultExpiration,
      payment_due_at: defaultPaymentDue,

      // Snapshot pickup
      pickup_company: intake.pickup_company,
      pickup_contact_name: intake.pickup_contact_name,
      pickup_contact_phone: intake.pickup_contact_phone,
      pickup_contact_email: intake.pickup_contact_email,
      pickup_address_line1: intake.pickup_address_line1,
      pickup_address_line2: intake.pickup_address_line2,
      pickup_city: intake.pickup_city,
      pickup_state: intake.pickup_state,
      pickup_zip: intake.pickup_zip,
      pickup_window: intake.pickup_window,
      pickup_loading_hours: null,

      // Snapshot delivery
      delivery_company: intake.delivery_company,
      delivery_contact_name: intake.delivery_contact_name,
      delivery_contact_phone: intake.delivery_contact_phone,
      delivery_contact_email: intake.delivery_contact_email,
      delivery_address_line1: intake.delivery_address_line1,
      delivery_address_line2: intake.delivery_address_line2,
      delivery_city: intake.delivery_city,
      delivery_state: intake.delivery_state,
      delivery_zip: intake.delivery_zip,
      delivery_window: intake.delivery_window,
      delivery_receiving_hours: null,

      // Freight
      commodity: intake.commodity_details ?? lead.commodity ?? null,
      length_in: toNum(intake.length_in),
      width_in: toNum(intake.width_in),
      height_in: toNum(intake.height_in),
      exact_weight_lbs: toNum(intake.exact_weight_lbs),
      quantity: null,
      handling_type: null,
      running_condition: null,
      securement_requirements: intake.special_requirements,

      // Operational requirements
      forklift_available: forkliftAvailable,
      driver_assist_required: driverAssistRequired,
      crane_required: craneRequired,
      permits_required: null,
      escort_required: null,
      tarp_required: null,
      special_instructions: intake.notes,

      // Pricing — blank until dispatch fills it.
      linehaul: null,
      fuel_surcharge: null,
      permits_fee: null,
      accessorials: [],
      total_amount: null,

      // Agreement language — null means "use defaults on render".
      detention_policy: null,
      tonu_policy: null,
      payment_instructions: null,
      dispatch_confirmation_statement: null,
      scheduling_statement: null,
      acceptance_acknowledgement: null,
    })
    .select(
      "id, finalized_quote_number, dispatch_estimate_id, quote_request_id",
    )
    .single<FinalizedQuoteDraftRow>();

  if (insertErr || !inserted) {
    return {
      ok: false,
      reason: `Could not start finalized quote: ${insertErr?.message ?? "unknown"}`,
    };
  }

  await logDispatchEvent(sb, quoteRequestId, "finalized_quote_draft_started", {
    finalizedQuoteId: inserted.id,
    finalizedQuoteNumber: inserted.finalized_quote_number,
    dispatchEstimateId: estimate.id,
  });

  revalidatePath(`/admin/quotes/${quoteRequestId}`);

  // Track the range quote number for downstream usage. We don't store
  // it on the row — it's a derived label.
  void rangeQuoteNumber;

  return { ok: true, id: inserted.id };
}

// ─────────────────────────────────────────────────────────────────────────
//  2. Save Draft — field-only UPDATE. No render, no email.
// ─────────────────────────────────────────────────────────────────────────

type FinalizedFields = {
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
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  exact_weight_lbs: number | null;
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

  linehaul: number | null;
  fuel_surcharge: number | null;
  permits_fee: number | null;
  accessorials: FinalizedQuoteAccessorial[];
  total_amount: number | null;

  detention_policy: string | null;
  tonu_policy: string | null;
  payment_instructions: string | null;
  dispatch_confirmation_statement: string | null;
  scheduling_statement: string | null;
  acceptance_acknowledgement: string | null;
};

function readFinalizedFields(formData: FormData): FinalizedFields {
  const accessorials = parseAccessorialsArray(formData);
  const linehaul = n(formData.get("linehaul"));
  const fuelSurcharge = n(formData.get("fuel_surcharge"));
  const permitsFee = n(formData.get("permits_fee"));
  const totalAmount =
    linehaul === null
      ? null
      : computeTotal(linehaul, fuelSurcharge, permitsFee, accessorials);

  return {
    expiration_at: isoDateOrNull(s(formData.get("expiration_at"))),
    payment_due_at: isoDateOrNull(s(formData.get("payment_due_at"))),

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
    pickup_loading_hours: s(formData.get("pickup_loading_hours")),

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
    delivery_receiving_hours: s(formData.get("delivery_receiving_hours")),

    commodity: s(formData.get("commodity")),
    length_in: n(formData.get("length_in")),
    width_in: n(formData.get("width_in")),
    height_in: n(formData.get("height_in")),
    exact_weight_lbs: n(formData.get("exact_weight_lbs")),
    quantity: int32(formData.get("quantity")),
    handling_type: s(formData.get("handling_type")),
    running_condition: s(formData.get("running_condition")),
    securement_requirements: s(formData.get("securement_requirements")),

    forklift_available: triBool(formData.get("forklift_available")),
    driver_assist_required: triBool(formData.get("driver_assist_required")),
    crane_required: triBool(formData.get("crane_required")),
    permits_required: triBool(formData.get("permits_required")),
    escort_required: triBool(formData.get("escort_required")),
    tarp_required: triBool(formData.get("tarp_required")),
    special_instructions: s(formData.get("special_instructions")),

    linehaul,
    fuel_surcharge: fuelSurcharge,
    permits_fee: permitsFee,
    accessorials,
    total_amount: totalAmount,

    detention_policy: s(formData.get("detention_policy")),
    tonu_policy: s(formData.get("tonu_policy")),
    payment_instructions: s(formData.get("payment_instructions")),
    dispatch_confirmation_statement: s(
      formData.get("dispatch_confirmation_statement"),
    ),
    scheduling_statement: s(formData.get("scheduling_statement")),
    acceptance_acknowledgement: s(formData.get("acceptance_acknowledgement")),
  };
}

async function loadDraftById(
  sb: ReturnType<typeof createServiceRoleClient>,
  finalizedQuoteId: string,
): Promise<
  | { ok: true; row: FinalizedQuoteDraftRow }
  | { ok: false; reason: string }
> {
  const { data, error } = await sb
    .from("finalized_quotes")
    .select(
      "id, finalized_quote_number, dispatch_estimate_id, quote_request_id, sent_at",
    )
    .eq("id", finalizedQuoteId)
    .maybeSingle<FinalizedQuoteDraftRow & { sent_at: string | null }>();
  if (error) {
    return { ok: false, reason: `Lookup failed: ${error.message}` };
  }
  if (!data) {
    return { ok: false, reason: "Finalized quote not found." };
  }
  if (data.sent_at) {
    return {
      ok: false,
      reason: "This finalized quote was already sent — start a new draft to revise.",
    };
  }
  return { ok: true, row: data };
}

export async function saveFinalizedQuoteDraft(
  formData: FormData,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await requireAdmin();
  const finalizedQuoteId = s(formData.get("finalized_quote_id"));
  if (!finalizedQuoteId) {
    throw new Error("Missing finalized_quote_id.");
  }
  const sb = createServiceRoleClient();
  const loaded = await loadDraftById(sb, finalizedQuoteId);
  if (!loaded.ok) throw new Error(loaded.reason);
  const draft = loaded.row;

  const fields = readFinalizedFields(formData);

  const { error: updateErr } = await sb
    .from("finalized_quotes")
    .update(fields)
    .eq("id", draft.id);

  if (updateErr) {
    throw new Error(`Could not save draft: ${updateErr.message}`);
  }

  await logDispatchEvent(
    sb,
    draft.quote_request_id,
    "finalized_quote_draft_saved",
    {
      finalizedQuoteId: draft.id,
      finalizedQuoteNumber: draft.finalized_quote_number,
      totalAmount: fields.total_amount,
    },
  );

  revalidatePath(`/admin/quotes/${draft.quote_request_id}`);
}

// ─────────────────────────────────────────────────────────────────────────
//  3. Build Preview — save fields + render + persist snapshot.
//
//     Send reads back the saved preview snapshot verbatim, so the bytes
//     Brent reviewed are exactly the bytes the customer receives.
// ─────────────────────────────────────────────────────────────────────────

export type FinalizedQuoteEmailPreview = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

export async function buildFinalizedQuotePreview(
  formData: FormData,
): Promise<FinalizedQuoteEmailPreview> {
  await requireAdmin();
  const finalizedQuoteId = s(formData.get("finalized_quote_id"));
  if (!finalizedQuoteId) {
    throw new Error("Missing finalized_quote_id.");
  }

  const sb = createServiceRoleClient();
  const loaded = await loadDraftById(sb, finalizedQuoteId);
  if (!loaded.ok) throw new Error(loaded.reason);
  const draft = loaded.row;

  const fields = readFinalizedFields(formData);

  if (fields.linehaul === null || fields.linehaul <= 0) {
    throw new Error("Linehaul must be set (and > 0) before building a preview.");
  }
  if (fields.total_amount === null || fields.total_amount <= 0) {
    throw new Error("Pricing produced a non-positive total. Recheck the rate.");
  }

  // Pull lead so we know who the email is going to.
  const { data: lead, error: leadErr } = await sb
    .from("quote_requests")
    .select("id, name, email")
    .eq("id", draft.quote_request_id)
    .maybeSingle<LeadSnapshotRow>();
  if (leadErr) throw new Error(`Lead lookup failed: ${leadErr.message}`);
  if (!lead) throw new Error("Lead not found.");

  // Persist fields BEFORE rendering so the row reflects the form even
  // if rendering throws.
  const { error: updateErr } = await sb
    .from("finalized_quotes")
    .update(fields)
    .eq("id", draft.id);
  if (updateErr) {
    throw new Error(`Could not save fields: ${updateErr.message}`);
  }

  // Phase 2B: pull the row's confirmation_token (auto-generated at row
  // insert via the schema default — see migration 20260529000000) so
  // we can stitch the customer-facing confirm URL into the rendered
  // email. The URL is baked into preview_html at this moment and
  // shipped verbatim at send time, preserving preview/send byte
  // parity.
  const { data: tokenRow } = await sb
    .from("finalized_quotes")
    .select("confirmation_token")
    .eq("id", draft.id)
    .maybeSingle<{ confirmation_token: string | null }>();
  const confirmationToken = tokenRow?.confirmation_token ?? null;

  // Build the renderer payload from the SAVED fields (not the form),
  // so preview-bytes are derived from the row that send will read.
  const payload: FinalizedQuotePayload = {
    to: lead.email,
    customerName: lead.name,
    leadId: lead.id,

    rangeQuoteNumber: `HS-${shortRef(lead.id)}`,
    finalizedQuoteNumber: draft.finalized_quote_number,

    issuedAt: new Date().toISOString().slice(0, 10),
    expirationAt: fields.expiration_at,
    paymentDueAt: fields.payment_due_at,

    pickup: {
      company: fields.pickup_company,
      contactName: fields.pickup_contact_name,
      contactPhone: fields.pickup_contact_phone,
      contactEmail: fields.pickup_contact_email,
      addressLine1: fields.pickup_address_line1,
      addressLine2: fields.pickup_address_line2,
      city: fields.pickup_city,
      state: fields.pickup_state,
      zip: fields.pickup_zip,
      window: fields.pickup_window,
      loadingHours: fields.pickup_loading_hours,
    },
    delivery: {
      company: fields.delivery_company,
      contactName: fields.delivery_contact_name,
      contactPhone: fields.delivery_contact_phone,
      contactEmail: fields.delivery_contact_email,
      addressLine1: fields.delivery_address_line1,
      addressLine2: fields.delivery_address_line2,
      city: fields.delivery_city,
      state: fields.delivery_state,
      zip: fields.delivery_zip,
      window: fields.delivery_window,
      receivingHours: fields.delivery_receiving_hours,
    },
    freight: {
      commodity: fields.commodity,
      lengthIn: fields.length_in,
      widthIn: fields.width_in,
      heightIn: fields.height_in,
      exactWeightLbs: fields.exact_weight_lbs,
      quantity: fields.quantity,
      handlingType: fields.handling_type,
      runningCondition: fields.running_condition,
      securementRequirements: fields.securement_requirements,
    },
    ops: {
      forkliftAvailable: fields.forklift_available,
      driverAssistRequired: fields.driver_assist_required,
      craneRequired: fields.crane_required,
      permitsRequired: fields.permits_required,
      escortRequired: fields.escort_required,
      tarpRequired: fields.tarp_required,
      specialInstructions: fields.special_instructions,
    },
    pricing: {
      linehaul: fields.linehaul,
      fuelSurcharge: fields.fuel_surcharge,
      permitsFee: fields.permits_fee,
      accessorials: fields.accessorials,
      totalAmount: fields.total_amount,
    },
    detentionPolicy: fields.detention_policy,
    tonuPolicy: fields.tonu_policy,
    paymentInstructions: fields.payment_instructions,
    dispatchConfirmationStatement: fields.dispatch_confirmation_statement,
    schedulingStatement: fields.scheduling_statement,
    acceptanceAcknowledgement: fields.acceptance_acknowledgement,

    confirmUrl: confirmationToken ? confirmUrl(confirmationToken) : null,
  };

  const rendered = renderFinalizedQuoteEmail(payload);

  const { error: snapErr } = await sb
    .from("finalized_quotes")
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

  await logDispatchEvent(
    sb,
    draft.quote_request_id,
    "finalized_quote_preview_built",
    {
      finalizedQuoteId: draft.id,
      finalizedQuoteNumber: draft.finalized_quote_number,
      totalAmount: fields.total_amount,
    },
  );

  // NOTE: intentionally NO revalidatePath here — same reason as
  // buildEstimatePreview. Building the preview returns the rendered email to
  // the client modal; a page revalidate mid-edit raced with the Load Details
  // auto-save and wiped freshly-typed stops & addresses. The draft is
  // persisted above; the page refreshes its state on the next nav or on Send.

  return rendered;
}

// ─────────────────────────────────────────────────────────────────────────
//  4. Send — read snapshot, send verbatim, mark sent.
// ─────────────────────────────────────────────────────────────────────────

export async function sendFinalizedQuote(
  finalizedQuoteId: string,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: never send a real finalized quote.
  // Phase INSTR: each stage logs `[sendFinalizedQuote] stage=X failed`
  // before rethrowing so Vercel logs identify the failing step.
  await requireAdmin();
  if (!finalizedQuoteId) {
    console.error("[sendFinalizedQuote] stage=parse_finalized_quote_id failed", {
      stage: "parse_finalized_quote_id",
      errorMessage: "Missing finalized_quote_id.",
    });
    throw new Error("Missing finalized_quote_id.");
  }

  const sb = createServiceRoleClient();

  const { data: draft, error: draftErr } = await sb
    .from("finalized_quotes")
    .select(
      "id, finalized_quote_number, dispatch_estimate_id, quote_request_id, total_amount, preview_subject, preview_preheader, preview_html, preview_text, preview_to, preview_from, preview_reply_to, preview_built_at, sent_at",
    )
    .eq("id", finalizedQuoteId)
    .maybeSingle<
      FinalizedQuoteSendRow & {
        sent_at: string | null;
        quote_request_id: string;
        dispatch_estimate_id: string;
      }
    >();

  if (draftErr) {
    console.error("[sendFinalizedQuote] stage=lookup_draft failed", {
      finalizedQuoteId,
      stage: "lookup_draft",
      errorMessage: draftErr.message,
    });
    throw new Error(`Lookup failed: ${draftErr.message}`);
  }
  if (!draft) {
    console.error("[sendFinalizedQuote] stage=lookup_draft failed (not found)", {
      finalizedQuoteId,
      stage: "lookup_draft",
      errorMessage: "Finalized quote not found.",
    });
    throw new Error("Finalized quote not found.");
  }
  if (draft.sent_at) {
    console.error("[sendFinalizedQuote] stage=guard_already_sent failed", {
      finalizedQuoteId,
      stage: "guard_already_sent",
      errorMessage: "This finalized quote was already sent.",
    });
    throw new Error("This finalized quote was already sent.");
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
    console.error("[sendFinalizedQuote] stage=guard_preview_built failed", {
      finalizedQuoteId,
      stage: "guard_preview_built",
      errorMessage: "Preview hasn't been built yet. Build a preview first.",
    });
    throw new Error("Preview hasn't been built yet. Build a preview first.");
  }

  const result = await sendFinalizedQuoteBytes({
    to: draft.preview_to,
    from: draft.preview_from,
    replyTo: draft.preview_reply_to,
    subject: draft.preview_subject,
    html: draft.preview_html,
    text: draft.preview_text,
  });

  if (!result.ok) {
    console.error("[sendFinalizedQuote] stage=resend_send failed", {
      finalizedQuoteId: draft.id,
      quoteRequestId: draft.quote_request_id,
      stage: "resend_send",
      errorMessage: result.reason,
    });
    await logDispatchEvent(
      sb,
      draft.quote_request_id,
      "finalized_quote_send_failed",
      {
        finalizedQuoteId: draft.id,
        finalizedQuoteNumber: draft.finalized_quote_number,
        reason: result.reason,
        to: draft.preview_to,
      },
    );
    throw new Error(`Could not send finalized quote: ${result.reason}`);
  }

  const sentAt = new Date().toISOString();
  const { error: markErr } = await sb
    .from("finalized_quotes")
    .update({ sent_at: sentAt, sent_email_id: result.emailId })
    .eq("id", draft.id);
  if (markErr) {
    console.error(
      "[sendFinalizedQuote] mark-sent failed after delivery",
      {
        finalizedQuoteId: draft.id,
        message: markErr.message,
      },
    );
  }

  await logDispatchEvent(
    sb,
    draft.quote_request_id,
    "finalized_quote_sent",
    {
      finalizedQuoteId: draft.id,
      finalizedQuoteNumber: draft.finalized_quote_number,
      totalAmount:
        draft.total_amount === null ? null : Number(draft.total_amount),
      emailId: result.emailId,
      to: draft.preview_to,
    },
  );

  // Phase P1B: auto-advance lead status from booked -> awaiting_payment.
  // Mirror of the sendEstimate auto-advance pattern in actions.ts:
  // read current status, only advance from the expected source state,
  // emit status_changed AFTER updating, never throw on side-effect
  // failures (the FQ was sent -- that's what matters).
  const { data: lead, error: leadErr } = await sb
    .from("quote_requests")
    .select("lead_status")
    .eq("id", draft.quote_request_id)
    .maybeSingle<{ lead_status: LeadStatus }>();
  if (leadErr) {
    console.error("[sendFinalizedQuote] lead lookup failed (no status advance)", {
      quoteRequestId: draft.quote_request_id,
      message: leadErr.message,
    });
  } else if (
    lead &&
    // Advance from any pre-payment funnel state. Previously this only fired
    // when the lead was already "booked" — but sending a finalized quote
    // happens while the lead is "awaiting_confirmation", so the status (and
    // the pipeline stage) never moved off "Send finalized".
    ["new", "contacted", "estimate_sent", "awaiting_confirmation", "booked"].includes(
      lead.lead_status,
    )
  ) {
    const previous = lead.lead_status;
    const now = new Date().toISOString();
    const { error: statusErr } = await sb
      .from("quote_requests")
      .update({
        lead_status: "awaiting_payment",
        lead_status_updated_at: now,
      })
      .eq("id", draft.quote_request_id);
    if (statusErr) {
      console.error("[sendFinalizedQuote] status advance failed", {
        quoteRequestId: draft.quote_request_id,
        message: statusErr.message,
      });
    } else {
      await logDispatchEvent(sb, draft.quote_request_id, "status_changed", {
        from: previous,
        to: "awaiting_payment",
      });
    }
  }

  revalidatePath(`/admin/quotes/${draft.quote_request_id}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}

// ─────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Mirror of refNumber() from src/lib/email/shell.ts — last 8 hex chars
 * of the UUID, upper-case, hyphenated. Used to label the "Range quote #"
 * field. We duplicate the helper here rather than importing from shell.ts
 * because that module is email-only; this is a server action.
 */
function shortRef(uuid: string): string {
  const hex = uuid.replace(/-/g, "");
  if (hex.length < 8) return uuid.toUpperCase();
  const tail = hex.slice(-8).toUpperCase();
  return `${tail.slice(0, 4)}-${tail.slice(4)}`;
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
