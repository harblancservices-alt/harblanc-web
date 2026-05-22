import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Typed insert helper for the dispatch_events timeline. Keeps the
 * `kind` strings and payload shapes consistent across the API route
 * (where leads land + emails fire) and server actions (where status
 * changes and estimate sends happen).
 *
 * Failure is logged but NOT thrown — events are observability; missing
 * an event must never block the operational action it was meant to
 * describe.
 */

export type DispatchEventKind =
  | "lead_received"
  | "ack_sent"
  | "ack_failed"
  | "dispatch_alert_sent"
  | "dispatch_alert_failed"
  | "status_changed"
  | "estimate_draft_saved"
  | "estimate_sent"
  | "estimate_send_failed"
  | "pdf_generated"
  | "note";

export type DispatchEventPayloadByKind = {
  lead_received: { source: "quick_quote_form" };
  ack_sent: { emailId: string | null; to: string };
  ack_failed: { reason: string; to: string };
  dispatch_alert_sent: { emailId: string | null };
  dispatch_alert_failed: { reason: string };
  status_changed: { from: string; to: string };
  estimate_draft_saved: { linehaulLow: number | null; linehaulHigh: number | null };
  estimate_sent: {
    emailId: string | null;
    linehaulLow: number | null;
    linehaulHigh: number | null;
    to: string;
  };
  estimate_send_failed: { reason: string; to: string };
  pdf_generated: { quoteNumber: string };
  note: { body: string };
};

export async function logDispatchEvent<K extends DispatchEventKind>(
  sb: SupabaseClient,
  quoteRequestId: string,
  kind: K,
  payload: DispatchEventPayloadByKind[K],
): Promise<void> {
  const { error } = await sb
    .from("dispatch_events")
    .insert({ quote_request_id: quoteRequestId, kind, payload });
  if (error) {
    // Observability event — log and move on. NEVER throw.
    console.error("[dispatch_events] insert failed", {
      kind,
      quoteRequestId,
      code: error.code,
      message: error.message,
    });
  }
}
