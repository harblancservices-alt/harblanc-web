import { Resend } from "resend";
import { company } from "@/lib/company";
import { renderEmailShell, refNumber, escapeHtml } from "./shell";

/**
 * Finalized Quote / Rate Confirmation — email renderer + delivery wrapper.
 *
 * This is the SECOND document class in the workflow, distinct from the
 * Range Proposal (src/lib/email/render.ts → renderEstimateEmail).
 *
 *   Range Proposal     → conversational, rough pricing, lane viability
 *   Finalized Quote    → formal, exact pricing, operationally dense,
 *                        contract-adjacent (THIS FILE)
 *   Bill of Lading     → shipment execution paperwork (future, separate)
 *
 * The visual system is reused — the masthead, regulatory band, dispatch
 * packet strip, typography stack — but the body grammar is more formal:
 *   - "Doc" is "Rate confirmation" in the packet strip
 *   - Tone in copy is operational, not conversational
 *   - Rate band shows EXACT totals, not a range
 *   - Closing language reads as a contract acknowledgement, not a
 *     follow-up question
 *
 * The band-grammar helpers below are intentionally duplicated from
 * render.ts rather than shared. The estimate email is design-locked and
 * any refactor that touched both renderers would risk visual drift —
 * each renderer owns its own helpers, paying the duplication cost on
 * purpose.
 */

// ─────────────────────────────────────────────────────────────────────────
//  Typography / spacing tokens — mirror render.ts deliberately.
// ─────────────────────────────────────────────────────────────────────────

const SANS =
  "'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO_FEATURES =
  "font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0";

const SECTION_PADDING_X = 20;
const SECTION_PADDING_Y_TOP = 8;
const SECTION_PADDING_Y_BOTTOM = 8;

const HAIRLINE = `<tr><td style="padding:0;background:#e5e5e5;font-size:1px;line-height:1px">&nbsp;</td></tr>`;

// ─────────────────────────────────────────────────────────────────────────
//  Band grammar — section header, label/value table, invoice-style rate
//  summary, white / black band wrappers. Identical surface to render.ts
//  by design (preserves visual parity with the estimate while keeping
//  the renderers decoupled).
// ─────────────────────────────────────────────────────────────────────────

function sectionHeader(title: string, inverted = false): string {
  const titleColor = inverted ? "#fafafa" : "#0a0a0a";
  const ruleColor = inverted ? "#3f3f46" : "#d4d4d8";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin:0 0 10px">
    <tr>
      <td style="border-top:1px solid ${ruleColor};font-size:1px;line-height:1px;width:30%">&nbsp;</td>
      <td style="padding:0 12px;white-space:nowrap;font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.22em;color:${titleColor};text-transform:uppercase;font-weight:700;text-align:center;vertical-align:middle">${escapeHtml(title)}</td>
      <td style="border-top:1px solid ${ruleColor};font-size:1px;line-height:1px;width:30%">&nbsp;</td>
    </tr>
  </table>`;
}

function fieldTable(
  rows: ReadonlyArray<{ label: string; value: string }>,
  opts: { inverted?: boolean } = {},
): string {
  const inverted = opts.inverted ?? false;
  const labelColor = inverted ? "#fafafa" : "#3f3f46";
  const valueColor = inverted ? "#ffffff" : "#0a0a0a";

  const body = rows
    .map(({ label, value }) => {
      const valueStyle = `padding:2px 0;font-size:15px;color:${valueColor};font-weight:500`;
      return `<tr>
        <td style="padding:2px 14px 2px 0;font-family:${SANS};${MONO_FEATURES};font-size:10px;color:${labelColor};text-transform:uppercase;letter-spacing:0.18em;white-space:nowrap;font-weight:700;vertical-align:top;width:140px">${escapeHtml(label)}</td>
        <td style="${valueStyle};vertical-align:top">${value}</td>
      </tr>`;
    })
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${body}</table>`;
}

type RateRow = {
  label: string;
  amount: string;
  emphasize?: boolean;
};

function rateSummaryTable(
  rows: ReadonlyArray<RateRow | { rule: true }>,
  opts: { inverted: boolean },
): string {
  const labelColor = opts.inverted ? "#d4d4d8" : "#3f3f46";
  const emphasizeLabelColor = opts.inverted ? "#ffffff" : "#0a0a0a";
  const amountColor = opts.inverted ? "#ffffff" : "#0a0a0a";
  const ruleColor = opts.inverted ? "#404040" : "#d4d4d8";

  const body = rows
    .map((row) => {
      if ("rule" in row) {
        return `<tr><td colspan="2" style="padding:8px 0 0">
          <div style="border-top:1px solid ${ruleColor};height:1px;font-size:1px;line-height:1px">&nbsp;</div>
        </td></tr>`;
      }
      const isTotal = !!row.emphasize;
      const labelStyle = isTotal
        ? `padding:4px 0 2px;font-family:${SANS};${MONO_FEATURES};font-size:10px;color:${emphasizeLabelColor};text-transform:uppercase;letter-spacing:0.18em;font-weight:700;vertical-align:middle`
        : `padding:3px 0;font-family:${SANS};font-size:14px;color:${labelColor};font-weight:500;vertical-align:middle`;
      const amountStyle = isTotal
        ? `padding:4px 0 2px;font-family:${SANS};${MONO_FEATURES};font-size:17px;color:${amountColor};font-weight:700;text-align:right;vertical-align:middle`
        : `padding:3px 0;font-family:${SANS};${MONO_FEATURES};font-size:14px;color:${amountColor};font-weight:500;text-align:right;vertical-align:middle`;
      return `<tr>
        <td style="${labelStyle}">${escapeHtml(row.label)}</td>
        <td style="${amountStyle}">${escapeHtml(row.amount)}</td>
      </tr>`;
    })
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">${body}</table>`;
}

function bandWhite(inner: string): string {
  return `<tr>
    <td style="padding:${SECTION_PADDING_Y_TOP}px ${SECTION_PADDING_X}px ${SECTION_PADDING_Y_BOTTOM}px;background:#ffffff">
      ${inner}
    </td>
  </tr>`;
}

function bandBlack(inner: string): string {
  return `<tr>
    <td style="padding:${SECTION_PADDING_Y_TOP}px ${SECTION_PADDING_X}px ${SECTION_PADDING_Y_BOTTOM}px;background:#0a0a0a">
      ${inner}
    </td>
  </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────
//  Small formatters
// ─────────────────────────────────────────────────────────────────────────

function firstName(full: string): string {
  const first = full.trim().split(/\s+/)[0] ?? "";
  const f = first || full.trim();
  return f.length > 0 ? f.charAt(0).toUpperCase() + f.slice(1) : f;
}

function resolveFrom(): string {
  return (
    process.env.RESEND_FROM_ADDRESS ??
    "Harblanc Dispatch <onboarding@resend.dev>"
  );
}

function resolveReplyTo(): string {
  return process.env.DISPATCH_EMAIL ?? company.dispatchEmail;
}

function formatHumanDate(d: Date): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatHumanDateString(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Accept YYYY-MM-DD or full ISO; both round-trip through Date.
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatHumanDate(d);
}

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function joinAddress(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => !!p && p.trim().length > 0).join(", ");
}

function yesNo(v: boolean | null | undefined): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

// ─────────────────────────────────────────────────────────────────────────
//  Payload shape — everything the renderer needs to produce the email.
//  Plain values (not DB rows) so the renderer is a pure function of its
//  input and the same payload renders identical bytes in preview + send.
// ─────────────────────────────────────────────────────────────────────────

export type FinalizedQuoteAccessorial = {
  label: string;
  amount: number;
};

export type FinalizedQuotePayload = {
  // Routing
  to: string;
  customerName: string;
  leadId: string;

  // Identifiers
  rangeQuoteNumber: string;            // HS-2026-0042 style (lead's quote #)
  finalizedQuoteNumber: string;        // RC-2026-0042 style

  // Dates (YYYY-MM-DD or ISO)
  issuedAt: string;
  expirationAt: string | null;
  paymentDueAt: string | null;

  // Pickup
  pickup: {
    company: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    window: string | null;
    loadingHours: string | null;
  };

  // Delivery
  delivery: {
    company: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    window: string | null;
    receivingHours: string | null;
  };

  // Freight
  freight: {
    commodity: string | null;
    lengthIn: number | null;
    widthIn: number | null;
    heightIn: number | null;
    exactWeightLbs: number | null;
    quantity: number | null;
    handlingType: string | null;
    runningCondition: string | null;
    securementRequirements: string | null;
  };

  // Operational requirements
  ops: {
    forkliftAvailable: boolean | null;
    driverAssistRequired: boolean | null;
    craneRequired: boolean | null;
    permitsRequired: boolean | null;
    escortRequired: boolean | null;
    tarpRequired: boolean | null;
    specialInstructions: string | null;
  };

  // Pricing — exact amounts (NOT range).
  pricing: {
    linehaul: number;                  // required, must be > 0
    fuelSurcharge: number | null;
    permitsFee: number | null;
    accessorials: ReadonlyArray<FinalizedQuoteAccessorial>;
    totalAmount: number;               // computed by caller
  };

  // Policies / agreement language
  detentionPolicy: string | null;
  tonuPolicy: string | null;
  paymentInstructions: string | null;
  dispatchConfirmationStatement: string | null;
  schedulingStatement: string | null;
  acceptanceAcknowledgement: string | null;
};

export type RenderedFinalizedQuoteEmail = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

// ─────────────────────────────────────────────────────────────────────────
//  Default agreement language
// ─────────────────────────────────────────────────────────────────────────

export const DEFAULT_DISPATCH_CONFIRMATION_STATEMENT =
  "Dispatch has reviewed the shipment scope detailed above and confirms " +
  "operational capacity. Equipment will be assigned and locked to this " +
  "load upon acceptance of the rate confirmed below.";

export const DEFAULT_SCHEDULING_STATEMENT =
  "Pickup and delivery will be scheduled to the windows recorded above. " +
  "Any change to dimensions, weight, addresses, or loading responsibility " +
  "must be communicated to dispatch before pickup; rate is subject to " +
  "revision if scope changes materially.";

export const DEFAULT_ACCEPTANCE_ACKNOWLEDGEMENT =
  "Acceptance of this rate confirmation is acknowledged upon payment of " +
  "the deposit specified under Payment. A signed copy is welcomed but " +
  "not required — payment constitutes acceptance of the terms above.";

export const DEFAULT_PAYMENT_INSTRUCTIONS =
  "Reply to this email to confirm the rate and request payment " +
  "instructions. Dispatch will return wire / ACH / card details for the " +
  "deposit. Bill of lading is issued following confirmation.";

export const DEFAULT_DETENTION_POLICY =
  "Detention begins after two (2) free hours at pickup and two (2) free " +
  "hours at delivery, billed at $75 per hour thereafter, prorated in " +
  "15-minute increments.";

export const DEFAULT_TONU_POLICY =
  "Truck Ordered Not Used (TONU) is $250 if cancellation occurs after " +
  "dispatch but before pickup. No charge if cancelled 24+ hours before " +
  "scheduled pickup.";

// ─────────────────────────────────────────────────────────────────────────
//  Renderer
// ─────────────────────────────────────────────────────────────────────────

export function renderFinalizedQuoteEmail(
  payload: FinalizedQuotePayload,
): RenderedFinalizedQuoteEmail {
  const ref = refNumber(payload.leadId);
  const issued = formatHumanDateString(payload.issuedAt);
  const validThrough = formatHumanDateString(payload.expirationAt);
  const paymentDue = formatHumanDateString(payload.paymentDueAt);

  // Subject line: number + total. Operational, not promotional.
  const subject =
    `Rate confirmation ${payload.finalizedQuoteNumber} — ${formatUsd(payload.pricing.totalAmount)}`.slice(
      0,
      180,
    );

  // Preheader: a short factual summary that previews well in inbox lists.
  const preheaderParts: string[] = [
    `${payload.finalizedQuoteNumber}`,
    `${formatUsd(payload.pricing.totalAmount)} total`,
  ];
  if (payload.expirationAt) {
    preheaderParts.push(`valid through ${validThrough}`);
  }
  if (payload.paymentDueAt) {
    preheaderParts.push(`payment due ${paymentDue}`);
  }
  const preheader = preheaderParts.join(" · ");

  const greeting = `${firstName(payload.customerName)},`;
  const opener =
    "Dispatch has completed review of the finalized shipment scope. " +
    "This rate confirmation supersedes the prior range proposal and " +
    "captures the exact operational terms for the load detailed below.";

  // Resolve agreement text — fall back to defaults when not overridden.
  const dispatchConfirmation =
    payload.dispatchConfirmationStatement ??
    DEFAULT_DISPATCH_CONFIRMATION_STATEMENT;
  const scheduling =
    payload.schedulingStatement ?? DEFAULT_SCHEDULING_STATEMENT;
  const acceptance =
    payload.acceptanceAcknowledgement ?? DEFAULT_ACCEPTANCE_ACKNOWLEDGEMENT;
  const paymentInstr =
    payload.paymentInstructions ?? DEFAULT_PAYMENT_INSTRUCTIONS;
  const detention = payload.detentionPolicy ?? DEFAULT_DETENTION_POLICY;
  const tonu = payload.tonuPolicy ?? DEFAULT_TONU_POLICY;

  // ── Plain-text body ────────────────────────────────────────────────────
  const textLines: string[] = [
    greeting,
    "",
    opener,
    "",
    "── SHIPMENT INFORMATION ──",
    `  RANGE QUOTE #       ${payload.rangeQuoteNumber}`,
    `  FINALIZED QUOTE #   ${payload.finalizedQuoteNumber}`,
    `  ISSUED              ${issued}`,
    `  VALID THROUGH       ${validThrough}`,
    `  PAYMENT DUE         ${paymentDue}`,
    "",
    "── PICKUP ──",
  ];
  pushTextRows(textLines, [
    ["Company", payload.pickup.company],
    ["Contact", payload.pickup.contactName],
    ["Phone", payload.pickup.contactPhone],
    ["Email", payload.pickup.contactEmail],
    [
      "Address",
      joinAddress([
        payload.pickup.addressLine1,
        payload.pickup.addressLine2,
        payload.pickup.city,
        payload.pickup.state,
        payload.pickup.zip,
      ]) || null,
    ],
    ["Window", payload.pickup.window],
    ["Loading hours", payload.pickup.loadingHours],
  ]);

  textLines.push("");
  textLines.push("── DELIVERY ──");
  pushTextRows(textLines, [
    ["Company", payload.delivery.company],
    ["Contact", payload.delivery.contactName],
    ["Phone", payload.delivery.contactPhone],
    ["Email", payload.delivery.contactEmail],
    [
      "Address",
      joinAddress([
        payload.delivery.addressLine1,
        payload.delivery.addressLine2,
        payload.delivery.city,
        payload.delivery.state,
        payload.delivery.zip,
      ]) || null,
    ],
    ["Window", payload.delivery.window],
    ["Receiving hours", payload.delivery.receivingHours],
  ]);

  textLines.push("");
  textLines.push("── FREIGHT ──");
  pushTextRows(textLines, [
    ["Commodity", payload.freight.commodity],
    ["Dimensions", formatDimensions(payload.freight)],
    [
      "Exact weight",
      payload.freight.exactWeightLbs !== null
        ? `${payload.freight.exactWeightLbs.toLocaleString()} lbs`
        : null,
    ],
    [
      "Quantity",
      payload.freight.quantity !== null
        ? String(payload.freight.quantity)
        : null,
    ],
    ["Handling", payload.freight.handlingType],
    ["Condition", payload.freight.runningCondition],
    ["Securement", payload.freight.securementRequirements],
  ]);

  textLines.push("");
  textLines.push("── OPERATIONAL REQUIREMENTS ──");
  textLines.push(`  FORKLIFT AVAILABLE     ${yesNo(payload.ops.forkliftAvailable)}`);
  textLines.push(`  DRIVER ASSIST          ${yesNo(payload.ops.driverAssistRequired)}`);
  textLines.push(`  CRANE / RIGGING        ${yesNo(payload.ops.craneRequired)}`);
  textLines.push(`  PERMITS                ${yesNo(payload.ops.permitsRequired)}`);
  textLines.push(`  ESCORT                 ${yesNo(payload.ops.escortRequired)}`);
  textLines.push(`  TARP                   ${yesNo(payload.ops.tarpRequired)}`);
  if (payload.ops.specialInstructions) {
    textLines.push("");
    textLines.push("  SPECIAL INSTRUCTIONS:");
    payload.ops.specialInstructions.split(/\r?\n/).forEach((ln) => {
      textLines.push(`    ${ln}`);
    });
  }

  textLines.push("");
  textLines.push("── RATE ──");
  textLines.push(
    `  Linehaul                                  ${formatUsd(payload.pricing.linehaul)}`,
  );
  if (payload.pricing.fuelSurcharge != null) {
    textLines.push(
      `  Fuel surcharge                            ${formatUsd(payload.pricing.fuelSurcharge)}`,
    );
  }
  if (payload.pricing.permitsFee != null) {
    textLines.push(
      `  Permits                                   ${formatUsd(payload.pricing.permitsFee)}`,
    );
  }
  for (const a of payload.pricing.accessorials) {
    textLines.push(
      `  ${padRight(a.label, 42)}${formatUsd(a.amount)}`,
    );
  }
  textLines.push("  ─────────────────────────────────────────────");
  textLines.push(
    `  TOTAL FINAL RATE                          ${formatUsd(payload.pricing.totalAmount)}`,
  );
  if (payload.expirationAt) {
    textLines.push(`  Valid through                             ${validThrough}`);
  }
  if (payload.paymentDueAt) {
    textLines.push(`  Payment due                               ${paymentDue}`);
  }

  textLines.push("");
  textLines.push("── DETENTION & TONU ──");
  textLines.push(`  ${detention}`);
  textLines.push("");
  textLines.push(`  ${tonu}`);

  textLines.push("");
  textLines.push("── PAYMENT ──");
  textLines.push(`  ${paymentInstr}`);

  textLines.push("");
  textLines.push("── CONFIRMATION ──");
  textLines.push(`  ${dispatchConfirmation}`);
  textLines.push("");
  textLines.push(`  ${scheduling}`);
  textLines.push("");
  textLines.push(`  ${acceptance}`);

  const contentText = textLines.join("\n");

  // ── HTML body ─────────────────────────────────────────────────────────

  const messageBand = bandWhite(
    `<p style="margin:0 0 4px;color:#0a0a0a;font-family:${SANS};font-size:16px;font-weight:600">${escapeHtml(greeting)}</p>
     <p style="margin:0;color:#0a0a0a;font-family:${SANS};font-size:15px;font-weight:400;line-height:1.55">${escapeHtml(opener)}</p>`,
  );

  // Shipment information.
  const shipmentInfoRows: { label: string; value: string }[] = [
    {
      label: "Range quote #",
      value: `<span style="font-family:${SANS};${MONO_FEATURES};font-size:15px;font-weight:700;color:#0a0a0a">${escapeHtml(payload.rangeQuoteNumber)}</span>`,
    },
    {
      label: "Finalized quote #",
      value: `<span style="font-family:${SANS};${MONO_FEATURES};font-size:18px;font-weight:700;color:#dc2626">${escapeHtml(payload.finalizedQuoteNumber)}</span>`,
    },
    { label: "Issued", value: escapeHtml(issued) },
    {
      label: "Valid through",
      value: `<span style="font-family:${SANS};${MONO_FEATURES};font-weight:700;color:#0a0a0a">${escapeHtml(validThrough)}</span>`,
    },
    {
      label: "Payment due",
      value: `<span style="font-family:${SANS};${MONO_FEATURES};font-weight:700;color:#0a0a0a">${escapeHtml(paymentDue)}</span>`,
    },
  ];
  const shipmentInfoBand = bandWhite(
    sectionHeader("Shipment information") + fieldTable(shipmentInfoRows),
  );

  const pickupBand = bandWhite(
    sectionHeader("Pickup") +
      fieldTable(buildLocationRows(payload.pickup, "pickup")),
  );

  const deliveryBand = bandWhite(
    sectionHeader("Delivery") +
      fieldTable(buildLocationRows(payload.delivery, "delivery")),
  );

  const freightRows: { label: string; value: string }[] = [];
  if (payload.freight.commodity) {
    freightRows.push({
      label: "Commodity",
      value: escapeHtml(payload.freight.commodity),
    });
  }
  const dims = formatDimensions(payload.freight);
  if (dims) {
    freightRows.push({
      label: "Dimensions",
      value: `<span style="font-family:${SANS};${MONO_FEATURES};font-weight:700;color:#0a0a0a">${escapeHtml(dims)}</span>`,
    });
  }
  if (payload.freight.exactWeightLbs !== null) {
    freightRows.push({
      label: "Exact weight",
      value: `<span style="font-family:${SANS};${MONO_FEATURES};font-weight:700;color:#0a0a0a">${escapeHtml(`${payload.freight.exactWeightLbs.toLocaleString()} lbs`)}</span>`,
    });
  }
  if (payload.freight.quantity !== null) {
    freightRows.push({
      label: "Quantity",
      value: `<span style="font-family:${SANS};${MONO_FEATURES}">${escapeHtml(String(payload.freight.quantity))}</span>`,
    });
  }
  if (payload.freight.handlingType) {
    freightRows.push({
      label: "Handling",
      value: escapeHtml(payload.freight.handlingType),
    });
  }
  if (payload.freight.runningCondition) {
    freightRows.push({
      label: "Condition",
      value: escapeHtml(payload.freight.runningCondition),
    });
  }
  if (payload.freight.securementRequirements) {
    freightRows.push({
      label: "Securement",
      value: `<span style="white-space:pre-wrap">${escapeHtml(payload.freight.securementRequirements)}</span>`,
    });
  }
  const freightBand =
    freightRows.length > 0
      ? bandWhite(sectionHeader("Freight") + fieldTable(freightRows))
      : "";

  const opsRows: { label: string; value: string }[] = [
    { label: "Forklift available", value: opsValueHtml(payload.ops.forkliftAvailable) },
    { label: "Driver assist", value: opsValueHtml(payload.ops.driverAssistRequired) },
    { label: "Crane / rigging", value: opsValueHtml(payload.ops.craneRequired) },
    { label: "Permits", value: opsValueHtml(payload.ops.permitsRequired) },
    { label: "Escort", value: opsValueHtml(payload.ops.escortRequired) },
    { label: "Tarp", value: opsValueHtml(payload.ops.tarpRequired) },
  ];
  if (payload.ops.specialInstructions) {
    opsRows.push({
      label: "Special instructions",
      value: `<span style="white-space:pre-wrap">${escapeHtml(payload.ops.specialInstructions)}</span>`,
    });
  }
  const opsBand = bandWhite(
    sectionHeader("Operational requirements") + fieldTable(opsRows),
  );

  // Rate band — invoice-style, black inverted.
  const rateRows: Array<RateRow | { rule: true }> = [
    { label: "Linehaul", amount: formatUsd(payload.pricing.linehaul) },
  ];
  if (payload.pricing.fuelSurcharge != null) {
    rateRows.push({
      label: "Fuel surcharge",
      amount: formatUsd(payload.pricing.fuelSurcharge),
    });
  }
  if (payload.pricing.permitsFee != null) {
    rateRows.push({
      label: "Permits",
      amount: formatUsd(payload.pricing.permitsFee),
    });
  }
  for (const a of payload.pricing.accessorials) {
    rateRows.push({ label: a.label, amount: formatUsd(a.amount) });
  }
  rateRows.push({ rule: true });
  rateRows.push({
    label: "Total final rate",
    amount: formatUsd(payload.pricing.totalAmount),
    emphasize: true,
  });
  if (payload.expirationAt) {
    rateRows.push({ label: "Valid through", amount: validThrough });
  }
  if (payload.paymentDueAt) {
    rateRows.push({ label: "Payment due", amount: paymentDue });
  }
  const rateBand = bandBlack(
    sectionHeader("Rate", true) + rateSummaryTable(rateRows, { inverted: true }),
  );

  // Policies — detention + TONU.
  const policiesBand = bandWhite(
    sectionHeader("Detention & TONU") +
      `<p style="margin:0 0 10px;color:#0a0a0a;font-family:${SANS};font-size:14px;font-weight:400;line-height:1.55">${escapeHtml(detention)}</p>
       <p style="margin:0;color:#0a0a0a;font-family:${SANS};font-size:14px;font-weight:400;line-height:1.55">${escapeHtml(tonu)}</p>`,
  );

  // Payment instructions.
  const paymentBand = bandWhite(
    sectionHeader("Payment") +
      `<p style="margin:0;color:#0a0a0a;font-family:${SANS};font-size:14px;font-weight:400;line-height:1.55">${escapeHtml(paymentInstr)}</p>`,
  );

  // Confirmation / agreement.
  const confirmationBand = bandWhite(
    sectionHeader("Confirmation") +
      `<p style="margin:0 0 10px;color:#0a0a0a;font-family:${SANS};font-size:14px;font-weight:400;line-height:1.55">${escapeHtml(dispatchConfirmation)}</p>
       <p style="margin:0 0 10px;color:#0a0a0a;font-family:${SANS};font-size:14px;font-weight:400;line-height:1.55">${escapeHtml(scheduling)}</p>
       <p style="margin:0;color:#0a0a0a;font-family:${SANS};font-size:14px;font-weight:500;line-height:1.55">${escapeHtml(acceptance)}</p>`,
  );

  const contentHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
    ${messageBand}
    ${HAIRLINE}
    ${shipmentInfoBand}
    ${HAIRLINE}
    ${pickupBand}
    ${HAIRLINE}
    ${deliveryBand}
    ${freightBand ? HAIRLINE + freightBand : ""}
    ${HAIRLINE}
    ${opsBand}
    ${HAIRLINE}
    ${rateBand}
    ${HAIRLINE}
    ${policiesBand}
    ${HAIRLINE}
    ${paymentBand}
    ${HAIRLINE}
    ${confirmationBand}
  </table>`;

  const { html, text } = renderEmailShell({
    preheader,
    contentHtml,
    contentText,
    refNumber: ref,
    docType: "Rate confirmation",
    // Rate confirmation is a formal document — keep the signature
    // footer so it closes with the same authoritative letterhead grammar
    // it opened with.
    includeSignatureFooter: true,
  });

  return {
    to: payload.to,
    from: resolveFrom(),
    replyTo: resolveReplyTo(),
    subject,
    preheader,
    html,
    text,
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  Send wrapper — Resend delivery. Mirrors estimate.ts split: rendering
//  in this file, delivery layered on top so the same renderer powers
//  preview and the actual send.
// ─────────────────────────────────────────────────────────────────────────

export type FinalizedQuoteBytes = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
};

export type FinalizedQuoteSendResult =
  | { ok: true; emailId: string | null }
  | { ok: false; reason: string };

export async function sendFinalizedQuoteBytes(
  bytes: FinalizedQuoteBytes,
): Promise<FinalizedQuoteSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY not configured" };

  const resend = new Resend(apiKey);

  try {
    const result = await resend.emails.send({
      from: bytes.from,
      to: [bytes.to],
      subject: bytes.subject,
      text: bytes.text,
      html: bytes.html,
      replyTo: bytes.replyTo,
    });
    if (result.error) {
      return {
        ok: false,
        reason: result.error.message ?? String(result.error),
      };
    }
    return { ok: true, emailId: result.data?.id ?? null };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────────────────────────────────

function buildLocationRows(
  loc: FinalizedQuotePayload["pickup"] | FinalizedQuotePayload["delivery"],
  kind: "pickup" | "delivery",
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (loc.company) rows.push({ label: "Company", value: escapeHtml(loc.company) });
  if (loc.contactName) {
    rows.push({ label: "Contact", value: escapeHtml(loc.contactName) });
  }
  if (loc.contactPhone) {
    rows.push({
      label: "Phone",
      value: `<a href="tel:${escapeHtml(loc.contactPhone.replace(/[^\d+]/g, ""))}" style="color:#0a0a0a;text-decoration:none;font-family:${SANS};${MONO_FEATURES};font-weight:600">${escapeHtml(loc.contactPhone)}</a>`,
    });
  }
  if (loc.contactEmail) {
    rows.push({
      label: "Email",
      value: `<a href="mailto:${escapeHtml(loc.contactEmail)}" style="color:#0a0a0a;text-decoration:none">${escapeHtml(loc.contactEmail)}</a>`,
    });
  }
  const addr = joinAddress([
    loc.addressLine1,
    loc.addressLine2,
    loc.city,
    loc.state,
    loc.zip,
  ]);
  if (addr) {
    rows.push({
      label: "Address",
      value: `<span style="white-space:pre-wrap">${escapeHtml(addr)}</span>`,
    });
  }
  if (loc.window) {
    rows.push({
      label: kind === "pickup" ? "Pickup window" : "Delivery window",
      value: `<span style="white-space:pre-wrap">${escapeHtml(loc.window)}</span>`,
    });
  }
  if ("loadingHours" in loc && loc.loadingHours) {
    rows.push({
      label: "Loading hours",
      value: `<span style="white-space:pre-wrap">${escapeHtml(loc.loadingHours)}</span>`,
    });
  }
  if ("receivingHours" in loc && loc.receivingHours) {
    rows.push({
      label: "Receiving hours",
      value: `<span style="white-space:pre-wrap">${escapeHtml(loc.receivingHours)}</span>`,
    });
  }
  // Always show at least one row so the section header doesn't sit on
  // an empty table — fall back to a single "—" placeholder.
  if (rows.length === 0) {
    rows.push({ label: "Address", value: "—" });
  }
  return rows;
}

function formatDimensions(f: FinalizedQuotePayload["freight"]): string {
  const parts: string[] = [];
  if (f.lengthIn !== null) parts.push(`${f.lengthIn}"L`);
  if (f.widthIn !== null) parts.push(`${f.widthIn}"W`);
  if (f.heightIn !== null) parts.push(`${f.heightIn}"H`);
  return parts.join(" × ");
}

function opsValueHtml(v: boolean | null): string {
  if (v === true) {
    return `<span style="font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:#166534">Yes</span>`;
  }
  if (v === false) {
    return `<span style="font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:#7f1d1d">No</span>`;
  }
  return `<span style="color:#a1a1aa">—</span>`;
}

function pushTextRows(
  out: string[],
  rows: ReadonlyArray<[string, string | null | undefined]>,
): void {
  for (const [label, value] of rows) {
    if (value == null || value === "") continue;
    out.push(`  ${padRight(label.toUpperCase(), 18)} ${value}`);
  }
}

function padRight(s: string, len: number): string {
  if (s.length >= len) return s;
  return s + " ".repeat(len - s.length);
}
