/**
 * Read helpers for the in-progress draft rows behind Phase 5B's revenue
 * composers (dispatch_estimates / finalized_quotes / bills_of_lading).
 * Column lists mirror V1's own `src/app/admin/(authed)/quotes/[id]/page.tsx`
 * (FINALIZED_QUOTE_COLUMNS/BOL_COLUMNS/the estimate `cols` constant) so a
 * tms-v2 composer edit never silently nulls a field V1's own edit screen
 * would have preserved. Not routed through the shared DataSource — these
 * tables sit outside its entity set, same reasoning as lib/data/pipeline.ts.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";

export type EstimateDraft = {
  linehaulLow: number | null;
  linehaulHigh: number | null;
  milesEstimate: number | null;
  pickupTimingNotes: string | null;
  equipmentNotes: string | null;
  dispatchNotes: string | null;
  expirationAt: string | null;
  closingLine: string | null;
  fuelSurcharge: number | null;
  paymentTerms: string | null;
  specialInstructions: string | null;
};

const ESTIMATE_DRAFT_COLS =
  "linehaul_low, linehaul_high, miles_estimate, pickup_timing_notes, equipment_notes, dispatch_notes, expiration_at, closing_line, fuel_surcharge, payment_terms, special_instructions";

function num(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** The lead's open (unsent) estimate draft, or null if none exists yet —
 * saveDraftEstimate/buildEstimatePreview create one on first save. */
export async function getEstimateDraft(quoteRequestId: string): Promise<EstimateDraft | null> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("dispatch_estimates")
    .select(ESTIMATE_DRAFT_COLS)
    .eq("quote_request_id", quoteRequestId)
    .is("sent_at", null)
    .maybeSingle<{
      linehaul_low: number | string | null;
      linehaul_high: number | string | null;
      miles_estimate: number | string | null;
      pickup_timing_notes: string | null;
      equipment_notes: string | null;
      dispatch_notes: string | null;
      expiration_at: string | null;
      closing_line: string | null;
      fuel_surcharge: number | string | null;
      payment_terms: string | null;
      special_instructions: string | null;
    }>();
  if (!data) return null;
  return {
    linehaulLow: num(data.linehaul_low),
    linehaulHigh: num(data.linehaul_high),
    milesEstimate: num(data.miles_estimate),
    pickupTimingNotes: data.pickup_timing_notes,
    equipmentNotes: data.equipment_notes,
    dispatchNotes: data.dispatch_notes,
    expirationAt: data.expiration_at,
    closingLine: data.closing_line,
    fuelSurcharge: num(data.fuel_surcharge),
    paymentTerms: data.payment_terms,
    specialInstructions: data.special_instructions,
  };
}

export type FinalizedQuoteDraft = {
  id: string;
  finalizedQuoteNumber: string;
  expirationAt: string | null;
  paymentDueAt: string | null;
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
  pickupLoadingHours: string | null;
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
  deliveryReceivingHours: string | null;
  commodity: string | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  exactWeightLbs: number | null;
  quantity: number | null;
  handlingType: string | null;
  runningCondition: string | null;
  securementRequirements: string | null;
  forkliftAvailable: boolean | null;
  driverAssistRequired: boolean | null;
  craneRequired: boolean | null;
  permitsRequired: boolean | null;
  escortRequired: boolean | null;
  tarpRequired: boolean | null;
  specialInstructions: string | null;
  linehaul: number | null;
  fuelSurcharge: number | null;
  permitsFee: number | null;
  totalAmount: number | null;
};

const FINALIZED_QUOTE_DRAFT_COLS =
  "id, finalized_quote_number, expiration_at, payment_due_at, pickup_company, pickup_contact_name, pickup_contact_phone, pickup_contact_email, pickup_address_line1, pickup_address_line2, pickup_city, pickup_state, pickup_zip, pickup_window, pickup_loading_hours, delivery_company, delivery_contact_name, delivery_contact_phone, delivery_contact_email, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_zip, delivery_window, delivery_receiving_hours, commodity, length_in, width_in, height_in, exact_weight_lbs, quantity, handling_type, running_condition, securement_requirements, forklift_available, driver_assist_required, crane_required, permits_required, escort_required, tarp_required, special_instructions, linehaul, fuel_surcharge, permits_fee, total_amount";

/** A finalized-quote draft by id (the id generateFinalizedQuoteDraft
 * returns) — every field the composer form can edit, prefilled from the
 * shipment intake V1's generate step already copied in. */
export async function getFinalizedQuoteDraftById(id: string): Promise<FinalizedQuoteDraft | null> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("finalized_quotes")
    .select(FINALIZED_QUOTE_DRAFT_COLS)
    .eq("id", id)
    .maybeSingle<Record<string, string | number | boolean | null>>();
  if (!data) return null;
  return {
    id: String(data.id),
    finalizedQuoteNumber: String(data.finalized_quote_number ?? ""),
    expirationAt: data.expiration_at as string | null,
    paymentDueAt: data.payment_due_at as string | null,
    pickupCompany: data.pickup_company as string | null,
    pickupContactName: data.pickup_contact_name as string | null,
    pickupContactPhone: data.pickup_contact_phone as string | null,
    pickupContactEmail: data.pickup_contact_email as string | null,
    pickupAddressLine1: data.pickup_address_line1 as string | null,
    pickupAddressLine2: data.pickup_address_line2 as string | null,
    pickupCity: data.pickup_city as string | null,
    pickupState: data.pickup_state as string | null,
    pickupZip: data.pickup_zip as string | null,
    pickupWindow: data.pickup_window as string | null,
    pickupLoadingHours: data.pickup_loading_hours as string | null,
    deliveryCompany: data.delivery_company as string | null,
    deliveryContactName: data.delivery_contact_name as string | null,
    deliveryContactPhone: data.delivery_contact_phone as string | null,
    deliveryContactEmail: data.delivery_contact_email as string | null,
    deliveryAddressLine1: data.delivery_address_line1 as string | null,
    deliveryAddressLine2: data.delivery_address_line2 as string | null,
    deliveryCity: data.delivery_city as string | null,
    deliveryState: data.delivery_state as string | null,
    deliveryZip: data.delivery_zip as string | null,
    deliveryWindow: data.delivery_window as string | null,
    deliveryReceivingHours: data.delivery_receiving_hours as string | null,
    commodity: data.commodity as string | null,
    lengthIn: num(data.length_in as string | number | null),
    widthIn: num(data.width_in as string | number | null),
    heightIn: num(data.height_in as string | number | null),
    exactWeightLbs: num(data.exact_weight_lbs as string | number | null),
    quantity: num(data.quantity as string | number | null),
    handlingType: data.handling_type as string | null,
    runningCondition: data.running_condition as string | null,
    securementRequirements: data.securement_requirements as string | null,
    forkliftAvailable: data.forklift_available as boolean | null,
    driverAssistRequired: data.driver_assist_required as boolean | null,
    craneRequired: data.crane_required as boolean | null,
    permitsRequired: data.permits_required as boolean | null,
    escortRequired: data.escort_required as boolean | null,
    tarpRequired: data.tarp_required as boolean | null,
    specialInstructions: data.special_instructions as string | null,
    linehaul: num(data.linehaul as string | number | null),
    fuelSurcharge: num(data.fuel_surcharge as string | number | null),
    permitsFee: num(data.permits_fee as string | number | null),
    totalAmount: num(data.total_amount as string | number | null),
  };
}

/** The lead's most recently created open (unsent) finalized-quote draft
 * id, if one exists — lets the Operations detail page resume an
 * in-progress composer instead of always starting from Generate. */
export async function getOpenFinalizedQuoteDraftId(quoteRequestId: string): Promise<string | null> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("finalized_quotes")
    .select("id")
    .eq("quote_request_id", quoteRequestId)
    .is("sent_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

export type BolDraft = {
  id: string;
  bolNumber: string;
  dispatchReference: string | null;
  issueDate: string | null;
  shipperCompany: string | null;
  shipperContactName: string | null;
  shipperContactPhone: string | null;
  shipperContactEmail: string | null;
  shipperAddressLine1: string | null;
  shipperAddressLine2: string | null;
  shipperCity: string | null;
  shipperState: string | null;
  shipperZip: string | null;
  pickupWindow: string | null;
  pickupInstructions: string | null;
  consigneeCompany: string | null;
  consigneeContactName: string | null;
  consigneeContactPhone: string | null;
  consigneeContactEmail: string | null;
  consigneeAddressLine1: string | null;
  consigneeAddressLine2: string | null;
  consigneeCity: string | null;
  consigneeState: string | null;
  consigneeZip: string | null;
  deliveryWindow: string | null;
  deliveryInstructions: string | null;
  commodity: string | null;
  quantity: number | null;
  handlingUnitsType: string | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  weightLbs: number | null;
  nmfcCode: string | null;
  freightClass: string | null;
  hazmat: boolean;
  specialHandling: string | null;
  driverAssistRequired: boolean;
  tarpRequired: boolean;
  permitsRequired: boolean;
  escortRequired: boolean;
  riggingRequired: boolean;
  appointmentRequired: boolean;
  specialInstructions: string | null;
  dispatchNotes: string | null;
};

const BOL_DRAFT_COLS =
  "id, bol_number, dispatch_reference, issue_date, shipper_company, shipper_contact_name, shipper_contact_phone, shipper_contact_email, shipper_address_line1, shipper_address_line2, shipper_city, shipper_state, shipper_zip, pickup_window, pickup_instructions, consignee_company, consignee_contact_name, consignee_contact_phone, consignee_contact_email, consignee_address_line1, consignee_address_line2, consignee_city, consignee_state, consignee_zip, delivery_window, delivery_instructions, commodity, quantity, handling_units_type, length_in, width_in, height_in, weight_lbs, nmfc_code, freight_class, hazmat, special_handling, driver_assist_required, tarp_required, permits_required, escort_required, rigging_required, appointment_required, special_instructions, dispatch_notes";

export async function getBolDraftById(id: string): Promise<BolDraft | null> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("bills_of_lading")
    .select(BOL_DRAFT_COLS)
    .eq("id", id)
    .maybeSingle<Record<string, string | number | boolean | null>>();
  if (!data) return null;
  return {
    id: String(data.id),
    bolNumber: String(data.bol_number ?? ""),
    dispatchReference: data.dispatch_reference as string | null,
    issueDate: data.issue_date as string | null,
    shipperCompany: data.shipper_company as string | null,
    shipperContactName: data.shipper_contact_name as string | null,
    shipperContactPhone: data.shipper_contact_phone as string | null,
    shipperContactEmail: data.shipper_contact_email as string | null,
    shipperAddressLine1: data.shipper_address_line1 as string | null,
    shipperAddressLine2: data.shipper_address_line2 as string | null,
    shipperCity: data.shipper_city as string | null,
    shipperState: data.shipper_state as string | null,
    shipperZip: data.shipper_zip as string | null,
    pickupWindow: data.pickup_window as string | null,
    pickupInstructions: data.pickup_instructions as string | null,
    consigneeCompany: data.consignee_company as string | null,
    consigneeContactName: data.consignee_contact_name as string | null,
    consigneeContactPhone: data.consignee_contact_phone as string | null,
    consigneeContactEmail: data.consignee_contact_email as string | null,
    consigneeAddressLine1: data.consignee_address_line1 as string | null,
    consigneeAddressLine2: data.consignee_address_line2 as string | null,
    consigneeCity: data.consignee_city as string | null,
    consigneeState: data.consignee_state as string | null,
    consigneeZip: data.consignee_zip as string | null,
    deliveryWindow: data.delivery_window as string | null,
    deliveryInstructions: data.delivery_instructions as string | null,
    commodity: data.commodity as string | null,
    quantity: num(data.quantity as string | number | null),
    handlingUnitsType: data.handling_units_type as string | null,
    lengthIn: num(data.length_in as string | number | null),
    widthIn: num(data.width_in as string | number | null),
    heightIn: num(data.height_in as string | number | null),
    weightLbs: num(data.weight_lbs as string | number | null),
    nmfcCode: data.nmfc_code as string | null,
    freightClass: data.freight_class as string | null,
    hazmat: !!data.hazmat,
    specialHandling: data.special_handling as string | null,
    driverAssistRequired: !!data.driver_assist_required,
    tarpRequired: !!data.tarp_required,
    permitsRequired: !!data.permits_required,
    escortRequired: !!data.escort_required,
    riggingRequired: !!data.rigging_required,
    appointmentRequired: !!data.appointment_required,
    specialInstructions: data.special_instructions as string | null,
    dispatchNotes: data.dispatch_notes as string | null,
  };
}

/** The lead's most recently created open (unsent) BOL draft id, if one
 * exists — resumes an in-progress composer. */
export async function getOpenBolDraftId(quoteRequestId: string): Promise<string | null> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("bills_of_lading")
    .select("id")
    .eq("quote_request_id", quoteRequestId)
    .is("sent_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}
