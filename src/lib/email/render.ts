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
  const subject = `Quote request received — ${lane}`.slice(0, 180);
  const preheader =
    "Dispatch is reviewing your shipment details. Expect a response within approximately one hour.";
  const ref = `HB-${refNumber(payload.leadId)}`;
  const phoneDigits = company.dispatchPhone.replace(/[^\d+]/g, "");

  const contentText = [
    "QUOTE REQUEST",
    "RECEIVED",
    "",
    "We've received your freight quote request.",
    "",
    `REFERENCE NUMBER     ${ref}`,
    "",
    "NEXT STEP            Dispatch is reviewing your shipment details.",
    "",
    "EXPECTED RESPONSE    Within approximately 1 hour.",
  ].join("\n");

  // Site-signature eyebrow: small red leading bar + red mono label.
  // Matches the website's <p className="flex items-center gap-3
  // font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
  //   <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
  //   ...label...
  // </p> pattern used on hero eyebrows and section markers.
  const eyebrow = (label: string): string => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
      <tr>
        <td style="padding:0 10px 0 0;vertical-align:middle">
          <div style="width:4px;height:14px;background:#dc2626;font-size:1px;line-height:1px">&nbsp;</div>
        </td>
        <td style="padding:0;vertical-align:middle">
          <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:700;letter-spacing:0.22em;color:#dc2626;text-transform:uppercase;line-height:1">${escapeHtml(label)}</p>
        </td>
      </tr>
    </table>
  `;

  // Stacked section: eyebrow with red leading bar above value.
  const section = (
    label: string,
    valueHtml: string,
    topPad: number,
  ): string => `
    <tr>
      <td style="padding:${topPad}px 40px 0;background:#ffffff">
        ${eyebrow(label)}
        <div style="height:14px;font-size:1px;line-height:1px">&nbsp;</div>
        ${valueHtml}
      </td>
    </tr>
  `;

  const refValueHtml = `<p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:32px;font-weight:900;color:#0a0a0a;line-height:1.05;letter-spacing:-0.01em">${escapeHtml(ref)}</p>`;
  const nextStepValueHtml = `<p style="margin:0;font-family:${SANS};font-size:18px;font-weight:500;color:#0a0a0a;line-height:1.45">Dispatch is reviewing your shipment details.</p>`;
  const responseValueHtml = `<p style="margin:0;font-family:${SANS};font-size:18px;font-weight:500;color:#0a0a0a;line-height:1.45">Within approximately 1 hour.</p>`;

  void lane;
  void phoneDigits;

  const contentHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">

      <!-- ── Hero-pattern headline ─────────────────────────────────
           Site pattern: line 1 plain, line 2 with leading red bar
           (mirrors "Freight, hauled / [bar] direct."). HUGE display
           scale with tracking-tight. -->
      <tr>
        <td style="padding:64px 40px 0;background:#ffffff">
          <p style="margin:0;font-family:${SANS};font-size:52px;font-weight:900;letter-spacing:-0.018em;color:#0a0a0a;text-transform:uppercase;line-height:0.95">Quote Request</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px">
            <tr>
              <td style="padding:0 14px 0 0;vertical-align:middle">
                <div style="width:8px;height:36px;background:#dc2626;font-size:1px;line-height:1px">&nbsp;</div>
              </td>
              <td style="padding:0;vertical-align:middle">
                <p style="margin:0;font-family:${SANS};font-size:52px;font-weight:900;letter-spacing:-0.018em;color:#0a0a0a;text-transform:uppercase;line-height:0.95">Received</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Intro statement -->
      <tr>
        <td style="padding:28px 40px 0;background:#ffffff">
          <p style="margin:0;font-family:${SANS};font-size:18px;font-weight:400;color:#0a0a0a;line-height:1.55">We&rsquo;ve received your freight quote request.</p>
        </td>
      </tr>

      ${section("Reference Number", refValueHtml, 48)}
      ${section("Next Step", nextStepValueHtml, 36)}
      ${section("Expected Response", responseValueHtml, 36)}

      <!-- Bottom padding before footer divider -->
      <tr>
        <td style="padding:0 40px 40px;background:#ffffff;font-size:1px;line-height:1px">&nbsp;</td>
      </tr>
    </table>
  `;

  const { html, text } = renderEmailShell({
    preheader,
    contentHtml,
    contentText,
    refNumber: ref,
    docType: "Acknowledgement",
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

  // ── Plain-text body — hero, then 4 sections, then CTAs ────────────────
  // Same content as the HTML, just stacked linearly for plaintext.
  const equipmentLines: string[] = payload.equipmentNotes
    ? payload.equipmentNotes
        .split(/\s*[—–]\s*/)
        .map((s) => s.trim().replace(/^./, (c) => c.toUpperCase()))
        .filter((s) => s.length > 0)
    : [];

  const pickupRaw = (payload.pickupTimingNotes || payload.load.pickup).trim();
  const pickupStripped = pickupRaw.replace(/^pickup window\s*/i, "");
  const pickupLines: string[] = pickupStripped
    .split(/\.\s+/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length > 0);

  // CTA hrefs — production always supplies real URLs at send time. In
  // preview (and before token issuance) acceptUrl/declineUrl can be null;
  // we use "#" as a layout-only placeholder so the buttons are always
  // visible in /admin/previews-2. The button label and styling are
  // identical in both cases.
  const acceptHref = payload.acceptUrl ?? "#";
  const declineHref = payload.declineUrl ?? "#";

  const textLines: string[] = [
    "QUOTE RANGE",
    "",
    totalRate,
    `Estimated range for shipment ${lane}`,
    "",
    "────────────────────────────────",
    "LANE",
    `${payload.lane.pickupZip} → ${payload.lane.deliveryZip}`,
    "",
    "FREIGHT",
    payload.load.commodity,
    payload.load.weight,
    "",
  ];
  if (equipmentLines.length > 0) {
    textLines.push("EQUIPMENT");
    for (const l of equipmentLines) textLines.push(l);
    textLines.push("");
  }
  textLines.push("PICKUP WINDOW");
  for (const l of pickupLines) textLines.push(l);
  textLines.push("");
  textLines.push("────────────────────────────────");
  textLines.push(`ACCEPT RANGE:   ${acceptHref}`);
  textLines.push(`DECLINE RANGE:  ${declineHref}`);
  textLines.push("────────────────────────────────");
  if (payload.expirationAt) {
    textLines.push("");
    textLines.push(
      `Valid through ${validThrough}. Subject to final shipment details and capacity at dispatch.`,
    );
  }
  if (payload.closingLine.trim().length > 0) {
    textLines.push("");
    textLines.push(payload.closingLine);
  }
  const contentText = textLines.join("\n");

  // ── HTML body — 2-COL LAYOUT ────────────────────────────────────────────
  // Hero stays full-width (price needs the breathing room). Below the
  // hairline, the 4 shipment-detail sections split into two columns so
  // the CTAs land higher in the preview. Layout:
  //
  //   ┌───────────────────────┬───────────────────────┐
  //   │  LANE                  │  EQUIPMENT             │
  //   │  80216 → 75201         │  Step-deck preferred   │
  //   │                        │  Tarping not required  │
  //   │  FREIGHT               │  Covered facility ...  │
  //   │  CNC vertical mach...  │                        │
  //   │  12,400 lbs            │  PICKUP WINDOW         │
  //   │                        │  Mon 6/9 0800-1200     │
  //   │                        │  Receiver flexible ... │
  //   └───────────────────────┴───────────────────────┘

  // Eyebrow style — used 4 times. Two variants:
  //   topEyebrow: margin 0 (first eyebrow in a column)
  //   midEyebrow: margin-top 22px (second eyebrow in same column)
  const eyebrowBase = `font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:700;letter-spacing:0.22em;color:#dc2626;text-transform:uppercase;line-height:1.4`;
  const topEyebrow = (label: string): string =>
    `<p style="margin:0;${eyebrowBase}">${escapeHtml(label)}</p>`;
  const midEyebrow = (label: string): string =>
    `<p style="margin:22px 0 0;${eyebrowBase}">${escapeHtml(label)}</p>`;

  // LEFT column — LANE + FREIGHT.
  const leftColInner = [
    topEyebrow("Lane"),
    `<p style="margin:8px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:24px;font-weight:800;color:#0a0a0a;line-height:1.1;letter-spacing:-0.01em">${escapeHtml(payload.lane.pickupZip)} &rarr; ${escapeHtml(payload.lane.deliveryZip)}</p>`,
    midEyebrow("Freight"),
    `<p style="margin:8px 0 0;font-family:${SANS};font-size:16px;font-weight:700;color:#0a0a0a;line-height:1.3">${escapeHtml(payload.load.commodity)}</p>`,
    `<p style="margin:2px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:13px;font-weight:500;color:#0a0a0a;line-height:1.4">${escapeHtml(payload.load.weight)}</p>`,
  ].join("");

  // RIGHT column — EQUIPMENT + PICKUP WINDOW.
  const equipmentBlock = equipmentLines.length > 0
    ? [
        topEyebrow("Equipment"),
        ...equipmentLines.map(
          (l, idx) =>
            `<p style="margin:${idx === 0 ? "8px" : "2px"} 0 0;font-family:${SANS};font-size:13px;font-weight:500;color:#0a0a0a;line-height:1.4">${escapeHtml(l)}</p>`,
        ),
      ].join("")
    : "";

  const pickupBlock = pickupLines.length > 0
    ? [
        equipmentBlock ? midEyebrow("Pickup Window") : topEyebrow("Pickup Window"),
        ...pickupLines.map((l, idx) => {
          const styles =
            idx === 0
              ? `margin:8px 0 0;font-family:${SANS};font-size:14px;font-weight:600;color:#0a0a0a;line-height:1.4`
              : `margin:2px 0 0;font-family:${SANS};font-size:13px;font-weight:500;color:#0a0a0a;line-height:1.4`;
          return `<p style="${styles}">${escapeHtml(l)}</p>`;
        }),
      ].join("")
    : "";

  const rightColInner = equipmentBlock + pickupBlock;

  // 2-col grid — 48% / 4% gutter / 48%.
  const twoColGridHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
    <tr>
      <td width="48%" valign="top" style="width:48%;vertical-align:top">${leftColInner}</td>
      <td width="4%" style="width:4%;font-size:1px;line-height:1px">&nbsp;</td>
      <td width="48%" valign="top" style="width:48%;vertical-align:top">${rightColInner}</td>
    </tr>
  </table>`;

  // ACCEPT / DECLINE — always rendered. Real URLs in production, "#"
  // placeholders in preview (see acceptHref/declineHref above).
  const actionsHtml = `<tr>
        <td style="padding:0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
            <tr>
              <td width="48%" valign="top" style="width:48%;vertical-align:top">
                <a href="${escapeHtml(acceptHref)}" style="display:block;box-sizing:border-box;background:#dc2626;color:#ffffff;font-family:${SANS};${MONO_FEATURES};font-size:13px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;text-decoration:none;text-align:center;padding:18px 16px;line-height:1.2;box-shadow:inset 0 0 0 2px #ffffff" bgcolor="#dc2626">Accept Range</a>
              </td>
              <td width="4%" style="width:4%;font-size:1px;line-height:1px">&nbsp;</td>
              <td width="48%" valign="top" style="width:48%;vertical-align:top">
                <a href="${escapeHtml(declineHref)}" style="display:block;box-sizing:border-box;background:#ffffff;color:#0a0a0a;font-family:${SANS};${MONO_FEATURES};font-size:13px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;text-decoration:none;text-align:center;padding:16px 14px;line-height:1.2;border:2px solid #0a0a0a" bgcolor="#ffffff">Decline Range</a>
              </td>
            </tr>
          </table>
          ${
            payload.expirationAt
              ? `<p style="margin:14px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:500;letter-spacing:0.10em;color:#0a0a0a;line-height:1.5;text-align:center;text-transform:uppercase">Valid through ${escapeHtml(validThrough)} &middot; Subject to final shipment details &amp; capacity at dispatch</p>`
              : ""
          }
        </td>
      </tr>`;

  // Closing line — kept compact and black, no gray.
  const closingHtml = payload.closingLine.trim().length > 0
    ? `<tr>
        <td style="padding:0 0 18px 0">
          <p style="margin:0;font-family:${SANS};font-size:14px;font-weight:500;color:#0a0a0a;line-height:1.5">${escapeHtml(payload.closingLine)}</p>
        </td>
      </tr>`
    : "";

  const contentHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
    <!-- HERO ─────────────────────────────────────────────────────────── -->
    <tr>
      <td style="padding:26px 40px 6px">
        <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:700;letter-spacing:0.30em;color:#dc2626;text-transform:uppercase;line-height:1.4">Quote Range</p>
        <p style="margin:8px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:52px;font-weight:900;color:#0a0a0a;line-height:1.02;letter-spacing:-0.025em">${escapeHtml(totalRate)}</p>
        <p style="margin:12px 0 0;font-family:${SANS};font-size:14px;font-weight:500;color:#0a0a0a;line-height:1.5">Estimated range for shipment <span style="font-family:${SANS};${MONO_FEATURES};font-weight:700">${escapeHtml(payload.lane.pickupZip)} &rarr; ${escapeHtml(payload.lane.deliveryZip)}</span>.</p>
      </td>
    </tr>
    <!-- HAIRLINE ─────────────────────────────────────────────────────── -->
    <tr>
      <td style="padding:18px 40px 0">
        <div style="height:1px;background:#0a0a0a;font-size:1px;line-height:1px">&nbsp;</div>
      </td>
    </tr>
    <!-- 2-COL GRID — LANE+FREIGHT | EQUIPMENT+PICKUP WINDOW ───────── -->
    <tr>
      <td style="padding:18px 40px 0">
        ${twoColGridHtml}
      </td>
    </tr>
    <!-- HAIRLINE ─────────────────────────────────────────────────────── -->
    <tr>
      <td style="padding:18px 40px 0">
        <div style="height:1px;background:#0a0a0a;font-size:1px;line-height:1px">&nbsp;</div>
      </td>
    </tr>
    <!-- CLOSING + CTAs ─────────────────────────────────────────────── -->
    <tr>
      <td style="padding:18px 40px 22px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
          ${closingHtml}
          ${actionsHtml}
        </table>
      </td>
    </tr>
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
