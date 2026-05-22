import { Resend } from "resend";
import { company } from "@/lib/company";
import { escapeHtml } from "./shell";

/**
 * Bill of Lading (BOL) — email-deliverable shipment execution paperwork.
 *
 * THIRD document class, downstream from Range Proposal (estimate) and
 * Finalized Quote / Rate Confirmation:
 *
 *   Range Proposal   → conversational, rough pricing
 *   Finalized Quote  → formal, exact pricing, dispatch-confirmed scope
 *   Bill of Lading   → execution paperwork (THIS FILE)
 *
 * The BOL is NOT a quote, estimate, or pricing document. It is the
 * physical-shipment paperwork that rides with the load and gets signed
 * by shipper / driver / consignee.
 *
 * Visual treatment is intentionally NOT the editorial estimate/RC
 * letterhead. This is utilitarian carrier paperwork:
 *   - Black 2px outer border, 1px internal grid lines
 *   - Heavy "BILL OF LADING" header banner
 *   - Tabular freight description (real carrier-form grammar)
 *   - Boxed signature areas with explicit lines for sign / print / date
 *   - High contrast, mono-numeric, dense, transport-document feel
 *
 * Email body IS the document. No conversational copy, no salutation —
 * the email is a delivery wrapper for the operational artifact.
 */

// ─── Tokens ───────────────────────────────────────────────────────────────
//
// Sans stack matches the rest of the system. Mono numerics for tabular
// columns. Colors are restricted: black on white with one accent rule
// (the brand red, used sparingly — for the BOL # column and the band
// dividers).

const SANS =
  "'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO_FEATURES =
  "font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0";

const RED = "#dc2626";
const BORDER = "#0a0a0a";
const RULE = "#404040";
const LABEL = "#3f3f46";

// ─── Payload shape ────────────────────────────────────────────────────────

export type BolPayload = {
  // Routing
  to: string;
  recipientName: string;

  // Identifiers
  bolNumber: string;                   // BOL-YYYY-NNNN
  dispatchReference: string | null;    // e.g. HS-A4F2-9B1C
  rangeQuoteNumber: string | null;     // optional cross-ref
  finalizedQuoteNumber: string | null; // RC-YYYY-NNNN
  issueDate: string;                   // ISO YYYY-MM-DD

  // Shipper
  shipper: {
    company: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    pickupWindow: string | null;
    pickupInstructions: string | null;
  };

  // Consignee
  consignee: {
    company: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    deliveryWindow: string | null;
    deliveryInstructions: string | null;
  };

  // Freight
  freight: {
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
  };

  // Operational handling
  ops: {
    driverAssistRequired: boolean;
    tarpRequired: boolean;
    permitsRequired: boolean;
    escortRequired: boolean;
    riggingRequired: boolean;
    appointmentRequired: boolean;
    specialInstructions: string | null;
  };

  // Notes
  dispatchNotes: string | null;

  preparedBy: string | null;
};

export type RenderedBolEmail = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

// ─── Renderer ─────────────────────────────────────────────────────────────

function resolveFrom(): string {
  return (
    process.env.RESEND_FROM_ADDRESS ??
    "Harblanc Dispatch <onboarding@resend.dev>"
  );
}

function resolveReplyTo(): string {
  return process.env.DISPATCH_EMAIL ?? company.dispatchEmail;
}

function formatIssueDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  const yr = d.getUTCFullYear();
  const mo = months[d.getUTCMonth()];
  const dy = String(d.getUTCDate()).padStart(2, "0");
  return `${yr} · ${mo} · ${dy}`;
}

function joinLane(
  c: { city: string | null; state: string | null; zip: string | null },
): string {
  const parts: string[] = [];
  if (c.city) parts.push(c.city);
  if (c.state) parts.push(c.state);
  const head = parts.join(", ");
  if (c.zip) return head ? `${head} ${c.zip}` : c.zip;
  return head;
}

function joinFullAddress(
  c: {
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  },
): string[] {
  const lines: string[] = [];
  if (c.addressLine1) lines.push(c.addressLine1);
  if (c.addressLine2) lines.push(c.addressLine2);
  const lane = joinLane(c);
  if (lane) lines.push(lane);
  return lines;
}

function checkboxHtml(checked: boolean, label: string): string {
  const mark = checked ? "&#x2612;" : "&#x2610;";  // ☒ / ☐
  return `<span style="font-family:${SANS};font-size:14px;color:${BORDER};font-weight:${checked ? "700" : "500"};line-height:1;display:inline-block">${mark}&nbsp;${escapeHtml(label)}</span>`;
}

function checkboxText(checked: boolean, label: string): string {
  return `[${checked ? "X" : " "}] ${label}`;
}

export function renderBolEmail(payload: BolPayload): RenderedBolEmail {
  const issued = formatIssueDate(payload.issueDate);
  const lane = `${joinLane(payload.shipper) || "?"} → ${joinLane(payload.consignee) || "?"}`;
  const subject = `Bill of Lading ${payload.bolNumber} — ${lane}`.slice(0, 180);
  const preheaderParts: string[] = [payload.bolNumber];
  if (payload.dispatchReference) preheaderParts.push(payload.dispatchReference);
  preheaderParts.push(`issued ${issued}`);
  const preheader = preheaderParts.join(" · ");

  // ── Plain-text BOL ───────────────────────────────────────────────────────
  const textLines: string[] = [
    "================================================================",
    `  ${company.legalName}`,
    `  USDOT ${company.dotNumber} · MC ${company.mcNumber}`,
    `  Dispatch: ${company.dispatchPhone} · ${company.dispatchEmail}`,
    "================================================================",
    "",
    "                       BILL OF LADING",
    "",
    `  BOL #            ${payload.bolNumber}`,
  ];
  if (payload.dispatchReference) {
    textLines.push(`  DISPATCH REF     ${payload.dispatchReference}`);
  }
  if (payload.rangeQuoteNumber) {
    textLines.push(`  RANGE QUOTE      ${payload.rangeQuoteNumber}`);
  }
  if (payload.finalizedQuoteNumber) {
    textLines.push(`  FINALIZED QUOTE  ${payload.finalizedQuoteNumber}`);
  }
  textLines.push(`  ISSUE DATE       ${issued}`);

  textLines.push("");
  textLines.push("----------------------------------------------------------------");
  textLines.push("  SHIPPER (FROM)");
  textLines.push("----------------------------------------------------------------");
  if (payload.shipper.company) textLines.push(`  ${payload.shipper.company}`);
  if (payload.shipper.contactName) textLines.push(`  Attn: ${payload.shipper.contactName}`);
  if (payload.shipper.contactPhone) textLines.push(`  ${payload.shipper.contactPhone}`);
  if (payload.shipper.contactEmail) textLines.push(`  ${payload.shipper.contactEmail}`);
  for (const ln of joinFullAddress(payload.shipper)) textLines.push(`  ${ln}`);
  if (payload.shipper.pickupWindow) textLines.push(`  PICKUP WINDOW   ${payload.shipper.pickupWindow}`);
  if (payload.shipper.pickupInstructions) {
    textLines.push("  PICKUP INSTRUCTIONS:");
    payload.shipper.pickupInstructions.split(/\r?\n/).forEach((l) => textLines.push(`    ${l}`));
  }

  textLines.push("");
  textLines.push("----------------------------------------------------------------");
  textLines.push("  CONSIGNEE (TO)");
  textLines.push("----------------------------------------------------------------");
  if (payload.consignee.company) textLines.push(`  ${payload.consignee.company}`);
  if (payload.consignee.contactName) textLines.push(`  Attn: ${payload.consignee.contactName}`);
  if (payload.consignee.contactPhone) textLines.push(`  ${payload.consignee.contactPhone}`);
  if (payload.consignee.contactEmail) textLines.push(`  ${payload.consignee.contactEmail}`);
  for (const ln of joinFullAddress(payload.consignee)) textLines.push(`  ${ln}`);
  if (payload.consignee.deliveryWindow) textLines.push(`  DELIVERY WINDOW ${payload.consignee.deliveryWindow}`);
  if (payload.consignee.deliveryInstructions) {
    textLines.push("  DELIVERY INSTRUCTIONS:");
    payload.consignee.deliveryInstructions.split(/\r?\n/).forEach((l) => textLines.push(`    ${l}`));
  }

  textLines.push("");
  textLines.push("----------------------------------------------------------------");
  textLines.push("  FREIGHT DESCRIPTION");
  textLines.push("----------------------------------------------------------------");
  textLines.push(
    `  QTY      ${payload.freight.quantity ?? "-"}      UNITS    ${payload.freight.handlingUnitsType ?? "-"}`,
  );
  textLines.push(`  COMMODITY        ${payload.freight.commodity ?? "-"}`);
  textLines.push(
    `  DIMENSIONS       ${formatDims(payload.freight) || "-"}      WEIGHT   ${payload.freight.weightLbs != null ? `${payload.freight.weightLbs.toLocaleString()} lbs` : "-"}`,
  );
  textLines.push(
    `  NMFC             ${payload.freight.nmfcCode ?? "-"}        CLASS    ${payload.freight.freightClass ?? "-"}`,
  );
  textLines.push(`  HAZMAT           ${payload.freight.hazmat ? "YES" : "NO"}`);
  if (payload.freight.specialHandling) {
    textLines.push("  SPECIAL HANDLING:");
    payload.freight.specialHandling.split(/\r?\n/).forEach((l) => textLines.push(`    ${l}`));
  }

  textLines.push("");
  textLines.push("----------------------------------------------------------------");
  textLines.push("  OPERATIONAL HANDLING");
  textLines.push("----------------------------------------------------------------");
  textLines.push(`  ${checkboxText(payload.ops.driverAssistRequired, "Driver assist")}`);
  textLines.push(`  ${checkboxText(payload.ops.tarpRequired, "Tarp required")}`);
  textLines.push(`  ${checkboxText(payload.ops.permitsRequired, "Permits required")}`);
  textLines.push(`  ${checkboxText(payload.ops.escortRequired, "Escort required")}`);
  textLines.push(`  ${checkboxText(payload.ops.riggingRequired, "Rigging required")}`);
  textLines.push(`  ${checkboxText(payload.ops.appointmentRequired, "Appointment required")}`);
  if (payload.ops.specialInstructions) {
    textLines.push("");
    textLines.push("  SPECIAL INSTRUCTIONS:");
    payload.ops.specialInstructions.split(/\r?\n/).forEach((l) => textLines.push(`    ${l}`));
  }

  if (payload.dispatchNotes) {
    textLines.push("");
    textLines.push("----------------------------------------------------------------");
    textLines.push("  DISPATCH NOTES");
    textLines.push("----------------------------------------------------------------");
    payload.dispatchNotes.split(/\r?\n/).forEach((l) => textLines.push(`  ${l}`));
  }

  textLines.push("");
  textLines.push("----------------------------------------------------------------");
  textLines.push("  SIGNATURES");
  textLines.push("----------------------------------------------------------------");
  textLines.push("  SHIPPER:        ______________________   DATE: __________");
  textLines.push("");
  textLines.push("  DRIVER:         ______________________   DATE: __________");
  textLines.push("");
  textLines.push("  CONSIGNEE:      ______________________   DATE: __________");
  textLines.push("");
  textLines.push("================================================================");
  textLines.push(
    "  Goods received in apparent good order except as noted. This bill",
  );
  textLines.push(
    "  of lading is governed by motor carrier regulations of the FMCSA",
  );
  textLines.push(
    "  and the standard terms and conditions of carriage.",
  );
  textLines.push("================================================================");

  const text = textLines.join("\n");

  // ── HTML BOL ─────────────────────────────────────────────────────────────
  //
  // Heavy black outer border, internal grid. Maximum 600px container so
  // it renders correctly across Gmail / Outlook / Apple Mail.

  const phoneDigits = company.dispatchPhone.replace(/[^\d+]/g, "");

  // Carrier header — compact, NOT a marketing letterhead. Two-line
  // identification strip with USDOT/MC inline.
  const carrierHeader = `
    <tr>
      <td style="padding:14px 18px;border-bottom:2px solid ${BORDER};background:#ffffff">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
          <tr>
            <td style="vertical-align:top">
              <p style="margin:0;font-family:${SANS};font-size:16px;font-weight:900;color:${BORDER};letter-spacing:0.02em">${escapeHtml(company.legalName)}</p>
              <p style="margin:2px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.18em;color:${LABEL};text-transform:uppercase;font-weight:700">USDOT&nbsp;${escapeHtml(company.dotNumber)} &nbsp;·&nbsp; MC&nbsp;${escapeHtml(company.mcNumber)} &nbsp;·&nbsp; ${escapeHtml(company.authorityText)}</p>
            </td>
            <td align="right" style="vertical-align:top">
              <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.18em;color:${LABEL};text-transform:uppercase;font-weight:700">Dispatch</p>
              <p style="margin:2px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:13px;color:${BORDER};font-weight:700"><a href="tel:${escapeHtml(phoneDigits)}" style="color:${BORDER};text-decoration:none">${escapeHtml(company.dispatchPhone)}</a></p>
              <p style="margin:2px 0 0;font-family:${SANS};font-size:12px;color:${BORDER};font-weight:500"><a href="mailto:${escapeHtml(company.dispatchEmail)}" style="color:${BORDER};text-decoration:none">${escapeHtml(company.dispatchEmail)}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // BOL title banner — black band with white "BILL OF LADING" + BOL #.
  const titleBanner = `
    <tr>
      <td style="padding:14px 18px;background:${BORDER};color:#ffffff">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
          <tr>
            <td style="vertical-align:middle">
              <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:18px;letter-spacing:0.24em;color:#ffffff;text-transform:uppercase;font-weight:900">Bill of Lading</p>
            </td>
            <td align="right" style="vertical-align:middle">
              <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.22em;color:${RED};text-transform:uppercase;font-weight:700">BOL #</p>
              <p style="margin:2px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:18px;font-weight:900;color:#ffffff;letter-spacing:0.04em">${escapeHtml(payload.bolNumber)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // Identifier block — three-column grid: Dispatch ref / Issue date / Cross-refs.
  const idRows: { label: string; value: string }[] = [
    { label: "Issue date", value: issued },
  ];
  if (payload.dispatchReference) {
    idRows.unshift({ label: "Dispatch ref", value: payload.dispatchReference });
  }
  if (payload.rangeQuoteNumber) {
    idRows.push({ label: "Range quote", value: payload.rangeQuoteNumber });
  }
  if (payload.finalizedQuoteNumber) {
    idRows.push({ label: "Finalized quote", value: payload.finalizedQuoteNumber });
  }

  const idCells = idRows
    .map(
      (r, i) => `
        <td style="padding:10px 14px;border-right:${i === idRows.length - 1 ? "0" : `1px solid ${BORDER}`};vertical-align:top;width:${Math.floor(100 / idRows.length)}%">
          <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:9px;letter-spacing:0.22em;color:${LABEL};text-transform:uppercase;font-weight:700">${escapeHtml(r.label)}</p>
          <p style="margin:4px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:14px;color:${BORDER};font-weight:700">${escapeHtml(r.value)}</p>
        </td>
      `,
    )
    .join("");

  const identifierBlock = `
    <tr>
      <td style="padding:0;border-bottom:1px solid ${BORDER}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
          <tr>${idCells}</tr>
        </table>
      </td>
    </tr>
  `;

  // Shipper / consignee two-column block.
  const partyCell = (
    title: string,
    party:
      | BolPayload["shipper"]
      | BolPayload["consignee"],
    window: string | null,
    windowLabel: string,
    instructions: string | null,
    instructionsLabel: string,
  ): string => {
    const addressLines = joinFullAddress(party).map(escapeHtml).join("<br/>");
    return `
      <td valign="top" style="padding:12px 14px;border-right:1px solid ${BORDER};vertical-align:top;width:50%">
        <p style="margin:0 0 8px;font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.22em;color:${RED};text-transform:uppercase;font-weight:700;border-bottom:1px solid ${BORDER};padding-bottom:6px">${escapeHtml(title)}</p>
        ${party.company ? `<p style="margin:0;font-family:${SANS};font-size:14px;color:${BORDER};font-weight:700">${escapeHtml(party.company)}</p>` : ""}
        ${party.contactName ? `<p style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500">Attn: ${escapeHtml(party.contactName)}</p>` : ""}
        ${party.contactPhone ? `<p style="margin:2px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:13px;color:${BORDER};font-weight:600"><a href="tel:${escapeHtml(party.contactPhone.replace(/[^\d+]/g, ""))}" style="color:${BORDER};text-decoration:none">${escapeHtml(party.contactPhone)}</a></p>` : ""}
        ${party.contactEmail ? `<p style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500"><a href="mailto:${escapeHtml(party.contactEmail)}" style="color:${BORDER};text-decoration:none">${escapeHtml(party.contactEmail)}</a></p>` : ""}
        ${addressLines ? `<p style="margin:8px 0 0;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500;line-height:1.45">${addressLines}</p>` : ""}
        ${window ? `<p style="margin:10px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:9px;letter-spacing:0.22em;color:${LABEL};text-transform:uppercase;font-weight:700">${escapeHtml(windowLabel)}</p><p style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500">${escapeHtml(window)}</p>` : ""}
        ${instructions ? `<p style="margin:10px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:9px;letter-spacing:0.22em;color:${LABEL};text-transform:uppercase;font-weight:700">${escapeHtml(instructionsLabel)}</p><p style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500;white-space:pre-wrap;line-height:1.45">${escapeHtml(instructions)}</p>` : ""}
      </td>
    `;
  };

  const partiesBlock = `
    <tr>
      <td style="padding:0;border-bottom:1px solid ${BORDER}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
          <tr>
            ${partyCell(
              "Shipper (from)",
              payload.shipper,
              payload.shipper.pickupWindow,
              "Pickup window",
              payload.shipper.pickupInstructions,
              "Pickup instructions",
            )}
            <td valign="top" style="padding:12px 14px;vertical-align:top;width:50%">
              <p style="margin:0 0 8px;font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.22em;color:${RED};text-transform:uppercase;font-weight:700;border-bottom:1px solid ${BORDER};padding-bottom:6px">${escapeHtml("Consignee (to)")}</p>
              ${payload.consignee.company ? `<p style="margin:0;font-family:${SANS};font-size:14px;color:${BORDER};font-weight:700">${escapeHtml(payload.consignee.company)}</p>` : ""}
              ${payload.consignee.contactName ? `<p style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500">Attn: ${escapeHtml(payload.consignee.contactName)}</p>` : ""}
              ${payload.consignee.contactPhone ? `<p style="margin:2px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:13px;color:${BORDER};font-weight:600"><a href="tel:${escapeHtml(payload.consignee.contactPhone.replace(/[^\d+]/g, ""))}" style="color:${BORDER};text-decoration:none">${escapeHtml(payload.consignee.contactPhone)}</a></p>` : ""}
              ${payload.consignee.contactEmail ? `<p style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500"><a href="mailto:${escapeHtml(payload.consignee.contactEmail)}" style="color:${BORDER};text-decoration:none">${escapeHtml(payload.consignee.contactEmail)}</a></p>` : ""}
              ${joinFullAddress(payload.consignee).length ? `<p style="margin:8px 0 0;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500;line-height:1.45">${joinFullAddress(payload.consignee).map(escapeHtml).join("<br/>")}</p>` : ""}
              ${payload.consignee.deliveryWindow ? `<p style="margin:10px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:9px;letter-spacing:0.22em;color:${LABEL};text-transform:uppercase;font-weight:700">Delivery window</p><p style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500">${escapeHtml(payload.consignee.deliveryWindow)}</p>` : ""}
              ${payload.consignee.deliveryInstructions ? `<p style="margin:10px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:9px;letter-spacing:0.22em;color:${LABEL};text-transform:uppercase;font-weight:700">Delivery instructions</p><p style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500;white-space:pre-wrap;line-height:1.45">${escapeHtml(payload.consignee.deliveryInstructions)}</p>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // Freight description — tabular, real carrier-form grammar.
  const dims = formatDims(payload.freight);
  const freightHeaderCell = `
    <th align="left" style="padding:6px 8px;font-family:${SANS};${MONO_FEATURES};font-size:9px;letter-spacing:0.18em;color:${LABEL};text-transform:uppercase;font-weight:700;border-bottom:1px solid ${BORDER};background:#f5f5f5">`;

  const freightBlock = `
    <tr>
      <td style="padding:0;border-bottom:1px solid ${BORDER}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
          <tr>
            <td style="padding:8px 14px 4px;background:#ffffff">
              <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.22em;color:${RED};text-transform:uppercase;font-weight:700">Freight description</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 14px 12px;background:#ffffff">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid ${BORDER}">
                <thead>
                  <tr>
                    ${freightHeaderCell}Qty</th>
                    ${freightHeaderCell}Units</th>
                    ${freightHeaderCell}Commodity</th>
                    ${freightHeaderCell}Dimensions</th>
                    ${freightHeaderCell}Weight</th>
                    ${freightHeaderCell}NMFC</th>
                    ${freightHeaderCell}Class</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding:8px;font-family:${SANS};${MONO_FEATURES};font-size:13px;color:${BORDER};font-weight:600;border-right:1px solid ${RULE};vertical-align:top">${escapeHtml(payload.freight.quantity != null ? String(payload.freight.quantity) : "—")}</td>
                    <td style="padding:8px;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500;border-right:1px solid ${RULE};vertical-align:top">${escapeHtml(payload.freight.handlingUnitsType ?? "—")}</td>
                    <td style="padding:8px;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500;border-right:1px solid ${RULE};vertical-align:top;white-space:pre-wrap">${escapeHtml(payload.freight.commodity ?? "—")}</td>
                    <td style="padding:8px;font-family:${SANS};${MONO_FEATURES};font-size:13px;color:${BORDER};font-weight:600;border-right:1px solid ${RULE};vertical-align:top">${escapeHtml(dims || "—")}</td>
                    <td style="padding:8px;font-family:${SANS};${MONO_FEATURES};font-size:13px;color:${BORDER};font-weight:600;border-right:1px solid ${RULE};vertical-align:top">${escapeHtml(payload.freight.weightLbs != null ? `${payload.freight.weightLbs.toLocaleString()} lbs` : "—")}</td>
                    <td style="padding:8px;font-family:${SANS};${MONO_FEATURES};font-size:13px;color:${BORDER};font-weight:500;border-right:1px solid ${RULE};vertical-align:top">${escapeHtml(payload.freight.nmfcCode ?? "—")}</td>
                    <td style="padding:8px;font-family:${SANS};${MONO_FEATURES};font-size:13px;color:${BORDER};font-weight:500;vertical-align:top">${escapeHtml(payload.freight.freightClass ?? "—")}</td>
                  </tr>
                </tbody>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:8px">
                <tr>
                  <td style="padding:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.18em;color:${LABEL};text-transform:uppercase;font-weight:700;width:120px">Hazmat</td>
                  <td style="padding:0;font-family:${SANS};${MONO_FEATURES};font-size:13px;color:${payload.freight.hazmat ? RED : BORDER};font-weight:700">${payload.freight.hazmat ? "YES" : "NO"}</td>
                </tr>
                ${
                  payload.freight.specialHandling
                    ? `<tr>
                        <td style="padding:6px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.18em;color:${LABEL};text-transform:uppercase;font-weight:700;vertical-align:top">Special handling</td>
                        <td style="padding:6px 0 0;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500;white-space:pre-wrap;line-height:1.45">${escapeHtml(payload.freight.specialHandling)}</td>
                      </tr>`
                    : ""
                }
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // Operational handling — checkboxes in two columns.
  const opsBlock = `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid ${BORDER};background:#ffffff">
        <p style="margin:0 0 10px;font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.22em;color:${RED};text-transform:uppercase;font-weight:700">Operational handling</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
          <tr>
            <td style="padding:4px 12px 4px 0;width:50%">${checkboxHtml(payload.ops.driverAssistRequired, "Driver assist")}</td>
            <td style="padding:4px 0 4px 12px;width:50%">${checkboxHtml(payload.ops.tarpRequired, "Tarp required")}</td>
          </tr>
          <tr>
            <td style="padding:4px 12px 4px 0">${checkboxHtml(payload.ops.permitsRequired, "Permits required")}</td>
            <td style="padding:4px 0 4px 12px">${checkboxHtml(payload.ops.escortRequired, "Escort required")}</td>
          </tr>
          <tr>
            <td style="padding:4px 12px 4px 0">${checkboxHtml(payload.ops.riggingRequired, "Rigging required")}</td>
            <td style="padding:4px 0 4px 12px">${checkboxHtml(payload.ops.appointmentRequired, "Appointment required")}</td>
          </tr>
        </table>
        ${
          payload.ops.specialInstructions
            ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:10px">
                <tr>
                  <td style="padding:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.18em;color:${LABEL};text-transform:uppercase;font-weight:700">Special instructions</td>
                </tr>
                <tr>
                  <td style="padding:4px 0 0;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500;white-space:pre-wrap;line-height:1.5">${escapeHtml(payload.ops.specialInstructions)}</td>
                </tr>
              </table>`
            : ""
        }
      </td>
    </tr>
  `;

  // Dispatch notes (only render if present).
  const dispatchNotesBlock = payload.dispatchNotes
    ? `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid ${BORDER};background:#fafafa">
        <p style="margin:0 0 6px;font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.22em;color:${RED};text-transform:uppercase;font-weight:700">Dispatch notes</p>
        <p style="margin:0;font-family:${SANS};font-size:13px;color:${BORDER};font-weight:500;white-space:pre-wrap;line-height:1.5">${escapeHtml(payload.dispatchNotes)}</p>
      </td>
    </tr>
  `
    : "";

  // Signatures — three boxed columns. Lines for sign + print + date.
  const signatureBox = (title: string): string => `
    <td valign="top" style="padding:10px 12px;border-right:1px solid ${BORDER};vertical-align:top;width:33.333%">
      <p style="margin:0 0 8px;font-family:${SANS};${MONO_FEATURES};font-size:10px;letter-spacing:0.22em;color:${RED};text-transform:uppercase;font-weight:700">${escapeHtml(title)}</p>
      <p style="margin:18px 0 2px;font-family:${SANS};font-size:11px;color:${LABEL};border-bottom:1px solid ${BORDER};padding-bottom:1px">&nbsp;</p>
      <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:9px;letter-spacing:0.22em;color:${LABEL};text-transform:uppercase;font-weight:700">Signature</p>
      <p style="margin:14px 0 2px;font-family:${SANS};font-size:11px;color:${LABEL};border-bottom:1px solid ${BORDER};padding-bottom:1px">&nbsp;</p>
      <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:9px;letter-spacing:0.22em;color:${LABEL};text-transform:uppercase;font-weight:700">Printed name</p>
      <p style="margin:14px 0 2px;font-family:${SANS};font-size:11px;color:${LABEL};border-bottom:1px solid ${BORDER};padding-bottom:1px">&nbsp;</p>
      <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:9px;letter-spacing:0.22em;color:${LABEL};text-transform:uppercase;font-weight:700">Date</p>
    </td>
  `;

  const signaturesBlock = `
    <tr>
      <td style="padding:0;border-bottom:1px solid ${BORDER}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#ffffff">
          <tr>
            <td colspan="3" style="padding:8px 14px;border-bottom:1px solid ${BORDER}">
              <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;letter-spacing:0.22em;color:${RED};text-transform:uppercase;font-weight:700">Signatures</p>
            </td>
          </tr>
          <tr>
            ${signatureBox("Shipper")}
            ${signatureBox("Driver")}
            <td valign="top" style="padding:10px 12px;vertical-align:top;width:33.333%">
              <p style="margin:0 0 8px;font-family:${SANS};${MONO_FEATURES};font-size:10px;letter-spacing:0.22em;color:${RED};text-transform:uppercase;font-weight:700">Consignee</p>
              <p style="margin:18px 0 2px;font-family:${SANS};font-size:11px;color:${LABEL};border-bottom:1px solid ${BORDER};padding-bottom:1px">&nbsp;</p>
              <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:9px;letter-spacing:0.22em;color:${LABEL};text-transform:uppercase;font-weight:700">Signature</p>
              <p style="margin:14px 0 2px;font-family:${SANS};font-size:11px;color:${LABEL};border-bottom:1px solid ${BORDER};padding-bottom:1px">&nbsp;</p>
              <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:9px;letter-spacing:0.22em;color:${LABEL};text-transform:uppercase;font-weight:700">Printed name</p>
              <p style="margin:14px 0 2px;font-family:${SANS};font-size:11px;color:${LABEL};border-bottom:1px solid ${BORDER};padding-bottom:1px">&nbsp;</p>
              <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:9px;letter-spacing:0.22em;color:${LABEL};text-transform:uppercase;font-weight:700">Date</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // Legal footer — small print, plain sans.
  const legalFooter = `
    <tr>
      <td style="padding:10px 14px;background:#fafafa">
        <p style="margin:0;font-family:${SANS};font-size:10px;color:${LABEL};line-height:1.45">Received subject to the classifications and tariffs in effect on the date of issue. Goods received in apparent good order, except as noted (contents and condition of contents of packages unknown), marked, consigned, and destined as indicated. The carrier transports under standard motor carrier terms and conditions of carriage as filed with and subject to the FMCSA regulations.</p>
        ${payload.preparedBy ? `<p style="margin:8px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:10px;letter-spacing:0.18em;color:${LABEL};text-transform:uppercase;font-weight:700">Prepared by &nbsp;·&nbsp; <span style="color:${BORDER}">${escapeHtml(payload.preparedBy)}</span></p>` : ""}
      </td>
    </tr>
  `;

  // Outer email shell — preheader, container, 600px document.
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#e5e5e5;color:${BORDER};font-family:${SANS};line-height:1.45;font-size:13px">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#e5e5e5;opacity:0">${escapeHtml(preheader)}</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#e5e5e5">
    <tr>
      <td align="center" style="padding:20px 12px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="border-collapse:collapse;width:100%;max-width:600px;background:#ffffff;border:2px solid ${BORDER}">
          ${carrierHeader}
          ${titleBanner}
          ${identifierBlock}
          ${partiesBlock}
          ${freightBlock}
          ${opsBlock}
          ${dispatchNotesBlock}
          ${signaturesBlock}
          ${legalFooter}
        </table>
      </td>
    </tr>
  </table>
</body></html>`;

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

function formatDims(f: BolPayload["freight"]): string {
  const parts: string[] = [];
  if (f.lengthIn !== null) parts.push(`${f.lengthIn}"L`);
  if (f.widthIn !== null) parts.push(`${f.widthIn}"W`);
  if (f.heightIn !== null) parts.push(`${f.heightIn}"H`);
  return parts.join(" × ");
}

// ─────────────────────────────────────────────────────────────────────────
//  Send wrapper — Resend delivery. Mirrors the estimate.ts /
//  finalized-quote.ts pattern: rendering above, delivery layered on top
//  so the same renderer powers preview and the actual send.
// ─────────────────────────────────────────────────────────────────────────

export type BolBytes = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
};

export type BolSendResult =
  | { ok: true; emailId: string | null }
  | { ok: false; reason: string };

export async function sendBolBytes(bytes: BolBytes): Promise<BolSendResult> {
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
