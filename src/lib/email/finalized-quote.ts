import { Resend } from "resend";
import { company } from "@/lib/company";
import { renderEmailShell, refNumber, escapeHtml } from "./shell";

/**
 * Finalized Quote / Rate Confirmation — email renderer + delivery wrapper.
 *
 * Phase 5E declutter pass: this email now reads as a dispatch invoice,
 * not a freight-law packet. The agreement-language paragraphs (detention
 * policy, TONU, payment instructions, dispatch confirmation, scheduling,
 * acceptance acknowledgement) are no longer rendered into the body.
 *
 * Those fields STILL exist on the row and in the payload type — they
 * carry through into preserved historical snapshots for older sent
 * records, and a future Terms acknowledgement / pre-payment screen can
 * read them. The renderer just doesn't surface them in the email.
 *
 * The visual centerpiece remains the inverted-black rate band — the
 * finalized number is the point of the document. Everything else
 * compresses around it.
 *
 * Order on the page (top → bottom):
 *
 *   1. Greeting + one-sentence opener
 *   2. Shipment info — Quote # / Issued / Valid through
 *   3. Pickup
 *   4. Delivery
 *   5. Freight (commodity, dimensions, weight, condition, handling chips
 *      for any TRUE ops flag)
 *   6. Rate — invoice line items, total, valid-through + payment-due
 *      footnotes
 *   7. Dispatch notes (only renders when special_instructions present)
 *   8. Minimal disclaimer
 *
 * Band grammar (section header, label/value table, invoice-style rate
 * summary, white/black band wrappers) is intentionally duplicated from
 * render.ts — see that file's comment for the rationale.
 */

// ─── Typography / spacing tokens (mirror render.ts) ──────────────────────

const SANS =
  "'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO_FEATURES =
  "font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0";

const SECTION_PADDING_X = 20;
const SECTION_PADDING_Y_TOP = 8;
const SECTION_PADDING_Y_BOTTOM = 8;

const HAIRLINE = `<tr><td style="padding:0;background:#e5e5e5;font-size:1px;line-height:1px">&nbsp;</td></tr>`;

// ─── Band grammar ────────────────────────────────────────────────────────

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

// ─── Small formatters ────────────────────────────────────────────────────

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

// ─── Payload shape ────────────────────────────────────────────────────────

export type FinalizedQuoteAccessorial = {
  label: string;
  amount: number;
};

export type FinalizedQuotePayload = {
  to: string;
  customerName: string;
  leadId: string;

  rangeQuoteNumber: string;
  finalizedQuoteNumber: string;

  issuedAt: string;
  expirationAt: string | null;
  paymentDueAt: string | null;

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

  ops: {
    forkliftAvailable: boolean | null;
    driverAssistRequired: boolean | null;
    craneRequired: boolean | null;
    permitsRequired: boolean | null;
    escortRequired: boolean | null;
    tarpRequired: boolean | null;
    specialInstructions: string | null;
  };

  pricing: {
    linehaul: number;
    fuelSurcharge: number | null;
    permitsFee: number | null;
    accessorials: ReadonlyArray<FinalizedQuoteAccessorial>;
    totalAmount: number;
  };

  // Retained on the type for historical compatibility / future Terms
  // acknowledgement layer. Not rendered in the email body any more.
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

// ─── Defaults (kept for type back-compat — no longer rendered) ───────────

export const DEFAULT_DISPATCH_CONFIRMATION_STATEMENT =
  "Dispatch has reviewed the shipment scope and confirmed the rate below.";
export const DEFAULT_SCHEDULING_STATEMENT =
  "Pickup and delivery will be scheduled to the windows recorded above.";
export const DEFAULT_ACCEPTANCE_ACKNOWLEDGEMENT =
  "Reply to this email to accept.";
export const DEFAULT_PAYMENT_INSTRUCTIONS =
  "Reply to this email for payment instructions.";
export const DEFAULT_DETENTION_POLICY =
  "Detention billed per standard carrier terms after free time at pickup and delivery.";
export const DEFAULT_TONU_POLICY =
  "Truck Ordered Not Used (TONU) billed per standard carrier terms.";

const MINIMAL_DISCLAIMER =
  "This quote reflects the finalized shipment scope reviewed by dispatch. Material changes to shipment conditions may result in revised charges.";

// ─── Operational flag chips ──────────────────────────────────────────────
//
// Folded under the Freight section. Only TRUE flags render — the yes/no
// grid is gone. If nothing is true, no chip strip renders at all.

type OpsFlagKey =
  | "forkliftAvailable"
  | "driverAssistRequired"
  | "craneRequired"
  | "permitsRequired"
  | "escortRequired"
  | "tarpRequired";

const OPS_FLAG_LABELS: Record<OpsFlagKey, string> = {
  forkliftAvailable: "Forklift available",
  driverAssistRequired: "Driver assist",
  craneRequired: "Crane / rigging",
  permitsRequired: "Permits",
  escortRequired: "Escort",
  tarpRequired: "Tarp",
};

function activeOpsFlags(ops: FinalizedQuotePayload["ops"]): string[] {
  const out: string[] = [];
  (Object.keys(OPS_FLAG_LABELS) as OpsFlagKey[]).forEach((k) => {
    if (ops[k] === true) out.push(OPS_FLAG_LABELS[k]);
  });
  return out;
}

function opsChipStripHtml(flags: string[]): string {
  if (flags.length === 0) return "";
  const chips = flags
    .map(
      (f) =>
        `<span style="display:inline-block;margin:0 8px 6px 0;padding:3px 8px;border:1px solid #d4d4d8;background:#fafafa;font-family:${SANS};${MONO_FEATURES};font-size:10px;letter-spacing:0.18em;color:#0a0a0a;text-transform:uppercase;font-weight:700">${escapeHtml(f)}</span>`,
    )
    .join("");
  return `<div style="margin-top:8px;line-height:1.6">${chips}</div>`;
}

// ─── Renderer ─────────────────────────────────────────────────────────────

export function renderFinalizedQuoteEmail(
  payload: FinalizedQuotePayload,
): RenderedFinalizedQuoteEmail {
  const ref = refNumber(payload.leadId);
  const issued = formatHumanDateString(payload.issuedAt);
  const validThrough = formatHumanDateString(payload.expirationAt);
  const paymentDue = formatHumanDateString(payload.paymentDueAt);

  const subject =
    `Rate confirmation ${payload.finalizedQuoteNumber} — ${formatUsd(payload.pricing.totalAmount)}`.slice(0, 180);

  const preheaderParts: string[] = [
    `${payload.finalizedQuoteNumber}`,
    `${formatUsd(payload.pricing.totalAmount)} total`,
  ];
  if (payload.expirationAt) preheaderParts.push(`valid through ${validThrough}`);
  const preheader = preheaderParts.join(" · ");

  const greeting = `${firstName(payload.customerName)},`;
  const opener =
    "Dispatch has finalized the rate and shipment scope below.";

  const flags = activeOpsFlags(payload.ops);

  // ── Plain-text body ────────────────────────────────────────────────────
  const textLines: string[] = [
    greeting,
    "",
    opener,
    "",
    "── SHIPMENT ──",
    `  QUOTE #         ${payload.finalizedQuoteNumber}`,
    `  ISSUED          ${issued}`,
  ];
  if (payload.expirationAt) {
    textLines.push(`  VALID THROUGH   ${validThrough}`);
  }
  textLines.push("");
  textLines.push("── PICKUP ──");
  pushTextRows(textLines, [
    ["Company", payload.pickup.company],
    ["Contact", payload.pickup.contactName],
    ["Phone", payload.pickup.contactPhone],
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
  ]);

  textLines.push("");
  textLines.push("── DELIVERY ──");
  pushTextRows(textLines, [
    ["Company", payload.delivery.company],
    ["Contact", payload.delivery.contactName],
    ["Phone", payload.delivery.contactPhone],
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
  ]);

  textLines.push("");
  textLines.push("── FREIGHT ──");
  pushTextRows(textLines, [
    ["Commodity", payload.freight.commodity],
    ["Dimensions", formatDimensions(payload.freight)],
    [
      "Weight",
      payload.freight.exactWeightLbs !== null
        ? `${payload.freight.exactWeightLbs.toLocaleString()} lbs`
        : null,
    ],
    [
      "Quantity",
      payload.freight.quantity !== null ? String(payload.freight.quantity) : null,
    ],
    ["Handling", payload.freight.handlingType],
    ["Condition", payload.freight.runningCondition],
  ]);
  if (flags.length > 0) {
    textLines.push(`  REQUIREMENTS    ${flags.join(", ")}`);
  }

  textLines.push("");
  textLines.push("── CHARGES ──");
  textLines.push(
    `  Linehaul                                  ${formatUsd(payload.pricing.linehaul)}`,
  );
  if (payload.pricing.fuelSurcharge != null) {
    textLines.push(
      `  Fuel                                      ${formatUsd(payload.pricing.fuelSurcharge)}`,
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
    `  TOTAL                                     ${formatUsd(payload.pricing.totalAmount)}`,
  );
  if (payload.expirationAt) {
    textLines.push(`  Valid through                             ${validThrough}`);
  }
  if (payload.paymentDueAt) {
    textLines.push(`  Payment due                               ${paymentDue}`);
  }

  if (payload.ops.specialInstructions) {
    textLines.push("");
    textLines.push("── DISPATCH NOTES ──");
    payload.ops.specialInstructions.split(/\r?\n/).forEach((ln) => {
      textLines.push(`  ${ln}`);
    });
  }

  textLines.push("");
  textLines.push(MINIMAL_DISCLAIMER);

  const contentText = textLines.join("\n");

  // ── HTML body ─────────────────────────────────────────────────────────

  const messageBand = bandWhite(
    `<p style="margin:0 0 4px;color:#0a0a0a;font-family:${SANS};font-size:16px;font-weight:600">${escapeHtml(greeting)}</p>
     <p style="margin:0;color:#0a0a0a;font-family:${SANS};font-size:15px;font-weight:400;line-height:1.55">${escapeHtml(opener)}</p>`,
  );

  // Shipment block — Quote # / Issued / Valid through (no payment due,
  // no range quote # — that's already in the packet REF strip).
  const shipmentRows: { label: string; value: string }[] = [
    {
      label: "Quote #",
      value: `<span style="font-family:${SANS};${MONO_FEATURES};font-size:18px;font-weight:700;color:#dc2626">${escapeHtml(payload.finalizedQuoteNumber)}</span>`,
    },
    { label: "Issued", value: escapeHtml(issued) },
  ];
  if (payload.expirationAt) {
    shipmentRows.push({
      label: "Valid through",
      value: `<span style="font-family:${SANS};${MONO_FEATURES};font-weight:700;color:#0a0a0a">${escapeHtml(validThrough)}</span>`,
    });
  }
  const shipmentBand = bandWhite(
    sectionHeader("Shipment") + fieldTable(shipmentRows),
  );

  const pickupBand = bandWhite(
    sectionHeader("Pickup") + fieldTable(buildLocationRows(payload.pickup, "pickup")),
  );
  const deliveryBand = bandWhite(
    sectionHeader("Delivery") + fieldTable(buildLocationRows(payload.delivery, "delivery")),
  );

  // Freight block — fields + ops chip strip when anything is true.
  const freightRows: { label: string; value: string }[] = [];
  if (payload.freight.commodity) {
    freightRows.push({ label: "Commodity", value: escapeHtml(payload.freight.commodity) });
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
      label: "Weight",
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
    freightRows.push({ label: "Handling", value: escapeHtml(payload.freight.handlingType) });
  }
  if (payload.freight.runningCondition) {
    freightRows.push({ label: "Condition", value: escapeHtml(payload.freight.runningCondition) });
  }
  if (payload.freight.securementRequirements) {
    freightRows.push({
      label: "Securement",
      value: `<span style="white-space:pre-wrap">${escapeHtml(payload.freight.securementRequirements)}</span>`,
    });
  }
  const freightInner =
    sectionHeader("Freight") +
    fieldTable(freightRows) +
    opsChipStripHtml(flags);
  const freightBand = freightRows.length > 0 || flags.length > 0 ? bandWhite(freightInner) : "";

  // Rate band — invoice centerpiece. Black inverted, line items + total
  // + small valid-through / payment-due footnotes.
  const rateRows: Array<RateRow | { rule: true }> = [
    { label: "Linehaul", amount: formatUsd(payload.pricing.linehaul) },
  ];
  if (payload.pricing.fuelSurcharge != null) {
    rateRows.push({ label: "Fuel", amount: formatUsd(payload.pricing.fuelSurcharge) });
  }
  if (payload.pricing.permitsFee != null) {
    rateRows.push({ label: "Permits", amount: formatUsd(payload.pricing.permitsFee) });
  }
  for (const a of payload.pricing.accessorials) {
    rateRows.push({ label: a.label, amount: formatUsd(a.amount) });
  }
  rateRows.push({ rule: true });
  rateRows.push({
    label: "Total",
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
    sectionHeader("Charges", true) + rateSummaryTable(rateRows, { inverted: true }),
  );

  // Dispatch notes — only renders when there's actually a note.
  const dispatchNotesBand = payload.ops.specialInstructions
    ? bandWhite(
        sectionHeader("Dispatch notes") +
          `<p style="margin:0;color:#0a0a0a;font-family:${SANS};font-size:14px;font-weight:400;line-height:1.55;white-space:pre-wrap">${escapeHtml(payload.ops.specialInstructions)}</p>`,
      )
    : "";

  // Minimal disclaimer — one short paragraph, calm operational tone.
  const disclaimerBand = bandWhite(
    `<p style="margin:0;color:#52525b;font-family:${SANS};font-size:12px;font-weight:400;line-height:1.55">${escapeHtml(MINIMAL_DISCLAIMER)}</p>`,
  );

  const contentHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
    ${messageBand}
    ${HAIRLINE}
    ${shipmentBand}
    ${HAIRLINE}
    ${pickupBand}
    ${HAIRLINE}
    ${deliveryBand}
    ${freightBand ? HAIRLINE + freightBand : ""}
    ${HAIRLINE}
    ${rateBand}
    ${dispatchNotesBand ? HAIRLINE + dispatchNotesBand : ""}
    ${HAIRLINE}
    ${disclaimerBand}
  </table>`;

  const { html, text } = renderEmailShell({
    preheader,
    contentHtml,
    contentText,
    refNumber: ref,
    docType: "Rate confirmation",
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

// ─── Send wrapper ────────────────────────────────────────────────────────

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

// ─── Internal helpers ────────────────────────────────────────────────────

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
