import type { AcknowledgementPayload, EstimatePayload } from "@/lib/email/render";
import type { FinalizedQuotePayload } from "@/lib/email/finalized-quote";
import type { BolPayload } from "@/lib/email/bill-of-lading";
import type { IntakeFormDefaults } from "@/app/quote/accept/[token]/IntakeForm";

/**
 * Shared sample payloads for the Admin Preview Lab.
 *
 * Every payload is hand-crafted to match the EXACT type signature of the
 * corresponding renderer, so the Preview Lab can call the real render
 * functions (renderAcknowledgementEmail, renderEstimateEmail,
 * renderFinalizedQuoteEmail, renderBolEmail) without any branching or
 * stubbed-out fields. What you see in the Preview Lab is what the
 * customer would see if the same payload reached Resend at send time.
 *
 * Sample identity: Brent Harbaugh — HARBLANC SERVICES LLC's owner-operator
 * — so the previews read naturally if someone forwards one as a screenshot.
 * The lead UUID is a stable fake; refNumber() reads its last 8 hex chars,
 * which renders as HS-A4F2-9B1C across every document.
 *
 * NONE of these constants reach the database, Resend, or storage. They are
 * imported only by the Preview Lab pages and the preview-route shell.
 */

// ─── Stable identifiers ──────────────────────────────────────────────────
//
// Format chosen so refNumber()'s last-8-hex slice yields A4F29B1C →
// "A4F2-9B1C" on every document.

const SAMPLE_LEAD_ID = "00000000-0000-0000-0000-0000a4f29b1c";

const SAMPLE_CUSTOMER = {
  name: "Brent Harbaugh",
  email: "brent@example-shipper.com",
  phone: "(303) 555-0118",
};

const SAMPLE_LANE = {
  pickupZip: "80216",
  deliveryZip: "75201",
  pickupCity: "Denver",
  pickupState: "CO",
  deliveryCity: "Dallas",
  deliveryState: "TX",
  miles: 783,
};

const SAMPLE_FREIGHT = {
  commodity: "CNC vertical machining center",
  weight: "12,400 lbs",
  pickupDate: "2026-06-09",
  deliveryWindow: "2026-06-11",
  lengthIn: 96,
  widthIn: 60,
  heightIn: 86,
  exactWeightLbs: 12400,
  pieces: 1,
};

// ─── 1. Request Acknowledged ─────────────────────────────────────────────

export const SAMPLE_ACKNOWLEDGEMENT_PAYLOAD: AcknowledgementPayload = {
  to: SAMPLE_CUSTOMER.email,
  name: SAMPLE_CUSTOMER.name,
  pickupZip: SAMPLE_LANE.pickupZip,
  deliveryZip: SAMPLE_LANE.deliveryZip,
  commodity: SAMPLE_FREIGHT.commodity,
  weight: SAMPLE_FREIGHT.weight,
  pickupDate: SAMPLE_FREIGHT.pickupDate,
  leadId: SAMPLE_LEAD_ID,
};

// ─── 2. Quote Range / Estimate ──────────────────────────────────────────

export const SAMPLE_ESTIMATE_PAYLOAD: EstimatePayload = {
  to: SAMPLE_CUSTOMER.email,
  name: SAMPLE_CUSTOMER.name,
  lane: {
    pickupZip: SAMPLE_LANE.pickupZip,
    deliveryZip: SAMPLE_LANE.deliveryZip,
  },
  load: {
    commodity: SAMPLE_FREIGHT.commodity,
    weight: SAMPLE_FREIGHT.weight,
    pickup: SAMPLE_FREIGHT.pickupDate,
  },
  rate: { low: 2850, high: 3150 },
  miles: SAMPLE_LANE.miles,
  pickupTimingNotes:
    "Pickup window Mon 6/9 0800–1200. Receiver flexible through Thu 6/11.",
  equipmentNotes:
    "Step-deck preferred. Tarping not required — covered facility on both ends.",
  closingLine:
    "Reply to confirm the range or call dispatch direct. Capacity holds 48 hours.",
  expirationAt: "2026-06-12",
  leadId: SAMPLE_LEAD_ID,
  fuelSurcharge: 175,
  accessorials: [
    { label: "Loading dock assistance", amount: 75 },
  ],
  // Tokens are issued at send time. Preview omits them so the email body
  // shows without an Accept / Decline action band — same posture as
  // Build Preview from the Quote Range workspace.
  acceptUrl: null,
  declineUrl: null,
};

// ─── 3. Finalized Quote / Rate Confirmation ─────────────────────────────

export const SAMPLE_FINALIZED_QUOTE_PAYLOAD: FinalizedQuotePayload = {
  to: SAMPLE_CUSTOMER.email,
  customerName: SAMPLE_CUSTOMER.name,
  leadId: SAMPLE_LEAD_ID,

  rangeQuoteNumber: "HS-A4F2-9B1C",
  finalizedQuoteNumber: "RC-2026-0042",

  issuedAt: "2026-06-04",
  expirationAt: "2026-06-09",
  paymentDueAt: "2026-06-07",

  pickup: {
    company: "Rocky Mountain Machine Works",
    contactName: "Dale Renner",
    contactPhone: "(303) 555-0144",
    contactEmail: "dale@rmmw.example",
    addressLine1: "4820 Brighton Blvd",
    addressLine2: "Bay 7",
    city: SAMPLE_LANE.pickupCity,
    state: SAMPLE_LANE.pickupState,
    zip: SAMPLE_LANE.pickupZip,
    window: "Mon 6/9 · 0800–1200",
    loadingHours: "Mon–Fri 0700–1500",
  },

  delivery: {
    company: "Lone Star Manufacturing",
    contactName: "Marisol Tovar",
    contactPhone: "(214) 555-0192",
    contactEmail: "mtovar@lonestar.example",
    addressLine1: "2700 Stemmons Fwy",
    addressLine2: null,
    city: SAMPLE_LANE.deliveryCity,
    state: SAMPLE_LANE.deliveryState,
    zip: SAMPLE_LANE.deliveryZip,
    window: "Wed 6/11 · 1300–1700",
    receivingHours: "Mon–Fri 0700–1530",
  },

  freight: {
    commodity: SAMPLE_FREIGHT.commodity,
    lengthIn: SAMPLE_FREIGHT.lengthIn,
    widthIn: SAMPLE_FREIGHT.widthIn,
    heightIn: SAMPLE_FREIGHT.heightIn,
    exactWeightLbs: SAMPLE_FREIGHT.exactWeightLbs,
    quantity: SAMPLE_FREIGHT.pieces,
    handlingType: "Skidded",
    runningCondition: "N/A",
    securementRequirements: "4-point strap, edge protection at corners.",
  },

  ops: {
    forkliftAvailable: true,
    driverAssistRequired: false,
    craneRequired: false,
    permitsRequired: false,
    escortRequired: false,
    tarpRequired: false,
    specialInstructions:
      "Shipper loads, driver secures. Receiver provides forklift at delivery.",
  },

  pricing: {
    linehaul: 2950,
    fuelSurcharge: 175,
    permitsFee: null,
    accessorials: [{ label: "Loading dock assistance", amount: 75 }],
    totalAmount: 3200,
  },

  detentionPolicy: null,
  tonuPolicy: null,
  paymentInstructions: null,
  dispatchConfirmationStatement: null,
  schedulingStatement: null,
  acceptanceAcknowledgement: null,

  // Phase 2B: stable sample confirmation URL so the Preview Lab tile
  // renders the Confirm Finalized Quote action band at the bottom of
  // the email body. Token is the literal "sample-token-32hex" — it is
  // NOT a real confirmation_token and clicking the button in the
  // Preview Lab iframe would land on /quote/confirm/sample-token-32hex
  // which `resolveByConfirmationToken` would reject as not_found.
  // Visual fidelity only; preview/send parity is preserved because
  // real sends derive their URL from the actual row's confirmation_token
  // inside buildFinalizedQuotePreview.
  confirmUrl:
    "https://www.harblancservices.com/quote/confirm/sample-token-32hex",
};

// ─── 4. Bill of Lading ─────────────────────────────────────────────────

export const SAMPLE_BOL_PAYLOAD: BolPayload = {
  to: SAMPLE_CUSTOMER.email,
  recipientName: SAMPLE_CUSTOMER.name,

  bolNumber: "BOL-2026-0042",
  dispatchReference: "HS-A4F2-9B1C",
  rangeQuoteNumber: "HS-A4F2-9B1C",
  finalizedQuoteNumber: "RC-2026-0042",
  issueDate: "2026-06-04",

  shipper: {
    company: "Rocky Mountain Machine Works",
    contactName: "Dale Renner",
    contactPhone: "(303) 555-0144",
    contactEmail: "dale@rmmw.example",
    addressLine1: "4820 Brighton Blvd",
    addressLine2: "Bay 7",
    city: SAMPLE_LANE.pickupCity,
    state: SAMPLE_LANE.pickupState,
    zip: SAMPLE_LANE.pickupZip,
    pickupWindow: "Mon 6/9 · 0800–1200",
    pickupInstructions:
      "Check in at the south guard shack. Photo ID required.",
  },

  consignee: {
    company: "Lone Star Manufacturing",
    contactName: "Marisol Tovar",
    contactPhone: "(214) 555-0192",
    contactEmail: "mtovar@lonestar.example",
    addressLine1: "2700 Stemmons Fwy",
    addressLine2: null,
    city: SAMPLE_LANE.deliveryCity,
    state: SAMPLE_LANE.deliveryState,
    zip: SAMPLE_LANE.deliveryZip,
    deliveryWindow: "Wed 6/11 · 1300–1700",
    deliveryInstructions:
      "Dock #4. Call Marisol 30 min prior. Bobtail-only after 1530.",
  },

  freight: {
    commodity: SAMPLE_FREIGHT.commodity,
    quantity: SAMPLE_FREIGHT.pieces,
    handlingUnitsType: "Skids",
    lengthIn: SAMPLE_FREIGHT.lengthIn,
    widthIn: SAMPLE_FREIGHT.widthIn,
    heightIn: SAMPLE_FREIGHT.heightIn,
    weightLbs: SAMPLE_FREIGHT.exactWeightLbs,
    nmfcCode: "133300-04",
    freightClass: "85",
    hazmat: false,
    specialHandling:
      "Do not stack. This side up. 4-point strap, edge protection at corners.",
  },

  ops: {
    driverAssistRequired: false,
    tarpRequired: false,
    permitsRequired: false,
    escortRequired: false,
    riggingRequired: false,
    appointmentRequired: true,
    specialInstructions:
      "Shipper loads, driver secures. Receiver provides forklift at delivery.",
  },

  dispatchNotes:
    "Driver: confirm pickup ETA the night before. Photo of seal at both ends.",
  preparedBy: "Harblanc Dispatch",
};

// ─── Confirm Shipment Details preview shell ─────────────────────────────
//
// Header values rendered above the IntakeForm on the customer page.

export const SAMPLE_INTAKE_HEADER = {
  rateLow: 2850,
  rateHigh: 3150,
  pickupZip: SAMPLE_LANE.pickupZip,
  pickupCity: SAMPLE_LANE.pickupCity,
  pickupState: SAMPLE_LANE.pickupState,
  deliveryZip: SAMPLE_LANE.deliveryZip,
  deliveryCity: SAMPLE_LANE.deliveryCity,
  deliveryState: SAMPLE_LANE.deliveryState,
  expirationAt: "2026-06-12",
};

// IntakeFormDefaults sample. Status is "new" for the preview so the form
// renders in its editable state. Tokens are not consumed by the preview
// because the form is wrapped in <fieldset disabled> — no server actions
// fire.

export const SAMPLE_INTAKE_DEFAULTS: IntakeFormDefaults = {
  pickupCompany: "Rocky Mountain Machine Works",
  pickupContactName: "Dale Renner",
  pickupContactPhone: "(303) 555-0144",
  pickupContactEmail: "dale@rmmw.example",
  pickupAddressLine1: "4820 Brighton Blvd",
  pickupAddressLine2: "Bay 7",
  pickupCity: SAMPLE_LANE.pickupCity,
  pickupState: SAMPLE_LANE.pickupState,
  pickupZip: SAMPLE_LANE.pickupZip,
  pickupWindowStart: SAMPLE_FREIGHT.pickupDate,
  deliveryCompany: "Lone Star Manufacturing",
  deliveryContactName: "Marisol Tovar",
  deliveryContactPhone: "(214) 555-0192",
  deliveryContactEmail: "mtovar@lonestar.example",
  deliveryAddressLine1: "2700 Stemmons Fwy",
  deliveryAddressLine2: "",
  deliveryCity: SAMPLE_LANE.deliveryCity,
  deliveryState: SAMPLE_LANE.deliveryState,
  deliveryZip: SAMPLE_LANE.deliveryZip,
  pickupWindowEnd: "",
  deliveryWindowStart: SAMPLE_FREIGHT.deliveryWindow,
  deliveryWindowEnd: "",
  appointmentStatus: "appointment_needed",
  commodityDetails:
    "CNC vertical machining center, palletized on heavy-duty skid. Crated head, accessories in two side crates.",
  lengthIn: String(SAMPLE_FREIGHT.lengthIn),
  widthIn: String(SAMPLE_FREIGHT.widthIn),
  heightIn: String(SAMPLE_FREIGHT.heightIn),
  exactWeightLbs: String(SAMPLE_FREIGHT.exactWeightLbs),
  loadingResponsibility: "shipper_forklift",
  unloadingResponsibility: "receiver_forklift",
  specialRequirements:
    "4-point strap, edge protection at corners. Heat-treated wood skid.",
  referenceLinks: "",
  notes: "Receiver flexible through Thu 6/11 if pickup slips.",
};

// ─── Finalized Quote Confirm preview shell ──────────────────────────────
//
// Header/summary values rendered on the customer-facing rate confirmation
// page at /quote/confirm/[token]. Two states are previewed: PENDING (no
// confirmedAt — Confirm button visible) and CONFIRMED (confirmedAt set —
// success state). Reuses SAMPLE_LANE so the lane reads consistently with
// every other preview in the Lab.

export const SAMPLE_FINALIZED_QUOTE_CONFIRM = {
  finalizedQuoteNumber: "RC-2026-0042",
  totalAmount: 3050,
  expirationAt: "2026-06-09",
  // PENDING state — null mirrors the production row before the customer
  // has clicked Confirm. The preview keeps this null so the page renders
  // the Confirm button (which the preview shell disables via fieldset).
  confirmedAtPending: null as string | null,
  // CONFIRMED state — ISO timestamp that round-trips through
  // formatHumanDateTime on the customer page. Frozen 2026-06-04 1542
  // local so visual QA is deterministic.
  confirmedAtConfirmed: "2026-06-04T20:42:00.000Z",
  pickupCity: SAMPLE_LANE.pickupCity,
  pickupState: SAMPLE_LANE.pickupState,
  pickupZip: SAMPLE_LANE.pickupZip,
  deliveryCity: SAMPLE_LANE.deliveryCity,
  deliveryState: SAMPLE_LANE.deliveryState,
  deliveryZip: SAMPLE_LANE.deliveryZip,
};
