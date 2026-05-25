import { company } from "@/lib/company";
import { renderEmailShell, refNumber, escapeHtml } from "./shell";

/**
 * Pure email renderers. Shared by send wrappers + preview action so
 * preview-bytes == sent-bytes is guaranteed.
 *
 * Phase 3D-vis-pass5 (2026-05-22): restructured the estimate body to
 * read like a rate confirmation. LANE → QUOTE SUMMARY with formal
 * Quote # / Issued / Origin / Destination / Commodity / Weight / Pickup
 * / Miles fields (Pickup timing + Equipment fold in when present).
 * RATE band carries the rate-conf grammar: label-left, amount-right
 * line items, a hairline rule, then a TOTAL ESTIMATE row + Valid
 * Through. Closing line promotes to a CONFIRMATION band.
 *
 * Phase QR-EMAIL-1 (2026-05-24): Quote Range refinements.
 *   - Subject reads as operational paperwork:
 *     "Lane quote · {origin}→{dest} · {rate}" (drop the "Quote on"
 *     marketing-y stem). Quote # leads the preheader for ops clarity.
 *   - Opener now says "rate range estimate" when range present and
 *     "rate estimate" when single price, matching how dispatch
 *     paperwork actually phrases the document.
 *   - Rate breakdown drops the "Accessorials TBD" row (the schema
 *     has no separate fuel/accessorials column today — showing TBD
 *     makes the math read as Total = Linehaul + 0, which is
 *     confusing). When/if fuel + accessorials become first-class
 *     columns on dispatch_estimates, they fold back in here as
 *     additional RateRow entries with no other structural change.
 *   - Action buttons say "Accept this range" / "Decline this range"
 *     — accurately names what the customer is accepting, since
 *     this email proposes a range, not a finalized quote.
 *
 * Typography parity from pass4 is preserved: Public Sans stack across
 * sans + mono, tabular numbers via font-feature-settings on numeric
 * positions, 0.22em tracking, 400/600/700/900 weight tiers.
 */

const SANS =
  "'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO_FEATURES =
  "font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0";

// ─────────────────────────────────────────────────────────────────────────────
//  Section helpers (shared band grammar)
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_PADDING_X = 20;
const SECTION_PADDING_Y_TOP = 4;
const SECTION_PADDING_Y_BOTTOM = 4;

const HAIRLINE = `<tr><td style="padding:0;background:#e5e5e5;font-size:1px;line-height:1px">&nbsp;</td></tr>`;

/**
 * Section header — a thin red horizontal strip spanning the section
 * width, with the title text contained inside it (white, uppercase
 * tracked). Reads as a small label tab in front of each block.
 *
 * The `inverted` parameter is retained for signature compatibility
 * but currently has no visual effect — the strip is always red with
 * white text on every background.
 */
function sectionHeader(title: string, inverted = false): string {
  void inverted;
  // Black strip, white text, centered. Reads as a small dispatch
  // banner against the white body without the red accent shouting.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin:0 0 10px">
    <tr>
      <td align="center" style="padding:5px 12px;background:#0a0a0a;font-family:${SANS};${MONO_FEATURES};font-size:10px;letter-spacing:0.22em;color:#ffffff;text-transform:uppercase;font-weight:700;text-align:center;vertical-align:middle">${escapeHtml(title)}</td>
    </tr>
  </table>`;
}

/**
 * LABEL → VALUE table used by everything that isn't the rate summary.
 * Labels in a fixed 120px left column; values flow on the right.
 */
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
        <td style="padding:2px 14px 2px 0;font-family:${SANS};${MONO_FEATURES};font-size:10px;color:${labelColor};text-transform:uppercase;letter-spacing:0.18em;white-space:nowrap;font-weight:700;vertical-align:top;width:120px">${escapeHtml(label)}</td>
        <td style="${valueStyle};vertical-align:top">${value}</td>
      </tr>`;
    })
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${body}</table>`;
}

/**
 * Invoice-style rate summary table. Label flush left, amount flush
 * right with a stretchy spacer column between. Used only inside the
 * rate band — the wider table grammar reads as a real rate-conf
 * line-item block.
 */
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

// ─────────────────────────────────────────────────────────────────────────────
//  Acknowledgement
// ─────────────────────────────────────────────────────────────────────────────

export type AcknowledgementPayload = {
  to: string;
  name: string;
  pickupZip: string;
  deliveryZip: string;
  commodity: string;
  weight: string;
  pickupDate: string | null;
  leadId: string;
};

export type RenderedEmail = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

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

function quoteNumber(leadId: string): string {
  return `HS-${refNumber(leadId)}`;
}

function formatHumanDate(d: Date): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/**
 * Format a calendar-day ISO string (YYYY-MM-DD, as stored on
 * dispatch_estimates.expiration_at) into the friendly "Month DD, YYYY"
 * the body uses. Parsed component-wise so timezones don't shift the
 * wall-clock day — the customer's expiry shouldn't move with their
 * device clock.
 */
function formatHumanDateFromIsoDay(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return iso;
  }
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}

export function renderAcknowledgementEmail(
  payload: AcknowledgementPayload,
): RenderedEmail {
  const lane = `${payload.pickupZip} → ${payload.deliveryZip}`;
  const subject = `Got it — ${lane}`.slice(0, 180);
  const preheader =
    "Dispatch is reviewing your lane now. Reply within the hour with a price range.";
  const pickup = payload.pickupDate ?? "ASAP";
  const ref = refNumber(payload.leadId);
  const qNum = quoteNumber(payload.leadId);
  const greeting = `Hey ${firstName(payload.name)} —`;
  const phoneDigits = company.dispatchPhone.replace(/[^\d+]/g, "");

  const contentText = [
    greeting,
    "",
    "Got it. Pulling the lane up now.",
    "",
    "── REQUEST SUMMARY ──",
    `  REQUEST #     ${qNum}`,
    `  ORIGIN        ${payload.pickupZip}`,
    `  DESTINATION   ${payload.deliveryZip}`,
    `  COMMODITY     ${payload.commodity}`,
    `  WEIGHT        ${payload.weight}`,
    `  PICKUP        ${pickup}`,
    "",
    "── NEXT STEP ──",
    "  REPLY         within the hour with a price range",
    `  IF URGENT     call direct ${company.dispatchPhone}`,
  ].join("\n");

  const messageBand = bandWhite(
    `<p style="margin:0 0 4px;color:#0a0a0a;font-family:${SANS};font-size:16px;font-weight:600">${escapeHtml(greeting)}</p>
     <p style="margin:0;color:#0a0a0a;font-family:${SANS};font-size:15px;font-weight:400">Got it. Pulling the lane up now.</p>`,
  );

  const requestSummaryBand = bandWhite(
    sectionHeader("Request summary") +
      fieldTable([
        {
          label: "Request #",
          value: `<span style="font-family:${SANS};${MONO_FEATURES};font-size:15px;font-weight:700;color:#0a0a0a">${escapeHtml(qNum)}</span>`,
        },
        {
          label: "Origin",
          value: `<span style="font-family:${SANS};${MONO_FEATURES};font-size:20px;font-weight:700;color:#0a0a0a">${escapeHtml(payload.pickupZip)}</span>`,
        },
        {
          label: "Destination",
          value: `<span style="font-family:${SANS};${MONO_FEATURES};font-size:20px;font-weight:700;color:#0a0a0a">${escapeHtml(payload.deliveryZip)}</span>`,
        },
        { label: "Commodity", value: escapeHtml(payload.commodity) },
        { label: "Weight", value: escapeHtml(payload.weight) },
        { label: "Pickup", value: escapeHtml(pickup) },
      ]),
  );

  const nextStepBand = bandWhite(
    sectionHeader("Next step") +
      fieldTable([
        { label: "Reply", value: "within the hour with a price range." },
        {
          label: "If urgent",
          value: `call me direct at <a href="tel:${escapeHtml(phoneDigits)}" style="color:#dc2626;text-decoration:none;font-weight:800">${escapeHtml(company.dispatchPhone)}</a>.`,
        },
      ]),
  );

  const contentHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
    ${messageBand}
    ${HAIRLINE}
    ${requestSummaryBand}
    ${HAIRLINE}
    ${nextStepBand}
  </table>`;

  const { html, text } = renderEmailShell({
    preheader,
    contentHtml,
    contentText,
    refNumber: ref,
    docType: "Request acknowledged",
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

// ─────────────────────────────────────────────────────────────────────────────
//  Estimate
// ─────────────────────────────────────────────────────────────────────────────

export type EstimatePayload = {
  to: string;
  name: string;
  lane: { pickupZip: string; deliveryZip: string };
  load: { commodity: string; weight: string; pickup: string };
  /**
   * Linehaul range. low is the bottom of the operator's quote, high is
   * the top (or null for a single price). Fuel surcharge + accessorials
   * are tracked separately and only appear as line items when present.
   */
  rate: { low: number; high: number | null };
  miles: number | null;
  pickupTimingNotes: string | null;
  equipmentNotes: string | null;
  closingLine: string;
  expirationAt: string | null;
  leadId: string;
  /**
   * Optional fuel surcharge. When null or 0, the line is suppressed
   * from the rate breakdown. When > 0 it adds to both the low and high
   * total, and appears as a single (non-range) line item.
   */
  fuelSurcharge?: number | null;
  /**
   * Optional accessorial line items. Empty/missing labels and zero
   * amounts are filtered out by the caller. When the resulting list is
   * empty, no accessorial rows are rendered. Each surviving entry
   * appears in the breakdown with its label and a single amount.
   */
  accessorials?: ReadonlyArray<{ label: string; amount: number }> | null;
  /**
   * Public, tokenized URL the customer clicks to accept this estimate.
   * Lands on the shipment finalization intake page. When null, the
   * Accept / Decline action band is omitted from the rendered email —
   * Build Preview before send time renders without a token because
   * tokens are issued at send time.
   */
  acceptUrl?: string | null;
  declineUrl?: string | null;
};

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatRate(low: number, high: number | null): string {
  if (high == null || high <= low) return formatUsd(low);
  return `${formatUsd(low)}–${formatUsd(high)}`;
}

/**
 * Email-safe Accept / Decline action band. Two restrained buttons
 * side-by-side (stack-via-percent-widths on narrow viewports), a sub-
 * caption explaining each, and the validity disclaimer below.
 *
 * Buttons use solid backgrounds (no images, no SVG), 1px darker
 * borders, square corners — they read as operational paperwork, not
 * a SaaS landing page CTA.
 */
function actionBand(
  acceptUrl: string,
  declineUrl: string,
  validThrough: string | null,
): string {
  // Muted operational tones — green-900 / red-900 register, not the brighter
  // 700-tier marketing greens/reds.
  const acceptBg = "#166534";
  const acceptBorder = "#14532d";
  const declineBg = "#7f1d1d";
  const declineBorder = "#450a0a";

  const button = (
    href: string,
    label: string,
    bg: string,
    border: string,
  ): string =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
      <tr>
        <td align="center" bgcolor="${bg}" style="background:${bg};border:1px solid ${border}">
          <a href="${escapeHtml(href)}" style="display:block;padding:11px 16px;font-family:${SANS};${MONO_FEATURES};font-size:12px;letter-spacing:0.18em;color:#ffffff;text-decoration:none;text-transform:uppercase;font-weight:700">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;

  const validityLine = validThrough
    ? `This range is valid through ${escapeHtml(validThrough)} and is subject to final shipment details and capacity at dispatch.`
    : `This range is subject to final shipment details and capacity at dispatch.`;

  return `<tr>
    <td style="padding:${SECTION_PADDING_Y_TOP}px ${SECTION_PADDING_X}px ${SECTION_PADDING_Y_BOTTOM}px;background:#fafafa;border-top:1px solid #d4d4d8">
      ${sectionHeader("How would you like to proceed?")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
        <tr>
          <td width="48%" valign="top" style="width:48%;vertical-align:top">
            ${button(acceptUrl, "Accept this range", acceptBg, acceptBorder)}
            <p style="margin:8px 0 0;font-family:${SANS};font-size:12px;color:#3f3f46;line-height:1.5">Accept the range and continue to load finalization. Dispatch reviews the full intake before a truck is committed.</p>
          </td>
          <td width="4%" style="width:4%;font-size:1px;line-height:1px">&nbsp;</td>
          <td width="48%" valign="top" style="width:48%;vertical-align:top">
            ${button(declineUrl, "Decline this range", declineBg, declineBorder)}
            <p style="margin:8px 0 0;font-family:${SANS};font-size:12px;color:#3f3f46;line-height:1.5">Decline the range. There&rsquo;s a short note field on the next screen if anything needs to change.</p>
          </td>
        </tr>
      </table>
      <p style="margin:12px 0 0;font-family:${SANS};font-size:11px;color:#52525b;line-height:1.5">${validityLine}</p>
    </td>
  </tr>`;
}

export function renderEstimateEmail(payload: EstimatePayload): RenderedEmail {
  const lane = `${payload.lane.pickupZip} → ${payload.lane.deliveryZip}`;

  // Linehaul-only range — what the body's "Linehaul" line shows.
  const linehaulRate = formatRate(payload.rate.low, payload.rate.high);

  // Compute the total (linehaul + fuel + sum of accessorials) so the
  // Total Estimate line and the subject/preheader reflect everything
  // the customer pays. Fuel + accessorials add the SAME flat amount
  // to both ends of the linehaul range.
  const fuelSurcharge = payload.fuelSurcharge ?? 0;
  const accessorialsList = (payload.accessorials ?? []).filter(
    (a) => a.label.trim().length > 0 || a.amount > 0,
  );
  const accessorialsTotal = accessorialsList.reduce(
    (sum, a) => sum + (Number.isFinite(a.amount) ? a.amount : 0),
    0,
  );
  const adders = fuelSurcharge + accessorialsTotal;
  const totalLow = payload.rate.low + adders;
  const totalHigh =
    payload.rate.high != null ? payload.rate.high + adders : null;
  const totalRate = formatRate(totalLow, totalHigh);

  // Subject: dispatch-paperwork phrasing. "Lane quote" leads, route +
  // total rate follow. Subject reflects the full price the customer
  // pays, not just the linehaul.
  const subject = `Lane quote · ${lane} · ${totalRate}`.slice(0, 180);

  const qNum = quoteNumber(payload.leadId);
  // Preheader: quote # first (so the inbox preview shows the document
  // reference), then total rate + lane, then validity window.
  const preheader =
    payload.miles != null
      ? `${qNum} · ${totalRate} on ${lane}. ~${payload.miles} mi. Holds through ${payload.expirationAt ?? "the week"}.`
      : `${qNum} · ${totalRate} on ${lane}. Holds through ${payload.expirationAt ?? "the week"}.`;

  const greeting = `${firstName(payload.name)},`;
  const ref = refNumber(payload.leadId);
  const issued = formatHumanDate(new Date());
  // ISO YYYY-MM-DD comes in from the workspace's date input. Format
  // it the same way Issued is rendered — "May 27, 2026" — so the row
  // pair reads consistently in the body, plaintext, and rate breakdown.
  const validThrough =
    payload.expirationAt && /^\d{4}-\d{2}-\d{2}$/.test(payload.expirationAt)
      ? formatHumanDateFromIsoDay(payload.expirationAt)
      : (payload.expirationAt ?? "—");
  // Opener: dispatch reviewed the lane → range estimate (or single
  // rate estimate). Matches how a freight rate-conf opens.
  const opener =
    payload.rate.high != null
      ? "Dispatch reviewed the requested lane. Below is the current rate range estimate. The range absorbs final shipment dimensions and appointment timing."
      : "Dispatch reviewed the requested lane. Below is the current rate estimate.";

  const hasActions = !!payload.acceptUrl && !!payload.declineUrl;

  // ── Plain-text body — invoice grammar in monospace ASCII ─────────────────
  const textLines: string[] = [
    greeting,
    "",
    opener,
    "",
    "── QUOTE SUMMARY ──",
    `  QUOTE #         ${qNum}`,
    `  ISSUED          ${issued}`,
    `  VALID THROUGH   ${validThrough}`,
    `  ORIGIN          ${payload.lane.pickupZip}`,
    `  DESTINATION     ${payload.lane.deliveryZip}`,
    `  COMMODITY       ${payload.load.commodity}`,
    `  WEIGHT          ${payload.load.weight}`,
    `  PICKUP          ${payload.load.pickup}`,
  ];
  if (payload.miles != null) {
    textLines.push(`  MILES           ~${payload.miles}`);
  }
  if (payload.pickupTimingNotes) {
    textLines.push(`  PICKUP TIMING   ${payload.pickupTimingNotes}`);
  }
  if (payload.equipmentNotes) {
    textLines.push(`  EQUIPMENT       ${payload.equipmentNotes}`);
  }
  textLines.push("");
  textLines.push("── RATE BREAKDOWN ──");
  textLines.push(`  Linehaul                              ${linehaulRate}`);
  if (fuelSurcharge > 0) {
    textLines.push(`  Fuel surcharge                        ${formatUsd(fuelSurcharge)}`);
  }
  for (const a of accessorialsList) {
    const labelText = (a.label.trim() || "Accessorial").padEnd(38, " ").slice(0, 38);
    textLines.push(`  ${labelText}${formatUsd(a.amount)}`);
  }
  textLines.push(`  ─────────────────────────────────────────`);
  textLines.push(`  TOTAL ESTIMATE                        ${totalRate}`);
  if (payload.expirationAt) {
    textLines.push(`  Valid through                         ${validThrough}`);
  }
  if (payload.closingLine.trim().length > 0) {
    textLines.push("");
    textLines.push("── CONFIRMATION ──");
    textLines.push(`  ${payload.closingLine}`);
  }
  if (hasActions) {
    textLines.push("");
    textLines.push("── HOW WOULD YOU LIKE TO PROCEED? ──");
    textLines.push(`  ACCEPT THIS RANGE:   ${payload.acceptUrl}`);
    textLines.push(`  DECLINE THIS RANGE:  ${payload.declineUrl}`);
    if (payload.expirationAt) {
      textLines.push(
        `  Valid through ${payload.expirationAt}. Subject to final shipment details and capacity at dispatch.`,
      );
    }
  }
  const contentText = textLines.join("\n");

  // ── HTML body ─────────────────────────────────────────────────────────────

  const messageBand = bandWhite(
    `<p style="margin:0 0 4px;color:#0a0a0a;font-family:${SANS};font-size:16px;font-weight:600">${escapeHtml(greeting)}</p>
     <p style="margin:0;color:#0a0a0a;font-family:${SANS};font-size:15px;font-weight:400">${escapeHtml(opener)}</p>`,
  );

  // Quote summary — formal field labels. Values render with one
  // consistent style instead of per-row inline overrides: 15px,
  // weight 500, black. Identifier-ish fields (Quote #, Origin,
  // Destination) carry tabular-num features so the digits align
  // vertically. The Valid through ISO date is reformatted to the
  // friendly "Month DD, YYYY" so it matches the Issued row and
  // doesn't read as raw DB output.
  // Tabular-num wrapper for identifier-ish values (ref numbers, ZIPs).
  // Same size + weight as plain values; only the numeric features
  // differ so digit columns visually align in the row stack.
  const tabularSpan = (text: string) =>
    `<span style="font-family:${SANS};${MONO_FEATURES};font-size:15px;color:#0a0a0a;font-weight:500">${escapeHtml(text)}</span>`;

  const quoteSummaryRows: { label: string; value: string }[] = [
    {
      label: "Quote #",
      value: tabularSpan(qNum),
    },
    {
      label: "Issued",
      value: escapeHtml(issued),
    },
    {
      label: "Valid through",
      value: escapeHtml(validThrough),
    },
    {
      label: "Origin",
      value: tabularSpan(payload.lane.pickupZip),
    },
    {
      label: "Destination",
      value: tabularSpan(payload.lane.deliveryZip),
    },
    { label: "Commodity", value: escapeHtml(payload.load.commodity) },
    { label: "Weight", value: escapeHtml(payload.load.weight) },
    { label: "Pickup", value: escapeHtml(payload.load.pickup) },
  ];
  if (payload.miles != null) {
    quoteSummaryRows.push({
      label: "Miles",
      value: `<span style="font-family:${SANS};${MONO_FEATURES}">~${escapeHtml(String(payload.miles))}</span>`,
    });
  }
  if (payload.pickupTimingNotes) {
    quoteSummaryRows.push({
      label: "Pickup timing",
      value: `<span style="white-space:pre-wrap">${escapeHtml(payload.pickupTimingNotes)}</span>`,
    });
  }
  if (payload.equipmentNotes) {
    quoteSummaryRows.push({
      label: "Equipment",
      value: `<span style="white-space:pre-wrap">${escapeHtml(payload.equipmentNotes)}</span>`,
    });
  }
  const quoteSummaryBand = bandWhite(
    sectionHeader("Quote summary") + fieldTable(quoteSummaryRows),
  );

  // Rate breakdown — real freight rate-conf grammar: label-left,
  // amount-right. Linehaul leads; fuel + accessorials only appear
  // when present (no phantom TBD rows). Total reflects everything
  // above the rule.
  const rateRows: Array<RateRow | { rule: true }> = [
    { label: "Linehaul", amount: linehaulRate },
  ];
  if (fuelSurcharge > 0) {
    rateRows.push({ label: "Fuel surcharge", amount: formatUsd(fuelSurcharge) });
  }
  for (const a of accessorialsList) {
    rateRows.push({
      label: a.label.trim() || "Accessorial",
      amount: formatUsd(a.amount),
    });
  }
  rateRows.push({ rule: true });
  rateRows.push({
    label: "Total estimate",
    amount: totalRate,
    emphasize: true,
  });
  if (payload.expirationAt) {
    rateRows.push({ label: "Valid through", amount: validThrough });
  }
  // Rate breakdown on white — no inverted band. Matches the rest of
  // the document; section header rules + a tinted top/bottom hairline
  // give the block its own gravity without the dark masthead-style
  // background.
  const rateSummaryBand = bandWhite(
    sectionHeader("Rate breakdown") +
      rateSummaryTable(rateRows, { inverted: false }),
  );

  // Confirmation — closing line content lifted to its own section.
  // Suppressed entirely when the operator left the closing line
  // empty (no Special Instructions typed in the workspace). Same
  // applies to the plaintext below.
  const hasClosingLine = payload.closingLine.trim().length > 0;
  const confirmationBand = hasClosingLine
    ? bandWhite(
        sectionHeader("Confirmation") +
          `<p style="margin:0;color:#0a0a0a;font-family:${SANS};font-size:15px;font-weight:400;line-height:1.55">${escapeHtml(payload.closingLine)}</p>`,
      )
    : "";

  // actionBand's validThrough param accepts null to switch its
  // disclaimer to the no-expiry phrasing. Our local `validThrough`
  // is "—" in the no-expiry case (so the summary row reads cleanly);
  // hand the action band the real null so it picks the right copy.
  const actionBandHtml = hasActions
    ? actionBand(
        payload.acceptUrl!,
        payload.declineUrl!,
        payload.expirationAt ? validThrough : null,
      )
    : "";

  // HAIRLINE before the Confirmation band only appears when the
  // band itself is rendering — otherwise it leaves a phantom rule.
  const contentHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
    ${messageBand}
    ${HAIRLINE}
    ${quoteSummaryBand}
    ${HAIRLINE}
    ${rateSummaryBand}
    ${hasClosingLine ? HAIRLINE : ""}
    ${confirmationBand}
    ${actionBandHtml}
  </table>`;

  const { html, text } = renderEmailShell({
    preheader,
    contentHtml,
    contentText,
    refNumber: ref,
    docType: "Range proposal",
    // Estimate ends in its own Accept / Decline action area — drop the
    // signature footer so the document closes cleanly into a decision.
    // Acknowledgement email keeps the signature (default true).
    includeSignatureFooter: false,
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
