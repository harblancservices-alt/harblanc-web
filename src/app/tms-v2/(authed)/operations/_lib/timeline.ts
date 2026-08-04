import type { DispatchEventKind, DispatchEventPayloadByKind } from "@/lib/dispatch/events";

/**
 * Activity-timeline label dictionary for the pipeline detail page
 * (v2-design.md §14's Overview event history, current-tms-audit.md §13).
 * A condensed, /tms-v2-styled sibling of `/admin`'s
 * `quotes/[id]/tabs/TimelineTab.tsx` `DESCRIBERS` table — same
 * `Record<DispatchEventKind, ...>` exhaustiveness contract (a new kind
 * added to `lib/dispatch/events.ts` without a label here is a compile
 * error) and the same "prettify, don't drop" fallback for unknown kinds,
 * rewritten as plain data (no admin-specific JSX/classes) since /tms-v2
 * renders this list itself via <DateTimeCST>/hairline rows, not admin's
 * mono/uppercase timeline component.
 */

function joinPieces(parts: ReadonlyArray<string>): string {
  return parts.filter((s) => s && s.length > 0).join(" · ");
}

function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function range(low: number | null | undefined, high: number | null | undefined): string {
  const lo = usd(low);
  const hi = usd(high);
  if (lo && hi) return `${lo}–${hi}`;
  return lo || hi;
}

type Describer = { label: string; describe: (payload: unknown) => string };

const DESCRIBERS: Record<DispatchEventKind, Describer> = {
  lead_received: { label: "Lead received", describe: () => "" },
  ack_sent: { label: "Acknowledgement sent", describe: (p) => { const x = p as DispatchEventPayloadByKind["ack_sent"]; return x?.to ? `to ${x.to}` : ""; } },
  ack_failed: { label: "Acknowledgement failed", describe: (p) => { const x = p as DispatchEventPayloadByKind["ack_failed"]; return joinPieces([x?.to ? `to ${x.to}` : "", x?.reason ?? ""]); } },
  dispatch_alert_sent: { label: "Internal dispatch alert sent", describe: () => "" },
  dispatch_alert_failed: { label: "Internal dispatch alert failed", describe: (p) => (p as DispatchEventPayloadByKind["dispatch_alert_failed"])?.reason ?? "" },
  status_changed: { label: "Status changed", describe: (p) => { const x = p as DispatchEventPayloadByKind["status_changed"]; return x?.from && x?.to ? `${x.from} → ${x.to}` : ""; } },
  estimate_draft_saved: { label: "Range draft saved", describe: (p) => { const x = p as DispatchEventPayloadByKind["estimate_draft_saved"]; return range(x?.linehaulLow, x?.linehaulHigh); } },
  estimate_sent: { label: "Range proposal sent", describe: (p) => { const x = p as DispatchEventPayloadByKind["estimate_sent"]; return joinPieces([x?.to ? `to ${x.to}` : "", range(x?.linehaulLow, x?.linehaulHigh)]); } },
  estimate_send_failed: { label: "Range proposal send failed", describe: (p) => { const x = p as DispatchEventPayloadByKind["estimate_send_failed"]; return joinPieces([x?.to ? `to ${x.to}` : "", x?.reason ?? ""]); } },
  estimate_accepted: { label: "Range proposal accepted", describe: (p) => (p as DispatchEventPayloadByKind["estimate_accepted"])?.mode ?? "" },
  estimate_declined: { label: "Range proposal declined", describe: (p) => (p as DispatchEventPayloadByKind["estimate_declined"])?.reason ?? "" },
  intake_submitted: { label: "Shipment intake submitted", describe: () => "" },
  intake_upload_added: { label: "File uploaded", describe: (p) => (p as DispatchEventPayloadByKind["intake_upload_added"])?.originalFilename ?? "" },
  intake_upload_removed: { label: "File removed", describe: () => "" },
  finalized_quote_draft_started: { label: "Finalized quote started", describe: (p) => { const n = (p as DispatchEventPayloadByKind["finalized_quote_draft_started"])?.finalizedQuoteNumber; return n ? `#${n}` : ""; } },
  finalized_quote_draft_saved: { label: "Finalized quote draft saved", describe: (p) => { const x = p as DispatchEventPayloadByKind["finalized_quote_draft_saved"]; return joinPieces([x?.finalizedQuoteNumber ? `#${x.finalizedQuoteNumber}` : "", usd(x?.totalAmount)]); } },
  finalized_quote_preview_built: { label: "Finalized quote preview built", describe: (p) => { const x = p as DispatchEventPayloadByKind["finalized_quote_preview_built"]; return joinPieces([x?.finalizedQuoteNumber ? `#${x.finalizedQuoteNumber}` : "", usd(x?.totalAmount)]); } },
  finalized_quote_sent: { label: "Finalized quote sent", describe: (p) => { const x = p as DispatchEventPayloadByKind["finalized_quote_sent"]; return joinPieces([x?.finalizedQuoteNumber ? `#${x.finalizedQuoteNumber}` : "", x?.to ? `to ${x.to}` : "", usd(x?.totalAmount)]); } },
  finalized_quote_send_failed: { label: "Finalized quote send failed", describe: (p) => { const x = p as DispatchEventPayloadByKind["finalized_quote_send_failed"]; return joinPieces([x?.finalizedQuoteNumber ? `#${x.finalizedQuoteNumber}` : "", x?.to ? `to ${x.to}` : "", x?.reason ?? ""]); } },
  finalized_quote_confirmed: { label: "Finalized quote confirmed", describe: (p) => { const n = (p as DispatchEventPayloadByKind["finalized_quote_confirmed"])?.finalizedQuoteNumber; return n ? `#${n}` : ""; } },
  bol_draft_started: { label: "BOL started", describe: (p) => { const n = (p as DispatchEventPayloadByKind["bol_draft_started"])?.bolNumber; return n ? `#${n}` : ""; } },
  bol_draft_saved: { label: "BOL draft saved", describe: (p) => { const n = (p as DispatchEventPayloadByKind["bol_draft_saved"])?.bolNumber; return n ? `#${n}` : ""; } },
  bol_preview_built: { label: "BOL preview built", describe: (p) => { const n = (p as DispatchEventPayloadByKind["bol_preview_built"])?.bolNumber; return n ? `#${n}` : ""; } },
  bol_sent: { label: "BOL sent", describe: (p) => { const x = p as DispatchEventPayloadByKind["bol_sent"]; return joinPieces([x?.bolNumber ? `#${x.bolNumber}` : "", x?.to ? `to ${x.to}` : ""]); } },
  bol_send_failed: { label: "BOL send failed", describe: (p) => { const x = p as DispatchEventPayloadByKind["bol_send_failed"]; return joinPieces([x?.bolNumber ? `#${x.bolNumber}` : "", x?.to ? `to ${x.to}` : "", x?.reason ?? ""]); } },
  pdf_generated: { label: "PDF generated", describe: (p) => (p as DispatchEventPayloadByKind["pdf_generated"])?.quoteNumber ?? "" },
  payment_recorded: { label: "Payment recorded", describe: (p) => { const x = p as DispatchEventPayloadByKind["payment_recorded"]; return joinPieces([usd(x?.amount), x?.method ? `via ${x.method}` : ""]); } },
  payment_completed: { label: "Payment completed", describe: (p) => { const x = p as DispatchEventPayloadByKind["payment_completed"]; return joinPieces([usd(x?.paidTotal), x?.totalAmount ? `of ${usd(x.totalAmount)}` : ""]); } },
  payment_session_created: { label: "Payment session created", describe: (p) => usd((p as DispatchEventPayloadByKind["payment_session_created"])?.amount) },
  payment_received: { label: "Payment received", describe: (p) => usd((p as DispatchEventPayloadByKind["payment_received"])?.amount) },
  estimate_resent: { label: "Range proposal resent", describe: (p) => { const x = p as DispatchEventPayloadByKind["estimate_resent"]; return joinPieces([x?.to ? `to ${x.to}` : "", x?.reason ?? ""]); } },
  finalized_quote_resent: { label: "Finalized quote resent", describe: (p) => { const x = p as DispatchEventPayloadByKind["finalized_quote_resent"]; return joinPieces([x?.finalizedQuoteNumber ? `#${x.finalizedQuoteNumber}` : "", x?.to ? `to ${x.to}` : ""]); } },
  bol_resent: { label: "BOL resent", describe: (p) => { const x = p as DispatchEventPayloadByKind["bol_resent"]; return joinPieces([x?.bolNumber ? `#${x.bolNumber}` : "", x?.to ? `to ${x.to}` : ""]); } },
  estimate_bounced: { label: "Range proposal bounced", describe: (p) => { const x = p as DispatchEventPayloadByKind["estimate_bounced"]; return joinPieces([x?.kind ? `${x.kind} bounce` : "", x?.to ? `to ${x.to}` : ""]); } },
  finalized_quote_bounced: { label: "Finalized quote bounced", describe: (p) => { const x = p as DispatchEventPayloadByKind["finalized_quote_bounced"]; return joinPieces([x?.finalizedQuoteNumber ? `#${x.finalizedQuoteNumber}` : "", x?.kind ? `${x.kind} bounce` : ""]); } },
  bol_bounced: { label: "BOL bounced", describe: (p) => { const x = p as DispatchEventPayloadByKind["bol_bounced"]; return joinPieces([x?.bolNumber ? `#${x.bolNumber}` : "", x?.kind ? `${x.kind} bounce` : ""]); } },
  email_complained: { label: "Email complaint", describe: (p) => { const x = p as DispatchEventPayloadByKind["email_complained"]; return joinPieces([x?.docType ?? "", x?.to ? `to ${x.to}` : ""]); } },
  note: { label: "Note", describe: (p) => { const body = (p as DispatchEventPayloadByKind["note"])?.body ?? ""; return body.length > 80 ? `${body.slice(0, 80).trim()}…` : body; } },
};

function formatUnknownKind(kind: string): string {
  const cleaned = kind.replace(/_/g, " ").trim();
  if (!cleaned) return "Event";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

export function describeEvent(rawKind: string, payload: unknown): { label: string; description: string } {
  if (rawKind in DESCRIBERS) {
    const entry = DESCRIBERS[rawKind as DispatchEventKind];
    return { label: entry.label, description: entry.describe(payload) };
  }
  return { label: formatUnknownKind(rawKind), description: "" };
}
