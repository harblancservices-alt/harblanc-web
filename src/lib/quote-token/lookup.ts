import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Customer-side token lookup for the public Accept / Decline pages.
 *
 * The accept_token is generated per dispatch_estimates row (one token
 * per sent estimate). The customer's email contains URLs of the form
 *   /quote/accept/<token>
 *   /quote/decline/<token>
 * Both pages call resolveByToken() to validate the token, fetch the
 * estimate + related lead context, and optionally load the in-progress
 * intake row for the acceptance flow.
 *
 * Service-role client so the lookup bypasses RLS — the token IS the
 * authentication signal here. Tokens are 32 hex chars from
 * gen_random_uuid() so guessing is impractical.
 */

export type TokenResolveResult =
  | {
      ok: true;
      estimate: {
        id: string;
        quoteRequestId: string;
        acceptToken: string;
        sentAt: string | null;
        acceptedAt: string | null;
        declinedAt: string | null;
        declinedReason: string | null;
        linehaulLow: number | null;
        linehaulHigh: number | null;
        expirationAt: string | null;
        previewSubject: string | null;
      };
      lead: {
        id: string;
        name: string;
        email: string;
        phone: string;
        commodity: string;
        weight: string;
        pickupZip: string | null;
        pickupCity: string | null;
        pickupState: string | null;
        deliveryZip: string | null;
        deliveryCity: string | null;
        deliveryState: string | null;
        pickupDate: string | null;
      };
      intake: ShipmentIntakeRow | null;
    }
  | { ok: false; reason: "not_found" };

export type ShipmentIntakeRow = {
  id: string;
  dispatchEstimateId: string;
  pickupCompany: string | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  pickupContactEmail: string | null;
  pickupAddressLine1: string | null;
  pickupAddressLine2: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  pickupZip: string | null;
  pickupWindow: string | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  deliveryCompany: string | null;
  deliveryContactName: string | null;
  deliveryContactPhone: string | null;
  deliveryContactEmail: string | null;
  deliveryAddressLine1: string | null;
  deliveryAddressLine2: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryZip: string | null;
  deliveryWindow: string | null;
  deliveryWindowStart: string | null;
  deliveryWindowEnd: string | null;
  appointmentStatus: string | null;
  commodityDetails: string | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  exactWeightLbs: number | null;
  loadingResponsibility: string | null;
  unloadingResponsibility: string | null;
  specialRequirements: string | null;
  referenceLinks: string | null;
  notes: string | null;
  status: "in_progress" | "submitted";
  submittedAt: string | null;
};

type RawEstimateRow = {
  id: string;
  quote_request_id: string;
  accept_token: string;
  sent_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  declined_reason: string | null;
  linehaul_low: string | number | null;
  linehaul_high: string | number | null;
  expiration_at: string | null;
  preview_subject: string | null;
};

type RawLeadRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  commodity: string;
  weight: string;
  pickup_zip: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_zip: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  pickup_date: string | null;
  deleted_at: string | null;
};

type RawIntakeRow = {
  id: string;
  dispatch_estimate_id: string;
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
  pickup_window_start: string | null;
  pickup_window_end: string | null;
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
  delivery_window_start: string | null;
  delivery_window_end: string | null;
  appointment_status: string | null;
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
  status: "in_progress" | "submitted";
  submitted_at: string | null;
};

function toNum(v: string | number | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIntake(row: RawIntakeRow): ShipmentIntakeRow {
  return {
    id: row.id,
    dispatchEstimateId: row.dispatch_estimate_id,
    pickupCompany: row.pickup_company,
    pickupContactName: row.pickup_contact_name,
    pickupContactPhone: row.pickup_contact_phone,
    pickupContactEmail: row.pickup_contact_email,
    pickupAddressLine1: row.pickup_address_line1,
    pickupAddressLine2: row.pickup_address_line2,
    pickupCity: row.pickup_city,
    pickupState: row.pickup_state,
    pickupZip: row.pickup_zip,
    pickupWindow: row.pickup_window,
    pickupWindowStart: row.pickup_window_start,
    pickupWindowEnd: row.pickup_window_end,
    deliveryCompany: row.delivery_company,
    deliveryContactName: row.delivery_contact_name,
    deliveryContactPhone: row.delivery_contact_phone,
    deliveryContactEmail: row.delivery_contact_email,
    deliveryAddressLine1: row.delivery_address_line1,
    deliveryAddressLine2: row.delivery_address_line2,
    deliveryCity: row.delivery_city,
    deliveryState: row.delivery_state,
    deliveryZip: row.delivery_zip,
    deliveryWindow: row.delivery_window,
    deliveryWindowStart: row.delivery_window_start,
    deliveryWindowEnd: row.delivery_window_end,
    appointmentStatus: row.appointment_status,
    commodityDetails: row.commodity_details,
    lengthIn: toNum(row.length_in),
    widthIn: toNum(row.width_in),
    heightIn: toNum(row.height_in),
    exactWeightLbs: toNum(row.exact_weight_lbs),
    loadingResponsibility: row.loading_responsibility,
    unloadingResponsibility: row.unloading_responsibility,
    specialRequirements: row.special_requirements,
    referenceLinks: row.reference_links,
    notes: row.notes,
    status: row.status,
    submittedAt: row.submitted_at,
  };
}

export async function resolveByToken(
  token: string,
): Promise<TokenResolveResult> {
  if (!token || token.length < 16 || token.length > 64) {
    return { ok: false, reason: "not_found" };
  }
  const sb = createServiceRoleClient();

  const { data: estimate } = await sb
    .from("dispatch_estimates")
    .select(
      "id, quote_request_id, accept_token, sent_at, accepted_at, declined_at, declined_reason, linehaul_low, linehaul_high, expiration_at, preview_subject",
    )
    .eq("accept_token", token)
    .maybeSingle<RawEstimateRow>();

  if (!estimate) return { ok: false, reason: "not_found" };

  const { data: lead } = await sb
    .from("quote_requests")
    .select(
      "id, name, email, phone, commodity, weight, pickup_zip, pickup_city, pickup_state, delivery_zip, delivery_city, delivery_state, pickup_date, deleted_at",
    )
    .eq("id", estimate.quote_request_id)
    .maybeSingle<RawLeadRow>();

  // If the lead is gone (permanent delete cascaded the estimate too;
  // if we're here the estimate still exists, so the lead should also
  // exist — defensively check anyway) or the lead is trashed, treat
  // it as a dead link.
  if (!lead || lead.deleted_at) {
    return { ok: false, reason: "not_found" };
  }

  const { data: intakeRow } = await sb
    .from("shipment_intake")
    .select(
      "id, dispatch_estimate_id, pickup_company, pickup_contact_name, pickup_contact_phone, pickup_contact_email, pickup_address_line1, pickup_address_line2, pickup_city, pickup_state, pickup_zip, pickup_window, pickup_window_start, pickup_window_end, delivery_company, delivery_contact_name, delivery_contact_phone, delivery_contact_email, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_zip, delivery_window, delivery_window_start, delivery_window_end, appointment_status, commodity_details, length_in, width_in, height_in, exact_weight_lbs, loading_responsibility, unloading_responsibility, special_requirements, reference_links, notes, status, submitted_at",
    )
    .eq("dispatch_estimate_id", estimate.id)
    .maybeSingle<RawIntakeRow>();

  return {
    ok: true,
    estimate: {
      id: estimate.id,
      quoteRequestId: estimate.quote_request_id,
      acceptToken: estimate.accept_token,
      sentAt: estimate.sent_at,
      acceptedAt: estimate.accepted_at,
      declinedAt: estimate.declined_at,
      declinedReason: estimate.declined_reason,
      linehaulLow: toNum(estimate.linehaul_low),
      linehaulHigh: toNum(estimate.linehaul_high),
      expirationAt: estimate.expiration_at,
      previewSubject: estimate.preview_subject,
    },
    lead: {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      commodity: lead.commodity,
      weight: lead.weight,
      pickupZip: lead.pickup_zip,
      pickupCity: lead.pickup_city,
      pickupState: lead.pickup_state,
      deliveryZip: lead.delivery_zip,
      deliveryCity: lead.delivery_city,
      deliveryState: lead.delivery_state,
      pickupDate: lead.pickup_date,
    },
    intake: intakeRow ? toIntake(intakeRow) : null,
  };
}

// ─── Finalized-quote confirmation token lookup ───────────────────────────
//
// Phase 2B — the customer's email Confirm button lands at
// /quote/confirm/[token]. The token is finalized_quotes.confirmation_token,
// auto-generated at row insert by the schema default in migration
// 20260529000000_finalized_quotes.sql (32 hex chars, hyphens stripped).
// This lookup is separate from resolveByToken (which resolves
// dispatch_estimates.accept_token) — the two token systems are
// independent on purpose so confirmation links can't be confused with
// estimate-accept links.

export type FinalizedQuoteConfirmRow = {
  id: string;
  quoteRequestId: string;
  finalizedQuoteNumber: string;
  confirmationToken: string;
  confirmedAt: string | null;
  sentAt: string | null;
  expirationAt: string | null;
  totalAmount: number | null;
};

export type FinalizedQuoteConfirmResult =
  | {
      ok: true;
      finalizedQuote: FinalizedQuoteConfirmRow;
      lead: {
        id: string;
        name: string;
        email: string;
        pickupZip: string | null;
        pickupCity: string | null;
        pickupState: string | null;
        deliveryZip: string | null;
        deliveryCity: string | null;
        deliveryState: string | null;
      };
    }
  | { ok: false; reason: "not_found" | "not_sent" };

type RawFqConfirmRow = {
  id: string;
  quote_request_id: string;
  finalized_quote_number: string;
  confirmation_token: string;
  confirmed_at: string | null;
  sent_at: string | null;
  expiration_at: string | null;
  total_amount: string | number | null;
};

export async function resolveByConfirmationToken(
  token: string,
): Promise<FinalizedQuoteConfirmResult> {
  if (!token || token.length < 16 || token.length > 64) {
    return { ok: false, reason: "not_found" };
  }
  const sb = createServiceRoleClient();

  const { data: fq } = await sb
    .from("finalized_quotes")
    .select(
      "id, quote_request_id, finalized_quote_number, confirmation_token, confirmed_at, sent_at, expiration_at, total_amount",
    )
    .eq("confirmation_token", token)
    .maybeSingle<RawFqConfirmRow>();

  if (!fq) return { ok: false, reason: "not_found" };

  // Only sent FQs can be confirmed. A draft (sent_at null) means the
  // email was never sent, so the customer shouldn't be on this page.
  // Defensive — under normal flow the token only escapes the building
  // when an email is actually sent.
  if (!fq.sent_at) return { ok: false, reason: "not_sent" };

  const { data: lead } = await sb
    .from("quote_requests")
    .select(
      "id, name, email, pickup_zip, pickup_city, pickup_state, delivery_zip, delivery_city, delivery_state, deleted_at",
    )
    .eq("id", fq.quote_request_id)
    .maybeSingle<{
      id: string;
      name: string;
      email: string;
      pickup_zip: string | null;
      pickup_city: string | null;
      pickup_state: string | null;
      delivery_zip: string | null;
      delivery_city: string | null;
      delivery_state: string | null;
      deleted_at: string | null;
    }>();

  if (!lead || lead.deleted_at) {
    return { ok: false, reason: "not_found" };
  }

  return {
    ok: true,
    finalizedQuote: {
      id: fq.id,
      quoteRequestId: fq.quote_request_id,
      finalizedQuoteNumber: fq.finalized_quote_number,
      confirmationToken: fq.confirmation_token,
      confirmedAt: fq.confirmed_at,
      sentAt: fq.sent_at,
      expirationAt: fq.expiration_at,
      totalAmount: toNum(fq.total_amount),
    },
    lead: {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      pickupZip: lead.pickup_zip,
      pickupCity: lead.pickup_city,
      pickupState: lead.pickup_state,
      deliveryZip: lead.delivery_zip,
      deliveryCity: lead.delivery_city,
      deliveryState: lead.delivery_state,
    },
  };
}
