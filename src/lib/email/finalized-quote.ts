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

  /**
   * Public, tokenized URL the customer clicks to confirm the finalized
   * rate. Lands on /quote/confirm/[token]. When null, the Confirm
   * action band is omitted from the rendered email — Build Preview
   * before send time renders without a URL because the confirmation
   * token is generated at row insert and only stitched into the URL
   * at build-preview time. Same posture as the Quote Range acceptUrl
   * pattern in render.ts.
   */
  confirmUrl?: string | null;
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
  "This rate reflects the shipment scope confirmed by dispatch. Changes to the load or schedule may require a revised quote.";

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

/**
 * Confirm-rate action band. Single muted-green button — this is a
 * confirmation, not a yes/no fork. Visually mirrors the Quote Range
 * actionBand in render.ts (same muted-green operational red-900 /
 * green-900 register) so the two customer action emails read as the
 * same family.
 *
 * Rendered only when payload.confirmUrl is non-null. Build Preview
 * before send time omits the URL and therefore omits the band —
 * preview/send byte parity is maintained because the URL is stitched
 * in at the same moment the preview is built, then persisted into
 * preview_html and shipped verbatim at send time.
 */
function confirmActionBand(confirmUrl: string, validThrough: string | null): string {
  const bg = "#166534"; // green-900 — operational confirmation tone
  const border = "#14532d";
  const validityLine = validThrough
    ? `Confirms the rate above through ${escapeHtml(validThrough)}. A dispatcher follows up to coordinate pickup and delivery scheduling.`
    : `Confirms the rate above. A dispatcher follows up to coordinate pickup and delivery scheduling.`;
  return `<tr>
    <td style="padding:${SECTION_PADDING_Y_TOP}px ${SECTION_PADDING_X}px ${SECTION_PADDING_Y_BOTTOM}px;background:#fafafa;border-top:1px solid #d4d4d8">
      ${sectionHeader("Confirm the rate")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
        <tr>
          <td align="center" bgcolor="${bg}" style="background:${bg};border:1px solid ${border}">
            <a href="${escapeHtml(confirmUrl)}" style="display:block;padding:13px 20px;font-family:${SANS};${MONO_FEATURES};font-size:13px;letter-spacing:0.18em;color:#ffffff;text-decoration:none;text-transform:uppercase;font-weight:700">Confirm finalized quote</a>
          </td>
        </tr>
      </table>
      <p style="margin:10px 0 0;font-family:${SANS};font-size:12px;color:#3f3f46;line-height:1.55">${validityLine}</p>
    </td>
  </tr>`;
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
    "Below are the finalized shipment details and committed rate.";

  const flags = activeOpsFlags(payload.ops);

  // ── Plain-text body — confirmed rate first, then 5 sections ─────────────
  const formatCityStateZip = (loc: {
    city: string | null;
    state: string | null;
    zip: string | null;
  }): string => {
    const cs = [loc.city, loc.state].filter(Boolean).join(", ");
    return [cs, loc.zip].filter(Boolean).join(" ");
  };
  const pickupLine = formatCityStateZip(payload.pickup);
  const deliveryLine = formatCityStateZip(payload.delivery);
  const totalFmt = formatUsd(payload.pricing.totalAmount);
  const weightFmt =
    payload.freight.exactWeightLbs !== null
      ? `${payload.freight.exactWeightLbs.toLocaleString()} lbs`
      : null;

  const textLines: string[] = [
    "CONFIRMED RATE",
    "",
    totalFmt,
  ];
  if (payload.expirationAt) {
    textLines.push(`Valid through ${validThrough}`);
  }
  textLines.push("");
  textLines.push("────────────────────────────────");
  textLines.push("LANE");
  textLines.push("");
  const stopTextLines = (
    stop: {
      company: string | null;
      contactName: string | null;
      contactPhone: string | null;
      addressLine1: string | null;
      addressLine2: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
    },
    label: string,
  ): string[] => {
    const out: string[] = [`${label}:`];
    if (stop.company) out.push(`  ${stop.company}`);
    if (stop.addressLine1) out.push(`  ${stop.addressLine1}`);
    if (stop.addressLine2) out.push(`  ${stop.addressLine2}`);
    const csz = [
      [stop.city, stop.state].filter(Boolean).join(", "),
      stop.zip,
    ]
      .filter(Boolean)
      .join(" ");
    if (csz) out.push(`  ${csz}`);
    if (stop.contactName) out.push(`  ${stop.contactName}`);
    if (stop.contactPhone) out.push(`  ${stop.contactPhone}`);
    return out;
  };
  textLines.push(...stopTextLines(payload.pickup, "PICKUP"));
  textLines.push("");
  textLines.push(...stopTextLines(payload.delivery, "DELIVERY"));
  textLines.push("");
  void pickupLine;
  void deliveryLine;
  textLines.push("SCHEDULE");
  if (payload.pickup.window) {
    textLines.push("Pickup:");
    textLines.push(payload.pickup.window);
  }
  if (payload.delivery.window) {
    textLines.push("Delivery:");
    textLines.push(payload.delivery.window);
  }
  textLines.push("");
  textLines.push("FREIGHT");
  if (payload.freight.commodity) textLines.push(payload.freight.commodity);
  if (weightFmt) textLines.push(weightFmt);
  {
    const dParts: string[] = [];
    if (payload.freight.lengthIn != null) dParts.push(`${payload.freight.lengthIn}"L`);
    if (payload.freight.widthIn != null) dParts.push(`${payload.freight.widthIn}"W`);
    if (payload.freight.heightIn != null) dParts.push(`${payload.freight.heightIn}"H`);
    if (dParts.length > 0) textLines.push(dParts.join(" × "));
  }
  if (payload.freight.quantity != null) textLines.push(`Qty: ${payload.freight.quantity}`);
  const skipNa = (v: string | null): string | null => {
    if (!v) return null;
    const t = v.trim();
    if (t.length === 0 || t.toLowerCase() === "n/a") return null;
    return t;
  };
  const handlingT = skipNa(payload.freight.handlingType);
  const conditionT = skipNa(payload.freight.runningCondition);
  const securementT = skipNa(payload.freight.securementRequirements);
  if (handlingT) textLines.push(handlingT);
  if (conditionT) textLines.push(conditionT);
  if (securementT) textLines.push(securementT);
  if (payload.confirmUrl) {
    textLines.push("");
    textLines.push("CONFIRM FINALIZED QUOTE:");
    textLines.push(payload.confirmUrl);
  }
  textLines.push("");
  textLines.push(MINIMAL_DISCLAIMER);
  const contentText = textLines.join("\n");

  // ── HTML body ─────────────────────────────────────────────────────────────
  // Premium decision-email hierarchy:
  //   1. HERO — CONFIRMED RATE eyebrow + $3,200 at 64px + Valid through
  //   2. LANE — pickup city/state/zip, down arrow, delivery city/state/zip
  //   3. SCHEDULE — Pickup window + Delivery window stacked, typed labels
  //   4. FREIGHT — commodity / weight / handling stacked, varied weight
  //   5. RATE BREAKDOWN — label/amount rows + hairline + TOTAL emphasized
  //   6. CONFIRM CTA — single big green button with 2px white inset outline
  //
  // No metadata at the top. No paperwork tables. Hierarchy via typography.

  const sectionEyebrow = (label: string): string =>
    `<p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:700;letter-spacing:0.22em;color:#dc2626;text-transform:uppercase;line-height:1.4;text-align:center">${escapeHtml(label)}</p>`;

  const hairlineTr = `<tr><td style="padding:18px 40px 0"><div style="height:1px;background:#d4d4d8;font-size:1px;line-height:1px">&nbsp;</div></td></tr>`;

  // HERO ──────────────────────────────────────────────────────────────────
  // Centered red eyebrow + centered headline rate.
  const heroTr = `<tr>
      <td align="center" style="padding:44px 40px 8px;text-align:center">
        <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:700;letter-spacing:0.30em;color:#dc2626;text-transform:uppercase;line-height:1.4;text-align:center">Confirmed Rate</p>
        <p style="margin:14px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:64px;font-weight:900;color:#0a0a0a;line-height:1.0;letter-spacing:-0.03em;text-align:center">${escapeHtml(totalFmt)}</p>
      </td>
    </tr>`;

  // LANE ──────────────────────────────────────────────────────────────────
  // V3 layout: full "shipper card" — each side renders company, full
  // street address (line 1 + optional line 2), city/state/zip, contact
  // name, and contact phone. Each row drops gracefully when its data
  // is missing so the layout doesn't leave hanging blank lines.
  type StopLike = {
    company: string | null;
    contactName: string | null;
    contactPhone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  const renderStopBlock = (stop: StopLike, miniLabel: string): string => {
    const cityStateZip = [
      [stop.city, stop.state].filter(Boolean).join(", "),
      stop.zip,
    ]
      .filter(Boolean)
      .join(" ");
    const lines: string[] = [];
    lines.push(
      `<p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:700;letter-spacing:0.18em;color:#71717a;text-transform:uppercase;line-height:1.4">${escapeHtml(miniLabel)}</p>`,
    );
    if (stop.company) {
      lines.push(
        `<p style="margin:8px 0 0;font-family:${SANS};font-size:16px;font-weight:700;color:#0a0a0a;line-height:1.35">${escapeHtml(stop.company)}</p>`,
      );
    }
    if (stop.addressLine1) {
      lines.push(
        `<p style="margin:6px 0 0;font-family:${SANS};font-size:14px;font-weight:500;color:#0a0a0a;line-height:1.45">${escapeHtml(stop.addressLine1)}</p>`,
      );
    }
    if (stop.addressLine2) {
      lines.push(
        `<p style="margin:2px 0 0;font-family:${SANS};font-size:14px;font-weight:500;color:#0a0a0a;line-height:1.45">${escapeHtml(stop.addressLine2)}</p>`,
      );
    }
    if (cityStateZip) {
      lines.push(
        `<p style="margin:2px 0 0;font-family:${SANS};font-size:14px;font-weight:500;color:#0a0a0a;line-height:1.45">${escapeHtml(cityStateZip)}</p>`,
      );
    }
    if (stop.contactName) {
      lines.push(
        `<p style="margin:10px 0 0;font-family:${SANS};font-size:14px;font-weight:500;color:#0a0a0a;line-height:1.45">${escapeHtml(stop.contactName)}</p>`,
      );
    }
    if (stop.contactPhone) {
      lines.push(
        `<p style="margin:2px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:14px;font-weight:500;color:#0a0a0a;line-height:1.45">${escapeHtml(stop.contactPhone)}</p>`,
      );
    }
    return lines.join("");
  };

  void pickupLine;
  void deliveryLine;

  const laneTr = `<tr>
      <td style="padding:18px 40px 0">
        ${sectionEyebrow("Lane")}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:14px">
          <tr>
            <td width="50%" valign="top" style="width:50%;vertical-align:top;padding-right:14px">
              ${renderStopBlock(payload.pickup, "Pickup")}
            </td>
            <td width="50%" valign="top" style="width:50%;vertical-align:top;padding-left:14px">
              ${renderStopBlock(payload.delivery, "Delivery")}
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  // SCHEDULE ──────────────────────────────────────────────────────────────
  // V2 layout: Pickup (left column) | Delivery (right column). When only
  // one of the windows is set, its column spans the full width.
  const schedCell = (label: string, value: string): string =>
    `<p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:700;letter-spacing:0.18em;color:#0a0a0a;text-transform:uppercase;line-height:1.4">${escapeHtml(label)}</p>
     <p style="margin:6px 0 0;font-family:${SANS};font-size:16px;font-weight:600;color:#0a0a0a;line-height:1.4">${escapeHtml(value)}</p>`;

  const pickupWindowValue = payload.pickup.window;
  const deliveryWindowValue = payload.delivery.window;
  const scheduleTr = (pickupWindowValue || deliveryWindowValue)
    ? `<tr>
      <td style="padding:18px 40px 0">
        ${sectionEyebrow("Schedule")}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:14px">
          <tr>
            <td width="50%" valign="top" style="width:50%;vertical-align:top;padding-right:12px">
              ${pickupWindowValue ? schedCell("Pickup", pickupWindowValue) : ""}
            </td>
            <td width="50%" valign="top" style="width:50%;vertical-align:top;padding-left:12px">
              ${deliveryWindowValue ? schedCell("Delivery", deliveryWindowValue) : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    : "";

  // FREIGHT ───────────────────────────────────────────────────────────────
  // V4 layout:
  //   Row 1: COMMODITY — full width, bold prominent.
  //   Row 2: 2-col labeled spec grid (weight, dimensions, quantity, handling,
  //          condition). Pairs flow left-to-right; an odd count leaves the
  //          last cell empty so the layout doesn't shift around.
  //   Row 3: full-width long fields (securement requirements) when present.
  // Values equal to "N/A" or "n/a" are filtered out so the layout never
  // shows literal "N/A" placeholders.
  const isMeaningful = (v: string | null | undefined): v is string => {
    if (!v) return false;
    const t = v.trim();
    return t.length > 0 && t.toLowerCase() !== "n/a";
  };

  const dimsParts: string[] = [];
  if (payload.freight.lengthIn != null) dimsParts.push(`${payload.freight.lengthIn}"L`);
  if (payload.freight.widthIn != null) dimsParts.push(`${payload.freight.widthIn}"W`);
  if (payload.freight.heightIn != null) dimsParts.push(`${payload.freight.heightIn}"H`);
  const dimsStr = dimsParts.length > 0 ? dimsParts.join(" × ") : null;
  const qtyStr =
    payload.freight.quantity != null
      ? payload.freight.quantity.toLocaleString()
      : null;

  type SpecCell = { label: string; value: string; mono: boolean };
  const specCells: SpecCell[] = [];
  if (weightFmt) specCells.push({ label: "Weight", value: weightFmt, mono: true });
  if (dimsStr) specCells.push({ label: "Dimensions", value: dimsStr, mono: true });
  if (qtyStr) specCells.push({ label: "Quantity", value: qtyStr, mono: true });
  if (isMeaningful(payload.freight.handlingType))
    specCells.push({ label: "Handling", value: payload.freight.handlingType, mono: false });
  if (isMeaningful(payload.freight.runningCondition))
    specCells.push({ label: "Condition", value: payload.freight.runningCondition, mono: false });

  const renderSpecCell = (cell: SpecCell | null): string => {
    if (!cell) return "";
    const monoCss = cell.mono ? `${MONO_FEATURES};` : "";
    return `<p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:700;letter-spacing:0.18em;color:#71717a;text-transform:uppercase;line-height:1.4">${escapeHtml(cell.label)}</p>
            <p style="margin:6px 0 0;font-family:${SANS};${monoCss}font-size:15px;font-weight:600;color:#0a0a0a;line-height:1.4">${escapeHtml(cell.value)}</p>`;
  };

  const specRows: string[] = [];
  for (let i = 0; i < specCells.length; i += 2) {
    const left = specCells[i] ?? null;
    const right = specCells[i + 1] ?? null;
    const topPad = specRows.length === 0 ? "0" : "16px";
    specRows.push(`<tr>
        <td width="50%" valign="top" style="width:50%;vertical-align:top;padding:${topPad} 14px 0 0">
          ${renderSpecCell(left)}
        </td>
        <td width="50%" valign="top" style="width:50%;vertical-align:top;padding:${topPad} 0 0 14px">
          ${renderSpecCell(right)}
        </td>
      </tr>`);
  }
  const specGridHtml = specRows.length > 0
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:14px">
        ${specRows.join("")}
      </table>`
    : "";

  const renderFullWidthField = (label: string, value: string): string =>
    `<div style="margin-top:18px">
      <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:700;letter-spacing:0.18em;color:#71717a;text-transform:uppercase;line-height:1.4">${escapeHtml(label)}</p>
      <p style="margin:6px 0 0;font-family:${SANS};font-size:14px;font-weight:500;color:#0a0a0a;line-height:1.5">${escapeHtml(value)}</p>
    </div>`;

  const fullWidthFields: string[] = [];
  if (isMeaningful(payload.freight.securementRequirements))
    fullWidthFields.push(renderFullWidthField("Securement", payload.freight.securementRequirements));

  const commodityValue = isMeaningful(payload.freight.commodity)
    ? payload.freight.commodity
    : null;
  const hasFreightSpecs = specCells.length > 0;
  const hasFreightExtras = fullWidthFields.length > 0;

  const freightTr = (commodityValue || hasFreightSpecs || hasFreightExtras)
    ? `<tr>
      <td style="padding:18px 40px 0">
        ${sectionEyebrow("Freight")}
        ${commodityValue ? `<p style="margin:14px 0 0;font-family:${SANS};font-size:20px;font-weight:700;color:#0a0a0a;line-height:1.3">${escapeHtml(commodityValue)}</p>` : ""}
        ${specGridHtml}
        ${fullWidthFields.join("")}
      </td>
    </tr>`
    : "";

  // RATE BREAKDOWN intentionally omitted from this email — the customer
  // sees the TOTAL once, prominently, in the hero. We don't surface
  // linehaul / fuel / permits / accessorial breakdowns to clients.

  // CONFIRM CTA — single full-width button, premium 2px white inset
  // outline (matches Email 2's ACCEPT RANGE pattern). Green semantic
  // for "confirm finalized commitment" — operational confirmation.
  const confirmTr = payload.confirmUrl
    ? `<tr>
        <td style="padding:18px 40px 0">
          <a href="${escapeHtml(payload.confirmUrl)}" style="display:block;box-sizing:border-box;background:#166534;color:#ffffff;font-family:${SANS};${MONO_FEATURES};font-size:13px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;text-decoration:none;text-align:center;padding:22px 16px;line-height:1.2;box-shadow:inset 0 0 0 2px #ffffff" bgcolor="#166534">Confirm Finalized Quote</a>
          ${
            payload.expirationAt
              ? `<p style="margin:20px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:500;letter-spacing:0.10em;color:#0a0a0a;line-height:1.6;text-align:center;text-transform:uppercase">Confirms the rate above through ${escapeHtml(validThrough)} &middot; Dispatcher follows up to coordinate scheduling</p>`
              : `<p style="margin:20px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:500;letter-spacing:0.10em;color:#0a0a0a;line-height:1.6;text-align:center;text-transform:uppercase">Confirms the rate above &middot; Dispatcher follows up to coordinate scheduling</p>`
          }
        </td>
      </tr>`
    : "";

  // Bottom padding row — keeps the CTA from bleeding into the shell's
  // black footer band.
  const bottomPadTr = `<tr><td style="padding:0 40px 40px"></td></tr>`;

  const contentHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
    ${heroTr}
    ${hairlineTr}
    ${laneTr}
    ${hairlineTr}
    ${scheduleTr}
    ${scheduleTr ? hairlineTr : ""}
    ${freightTr}
    ${freightTr ? hairlineTr : ""}
    ${confirmTr}
    ${bottomPadTr}
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
