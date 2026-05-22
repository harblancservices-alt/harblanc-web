import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatDateFull, relativeTime } from "@/lib/admin/format";
import { estimateLaneMiles } from "@/lib/dispatch/distance";
import {
  softDeleteQuote,
  restoreQuote,
  permanentlyDeleteQuote,
} from "../actions";
import { QuoteDetailTabs, type QuoteDetailRow } from "./QuoteDetailTabs";
import type { GeneratedQuoteSummary } from "./GeneratedQuotePreview";
import type { EstimateDraft } from "./EstimateComposer";
import type { SentEstimateRow } from "./SentEstimatesList";
import type { DispatchEvent } from "./CommTimeline";
import type {
  FinalizedQuoteDraft,
  FinalizedQuoteAccessorial,
} from "./FinalizedQuoteComposer";
import type { FinalizedQuoteWorkflowState } from "./FinalizedQuoteSection";
import type { SentFinalizedQuoteRow } from "./SentFinalizedQuotesList";
import type { BolDraft } from "./BillOfLadingComposer";
import type { BolWorkflowState } from "./BillOfLadingSection";
import type { SentBolRow } from "./SentBolsList";
import type { SubmittedIntakeData } from "./SubmittedIntakePanel";
import type { DispatchOwnership } from "./DispatchOwnershipPanel";

export const metadata: Metadata = {
  title: "Quote detail",
  robots: { index: false, follow: false },
};

const QUOTES_BUCKET = "quotes";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type GeneratedQuoteRow = {
  id: string;
  quote_number: string;
  issued_at: string;
  expires_at: string | null;
  total_amount: string | number | null;
  prepared_by: string | null;
  payment_terms: string | null;
  pdf_storage_path: string | null;
};

type DispatchEstimateRow = {
  id: string;
  linehaul_low: string | number | null;
  linehaul_high: string | number | null;
  miles_estimate: number | null;
  pickup_timing_notes: string | null;
  equipment_notes: string | null;
  dispatch_notes: string | null;
  expiration_at: string | null;
  closing_line: string | null;
  sent_at: string | null;
  sent_email_id: string | null;
  preview_subject: string | null;
  preview_preheader: string | null;
  preview_html: string | null;
  preview_to: string | null;
  preview_from: string | null;
  preview_reply_to: string | null;
  preview_built_at: string | null;
};

function toEstimateDraft(row: DispatchEstimateRow | null): EstimateDraft | null {
  if (!row) return null;
  const preview =
    row.preview_built_at &&
    row.preview_subject &&
    row.preview_html &&
    row.preview_to &&
    row.preview_from &&
    row.preview_reply_to
      ? {
          subject: row.preview_subject,
          preheader: row.preview_preheader ?? "",
          html: row.preview_html,
          to: row.preview_to,
          from: row.preview_from,
          replyTo: row.preview_reply_to,
          builtAt: row.preview_built_at,
        }
      : null;
  return {
    id: row.id,
    linehaulLow: row.linehaul_low === null ? null : Number(row.linehaul_low),
    linehaulHigh: row.linehaul_high === null ? null : Number(row.linehaul_high),
    milesEstimate: row.miles_estimate,
    pickupTimingNotes: row.pickup_timing_notes,
    equipmentNotes: row.equipment_notes,
    dispatchNotes: row.dispatch_notes,
    expirationAt: row.expiration_at,
    closingLine: row.closing_line,
    sentAt: row.sent_at,
    sentEmailId: row.sent_email_id,
    preview,
  };
}

type SentEstimateDbRow = {
  id: string;
  sent_at: string;
  sent_email_id: string | null;
  linehaul_low: string | number | null;
  linehaul_high: string | number | null;
  preview_subject: string | null;
  preview_preheader: string | null;
  preview_html: string | null;
  preview_to: string | null;
  preview_from: string | null;
  preview_reply_to: string | null;
};

function toSentEstimateRow(row: SentEstimateDbRow): SentEstimateRow {
  return {
    id: row.id,
    sentAt: row.sent_at,
    sentEmailId: row.sent_email_id,
    linehaulLow: row.linehaul_low === null ? null : Number(row.linehaul_low),
    linehaulHigh: row.linehaul_high === null ? null : Number(row.linehaul_high),
    subject: row.preview_subject ?? "(no subject recorded)",
    preheader: row.preview_preheader ?? "",
    html: row.preview_html ?? "",
    to: row.preview_to ?? "",
    from: row.preview_from ?? "",
    replyTo: row.preview_reply_to ?? "",
  };
}

function shortRef(uuid: string): string {
  const hex = uuid.replace(/-/g, "");
  if (hex.length < 8) return uuid.toUpperCase();
  const tail = hex.slice(-8).toUpperCase();
  return `${tail.slice(0, 4)}-${tail.slice(4)}`;
}

function toNum(v: string | number | null): number | null {
  if (v == null) return null;
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : null;
}

type FinalizedQuoteRow = {
  id: string;
  finalized_quote_number: string;
  dispatch_estimate_id: string;
  quote_request_id: string;
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
  sent_email_id: string | null;
};

function readAccessorials(raw: unknown): FinalizedQuoteAccessorial[] {
  if (!Array.isArray(raw)) return [];
  const out: FinalizedQuoteAccessorial[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && "label" in item && "amount" in item) {
      const label = String((item as { label: unknown }).label ?? "");
      const amount = Number((item as { amount: unknown }).amount);
      if (label && Number.isFinite(amount)) {
        out.push({ label, amount });
      }
    }
  }
  return out;
}

function toFinalizedQuoteDraft(row: FinalizedQuoteRow, leadId: string): FinalizedQuoteDraft {
  return {
    id: row.id,
    finalizedQuoteNumber: row.finalized_quote_number,
    rangeQuoteNumberLabel: `HS-${shortRef(leadId)}`,
    dispatchEstimateId: row.dispatch_estimate_id,
    issueDate: row.issue_date,
    expirationAt: row.expiration_at,
    paymentDueAt: row.payment_due_at,
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
    pickupLoadingHours: row.pickup_loading_hours,
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
    deliveryReceivingHours: row.delivery_receiving_hours,
    commodity: row.commodity,
    lengthIn: toNum(row.length_in),
    widthIn: toNum(row.width_in),
    heightIn: toNum(row.height_in),
    exactWeightLbs: toNum(row.exact_weight_lbs),
    quantity: row.quantity,
    handlingType: row.handling_type,
    runningCondition: row.running_condition,
    securementRequirements: row.securement_requirements,
    forkliftAvailable: row.forklift_available,
    driverAssistRequired: row.driver_assist_required,
    craneRequired: row.crane_required,
    permitsRequired: row.permits_required,
    escortRequired: row.escort_required,
    tarpRequired: row.tarp_required,
    specialInstructions: row.special_instructions,
    linehaul: toNum(row.linehaul),
    fuelSurcharge: toNum(row.fuel_surcharge),
    permitsFee: toNum(row.permits_fee),
    accessorials: readAccessorials(row.accessorials),
    totalAmount: toNum(row.total_amount),
    detentionPolicy: row.detention_policy,
    tonuPolicy: row.tonu_policy,
    paymentInstructions: row.payment_instructions,
    dispatchConfirmationStatement: row.dispatch_confirmation_statement,
    schedulingStatement: row.scheduling_statement,
    acceptanceAcknowledgement: row.acceptance_acknowledgement,
    sentAt: row.sent_at,
    sentEmailId: row.sent_email_id,
    preview:
      row.preview_built_at &&
      row.preview_subject &&
      row.preview_html &&
      row.preview_to &&
      row.preview_from &&
      row.preview_reply_to
        ? {
            subject: row.preview_subject,
            preheader: row.preview_preheader ?? "",
            html: row.preview_html,
            to: row.preview_to,
            from: row.preview_from,
            replyTo: row.preview_reply_to,
            builtAt: row.preview_built_at,
          }
        : null,
  };
}

function toSentFinalizedQuoteRow(row: FinalizedQuoteRow): SentFinalizedQuoteRow {
  return {
    id: row.id,
    finalizedQuoteNumber: row.finalized_quote_number,
    sentAt: row.sent_at ?? "",
    sentEmailId: row.sent_email_id,
    totalAmount: toNum(row.total_amount),
    subject: row.preview_subject ?? "(no subject recorded)",
    preheader: row.preview_preheader ?? "",
    html: row.preview_html ?? "",
    to: row.preview_to ?? "",
    from: row.preview_from ?? "",
    replyTo: row.preview_reply_to ?? "",
  };
}

type BolRow = {
  id: string;
  bol_number: string;
  finalized_quote_id: string;
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
  preview_subject: string | null;
  preview_preheader: string | null;
  preview_html: string | null;
  preview_text: string | null;
  preview_to: string | null;
  preview_from: string | null;
  preview_reply_to: string | null;
  preview_built_at: string | null;
  sent_at: string | null;
  sent_email_id: string | null;
};

function toBolDraft(
  row: BolRow,
  leadId: string,
  finalizedQuoteNumberLabel: string | null,
): BolDraft {
  return {
    id: row.id,
    bolNumber: row.bol_number,
    finalizedQuoteId: row.finalized_quote_id,
    finalizedQuoteNumberLabel,
    rangeQuoteNumberLabel: `HS-${shortRef(leadId)}`,
    dispatchReference: row.dispatch_reference,
    issueDate: row.issue_date,
    shipperCompany: row.shipper_company,
    shipperContactName: row.shipper_contact_name,
    shipperContactPhone: row.shipper_contact_phone,
    shipperContactEmail: row.shipper_contact_email,
    shipperAddressLine1: row.shipper_address_line1,
    shipperAddressLine2: row.shipper_address_line2,
    shipperCity: row.shipper_city,
    shipperState: row.shipper_state,
    shipperZip: row.shipper_zip,
    pickupWindow: row.pickup_window,
    pickupInstructions: row.pickup_instructions,
    consigneeCompany: row.consignee_company,
    consigneeContactName: row.consignee_contact_name,
    consigneeContactPhone: row.consignee_contact_phone,
    consigneeContactEmail: row.consignee_contact_email,
    consigneeAddressLine1: row.consignee_address_line1,
    consigneeAddressLine2: row.consignee_address_line2,
    consigneeCity: row.consignee_city,
    consigneeState: row.consignee_state,
    consigneeZip: row.consignee_zip,
    deliveryWindow: row.delivery_window,
    deliveryInstructions: row.delivery_instructions,
    commodity: row.commodity,
    quantity: row.quantity,
    handlingUnitsType: row.handling_units_type,
    lengthIn: toNum(row.length_in),
    widthIn: toNum(row.width_in),
    heightIn: toNum(row.height_in),
    weightLbs: toNum(row.weight_lbs),
    nmfcCode: row.nmfc_code,
    freightClass: row.freight_class,
    hazmat: row.hazmat,
    specialHandling: row.special_handling,
    driverAssistRequired: row.driver_assist_required,
    tarpRequired: row.tarp_required,
    permitsRequired: row.permits_required,
    escortRequired: row.escort_required,
    riggingRequired: row.rigging_required,
    appointmentRequired: row.appointment_required,
    specialInstructions: row.special_instructions,
    dispatchNotes: row.dispatch_notes,
    sentAt: row.sent_at,
    sentEmailId: row.sent_email_id,
    preview:
      row.preview_built_at &&
      row.preview_subject &&
      row.preview_html &&
      row.preview_to &&
      row.preview_from &&
      row.preview_reply_to
        ? {
            subject: row.preview_subject,
            preheader: row.preview_preheader ?? "",
            html: row.preview_html,
            to: row.preview_to,
            from: row.preview_from,
            replyTo: row.preview_reply_to,
            builtAt: row.preview_built_at,
          }
        : null,
  };
}

function toSentBolRow(row: BolRow): SentBolRow {
  return {
    id: row.id,
    bolNumber: row.bol_number,
    sentAt: row.sent_at ?? "",
    sentEmailId: row.sent_email_id,
    subject: row.preview_subject ?? "(no subject recorded)",
    preheader: row.preview_preheader ?? "",
    html: row.preview_html ?? "",
    to: row.preview_to ?? "",
    from: row.preview_from ?? "",
    replyTo: row.preview_reply_to ?? "",
  };
}

type SubmittedIntakeRow = {
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

function toSubmittedIntake(row: SubmittedIntakeRow): SubmittedIntakeData | null {
  if (row.status !== "submitted" || !row.submitted_at) return null;
  return {
    id: row.id,
    submittedAt: row.submitted_at,
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
  };
}

async function loadDetail(id: string): Promise<{
  row: QuoteDetailRow;
  generatedQuote: GeneratedQuoteSummary | null;
  signedPdfUrl: string | null;
  draftEstimate: EstimateDraft | null;
  sentEstimates: SentEstimateRow[];
  events: DispatchEvent[];
  computedMiles: number | null;
  finalizedQuoteState: FinalizedQuoteWorkflowState;
  sentFinalizedQuotes: SentFinalizedQuoteRow[];
  bolState: BolWorkflowState;
  sentBols: SentBolRow[];
  submittedIntake: SubmittedIntakeData | null;
  ownership: DispatchOwnership;
} | null> {
  const sb = createServiceRoleClient();

  const { data: row } = await sb
    .from("quote_requests")
    .select(
      "id, created_at, name, email, phone, commodity, weight, notes, pickup_zip, delivery_zip, pickup_date, lead_status, lead_status_updated_at, user_agent, ip, deleted_at, delete_after, assigned_dispatcher, assigned_carrier, assigned_truck, trailer_type",
    )
    .eq("id", id)
    .maybeSingle<QuoteDetailRow>();
  if (!row) return null;

  const [
    { data: rawGenerated },
    { data: draftEstimateRow },
    { data: sentEstimateRows },
    { data: eventRows },
  ] = await Promise.all([
    sb
      .from("generated_quotes")
      .select(
        "id, quote_number, issued_at, expires_at, total_amount, prepared_by, payment_terms, pdf_storage_path",
      )
      .eq("quote_request_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<GeneratedQuoteRow>(),
    sb
      .from("dispatch_estimates")
      .select(
        "id, linehaul_low, linehaul_high, miles_estimate, pickup_timing_notes, equipment_notes, dispatch_notes, expiration_at, closing_line, sent_at, sent_email_id, preview_subject, preview_preheader, preview_html, preview_to, preview_from, preview_reply_to, preview_built_at",
      )
      .eq("quote_request_id", id)
      .is("sent_at", null)
      .maybeSingle<DispatchEstimateRow>(),
    sb
      .from("dispatch_estimates")
      .select(
        "id, sent_at, sent_email_id, linehaul_low, linehaul_high, preview_subject, preview_preheader, preview_html, preview_to, preview_from, preview_reply_to",
      )
      .eq("quote_request_id", id)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .returns<SentEstimateDbRow[]>(),
    sb
      .from("dispatch_events")
      .select("id, kind, payload, created_at")
      .eq("quote_request_id", id)
      .order("created_at", { ascending: false })
      .returns<DispatchEvent[]>(),
  ]);

  let generatedQuote: GeneratedQuoteSummary | null = null;
  let signedPdfUrl: string | null = null;

  if (rawGenerated) {
    generatedQuote = {
      id: rawGenerated.id,
      quoteNumber: rawGenerated.quote_number,
      issuedAt: rawGenerated.issued_at,
      expiresAt: rawGenerated.expires_at,
      totalAmount:
        rawGenerated.total_amount === null
          ? null
          : Number(rawGenerated.total_amount),
      preparedBy: rawGenerated.prepared_by,
      paymentTerms: rawGenerated.payment_terms,
    };

    if (rawGenerated.pdf_storage_path) {
      const { data: signed } = await sb.storage
        .from(QUOTES_BUCKET)
        .createSignedUrl(rawGenerated.pdf_storage_path, SIGNED_URL_TTL_SECONDS);
      signedPdfUrl = signed?.signedUrl ?? null;
    }
  }

  let computedMiles: number | null = null;
  if (row.pickup_zip && row.delivery_zip) {
    const r = estimateLaneMiles(row.pickup_zip, row.delivery_zip);
    if (r.ok) computedMiles = r.miles;
  }

  const finalizedQuoteState = await loadFinalizedQuoteState(sb, id);
  const sentFinalizedQuotes = await loadSentFinalizedQuotes(sb, id);
  const bolState = await loadBolState(sb, id);
  const sentBols = await loadSentBols(sb, id);
  const submittedIntake = await loadSubmittedIntake(sb, id);

  const ownership: DispatchOwnership = {
    assignedDispatcher: row.assigned_dispatcher,
    assignedCarrier: row.assigned_carrier,
    assignedTruck: row.assigned_truck,
    trailerType: row.trailer_type,
  };

  return {
    row,
    generatedQuote,
    signedPdfUrl,
    draftEstimate: toEstimateDraft(draftEstimateRow ?? null),
    sentEstimates: (sentEstimateRows ?? []).map(toSentEstimateRow),
    events: eventRows ?? [],
    computedMiles,
    finalizedQuoteState,
    sentFinalizedQuotes,
    bolState,
    sentBols,
    submittedIntake,
    ownership,
  };
}

async function loadFinalizedQuoteState(
  sb: ReturnType<typeof createServiceRoleClient>,
  quoteRequestId: string,
): Promise<FinalizedQuoteWorkflowState> {
  const { data: latestSent } = await sb
    .from("dispatch_estimates")
    .select("id, sent_at")
    .eq("quote_request_id", quoteRequestId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; sent_at: string | null }>();

  if (!latestSent) {
    return { kind: "no_estimate_sent" };
  }

  const { data: intake } = await sb
    .from("shipment_intake")
    .select("status, submitted_at")
    .eq("dispatch_estimate_id", latestSent.id)
    .maybeSingle<{
      status: "in_progress" | "submitted";
      submitted_at: string | null;
    }>();

  if (!intake) {
    return { kind: "no_intake" };
  }
  if (intake.status !== "submitted" || !intake.submitted_at) {
    return { kind: "intake_in_progress" };
  }

  const { data: draftRow } = await sb
    .from("finalized_quotes")
    .select(
      "id, finalized_quote_number, dispatch_estimate_id, quote_request_id, issue_date, expiration_at, payment_due_at, pickup_company, pickup_contact_name, pickup_contact_phone, pickup_contact_email, pickup_address_line1, pickup_address_line2, pickup_city, pickup_state, pickup_zip, pickup_window, pickup_loading_hours, delivery_company, delivery_contact_name, delivery_contact_phone, delivery_contact_email, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_zip, delivery_window, delivery_receiving_hours, commodity, length_in, width_in, height_in, exact_weight_lbs, quantity, handling_type, running_condition, securement_requirements, forklift_available, driver_assist_required, crane_required, permits_required, escort_required, tarp_required, special_instructions, linehaul, fuel_surcharge, permits_fee, accessorials, total_amount, detention_policy, tonu_policy, payment_instructions, dispatch_confirmation_statement, scheduling_statement, acceptance_acknowledgement, preview_subject, preview_preheader, preview_html, preview_text, preview_to, preview_from, preview_reply_to, preview_built_at, sent_at, sent_email_id",
    )
    .eq("dispatch_estimate_id", latestSent.id)
    .is("sent_at", null)
    .maybeSingle<FinalizedQuoteRow>();

  if (draftRow) {
    return {
      kind: "draft",
      draft: toFinalizedQuoteDraft(draftRow, quoteRequestId),
      intakeSubmittedAt: intake.submitted_at,
    };
  }

  return {
    kind: "intake_submitted_no_draft",
    submittedAt: intake.submitted_at,
  };
}

async function loadSentFinalizedQuotes(
  sb: ReturnType<typeof createServiceRoleClient>,
  quoteRequestId: string,
): Promise<SentFinalizedQuoteRow[]> {
  const { data: rows } = await sb
    .from("finalized_quotes")
    .select(
      "id, finalized_quote_number, dispatch_estimate_id, quote_request_id, issue_date, expiration_at, payment_due_at, pickup_company, pickup_contact_name, pickup_contact_phone, pickup_contact_email, pickup_address_line1, pickup_address_line2, pickup_city, pickup_state, pickup_zip, pickup_window, pickup_loading_hours, delivery_company, delivery_contact_name, delivery_contact_phone, delivery_contact_email, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_zip, delivery_window, delivery_receiving_hours, commodity, length_in, width_in, height_in, exact_weight_lbs, quantity, handling_type, running_condition, securement_requirements, forklift_available, driver_assist_required, crane_required, permits_required, escort_required, tarp_required, special_instructions, linehaul, fuel_surcharge, permits_fee, accessorials, total_amount, detention_policy, tonu_policy, payment_instructions, dispatch_confirmation_statement, scheduling_statement, acceptance_acknowledgement, preview_subject, preview_preheader, preview_html, preview_text, preview_to, preview_from, preview_reply_to, preview_built_at, sent_at, sent_email_id",
    )
    .eq("quote_request_id", quoteRequestId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .returns<FinalizedQuoteRow[]>();

  return (rows ?? []).map(toSentFinalizedQuoteRow);
}

async function loadBolState(
  sb: ReturnType<typeof createServiceRoleClient>,
  quoteRequestId: string,
): Promise<BolWorkflowState> {
  const { data: latestFq } = await sb
    .from("finalized_quotes")
    .select("id, finalized_quote_number, sent_at")
    .eq("quote_request_id", quoteRequestId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      finalized_quote_number: string;
      sent_at: string | null;
    }>();

  if (!latestFq || !latestFq.sent_at) {
    return { kind: "no_finalized_quote_sent" };
  }

  const { data: draftRow } = await sb
    .from("bills_of_lading")
    .select(
      "id, bol_number, finalized_quote_id, dispatch_reference, issue_date, shipper_company, shipper_contact_name, shipper_contact_phone, shipper_contact_email, shipper_address_line1, shipper_address_line2, shipper_city, shipper_state, shipper_zip, pickup_window, pickup_instructions, consignee_company, consignee_contact_name, consignee_contact_phone, consignee_contact_email, consignee_address_line1, consignee_address_line2, consignee_city, consignee_state, consignee_zip, delivery_window, delivery_instructions, commodity, quantity, handling_units_type, length_in, width_in, height_in, weight_lbs, nmfc_code, freight_class, hazmat, special_handling, driver_assist_required, tarp_required, permits_required, escort_required, rigging_required, appointment_required, special_instructions, dispatch_notes, preview_subject, preview_preheader, preview_html, preview_text, preview_to, preview_from, preview_reply_to, preview_built_at, sent_at, sent_email_id",
    )
    .eq("finalized_quote_id", latestFq.id)
    .is("sent_at", null)
    .maybeSingle<BolRow>();

  if (draftRow) {
    return {
      kind: "draft",
      draft: toBolDraft(draftRow, quoteRequestId, latestFq.finalized_quote_number),
      finalizedQuoteSentAt: latestFq.sent_at,
    };
  }

  return {
    kind: "finalized_quote_sent_no_draft",
    finalizedQuoteSentAt: latestFq.sent_at,
  };
}

async function loadSentBols(
  sb: ReturnType<typeof createServiceRoleClient>,
  quoteRequestId: string,
): Promise<SentBolRow[]> {
  const { data: rows } = await sb
    .from("bills_of_lading")
    .select(
      "id, bol_number, finalized_quote_id, dispatch_reference, issue_date, shipper_company, shipper_contact_name, shipper_contact_phone, shipper_contact_email, shipper_address_line1, shipper_address_line2, shipper_city, shipper_state, shipper_zip, pickup_window, pickup_instructions, consignee_company, consignee_contact_name, consignee_contact_phone, consignee_contact_email, consignee_address_line1, consignee_address_line2, consignee_city, consignee_state, consignee_zip, delivery_window, delivery_instructions, commodity, quantity, handling_units_type, length_in, width_in, height_in, weight_lbs, nmfc_code, freight_class, hazmat, special_handling, driver_assist_required, tarp_required, permits_required, escort_required, rigging_required, appointment_required, special_instructions, dispatch_notes, preview_subject, preview_preheader, preview_html, preview_text, preview_to, preview_from, preview_reply_to, preview_built_at, sent_at, sent_email_id",
    )
    .eq("quote_request_id", quoteRequestId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .returns<BolRow[]>();

  return (rows ?? []).map(toSentBolRow);
}

async function loadSubmittedIntake(
  sb: ReturnType<typeof createServiceRoleClient>,
  quoteRequestId: string,
): Promise<SubmittedIntakeData | null> {
  const { data: estimateRows } = await sb
    .from("dispatch_estimates")
    .select("id")
    .eq("quote_request_id", quoteRequestId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .returns<{ id: string }[]>();

  const estimateIds = (estimateRows ?? []).map((r) => r.id);
  if (estimateIds.length === 0) return null;

  const { data: intakeRow } = await sb
    .from("shipment_intake")
    .select(
      "id, status, submitted_at, pickup_company, pickup_contact_name, pickup_contact_phone, pickup_contact_email, pickup_address_line1, pickup_address_line2, pickup_city, pickup_state, pickup_zip, pickup_window, delivery_company, delivery_contact_name, delivery_contact_phone, delivery_contact_email, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_zip, delivery_window, commodity_details, length_in, width_in, height_in, exact_weight_lbs, loading_responsibility, unloading_responsibility, special_requirements, reference_links, notes",
    )
    .in("dispatch_estimate_id", estimateIds)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle<SubmittedIntakeRow>();

  return intakeRow ? toSubmittedIntake(intakeRow) : null;
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await loadDetail(id);
  if (!detail) notFound();
  const {
    row,
    generatedQuote,
    signedPdfUrl,
    draftEstimate,
    sentEstimates,
    events,
    computedMiles,
    finalizedQuoteState,
    sentFinalizedQuotes,
    bolState,
    sentBols,
    submittedIntake,
    ownership,
  } = detail;

  const isTrashed = Boolean(row.deleted_at);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <Link
        href={isTrashed ? "/admin/quotes/trash" : "/admin/quotes"}
        className="inline-flex items-center font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase transition-colors hover:text-white"
      >
        &larr; Back to {isTrashed ? "trash" : "quotes"}
      </Link>

      {isTrashed ? (
        <div className="mt-5 flex items-start gap-3 border border-red-700/60 bg-red-950/30 p-4">
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600"
          />
          <div>
            <p className="font-mono text-[10px] tracking-[0.22em] text-red-400 uppercase">
              In trash
            </p>
            <p className="mt-1 text-sm leading-relaxed text-red-200">
              Moved to trash {relativeTime(row.deleted_at!)}.{" "}
              {row.delete_after ? (
                <>
                  Auto-purge on{" "}
                  <span className="font-mono text-red-100">
                    {formatDateFull(row.delete_after)}
                  </span>
                  .
                </>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}

      <QuoteDetailTabs
        row={row}
        generatedQuote={generatedQuote}
        signedPdfUrl={signedPdfUrl}
        draftEstimate={draftEstimate}
        sentEstimates={sentEstimates}
        events={events}
        computedMiles={computedMiles}
        finalizedQuoteState={finalizedQuoteState}
        sentFinalizedQuotes={sentFinalizedQuotes}
        bolState={bolState}
        sentBols={sentBols}
        submittedIntake={submittedIntake}
        ownership={ownership}
      />

      <section className="mt-6 border border-neutral-800 border-t-2 border-t-red-600 bg-neutral-900 p-5 sm:mt-8 sm:p-6">
        <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
          Actions
        </h2>
        <div
          className={
            "mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center " +
            (isTrashed ? "sm:justify-between" : "")
          }
        >
          {isTrashed ? (
            <>
              <form action={restoreQuote.bind(null, row.id)}>
                <button
                  type="submit"
                  className="btn-outline-cut inline-flex w-full items-center justify-center px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors sm:w-auto"
                >
                  Restore
                </button>
              </form>
              <form action={permanentlyDeleteQuote.bind(null, row.id)}>
                <button
                  type="submit"
                  className="btn-cut inline-flex w-full items-center justify-center bg-red-600 px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 sm:w-auto"
                >
                  Permanently delete
                </button>
              </form>
            </>
          ) : (
            <form action={softDeleteQuote.bind(null, row.id)}>
              <button
                type="submit"
                className="btn-outline-cut inline-flex w-full items-center justify-center px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors sm:w-auto"
              >
                Move to trash
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
