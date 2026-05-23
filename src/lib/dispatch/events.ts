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
  | "estimate_accepted"
  | "estimate_declined"
  | "intake_submitted"
  | "finalized_quote_draft_started"
  | "finalized_quote_draft_saved"
  | "finalized_quote_preview_built"
  | "finalized_quote_sent"
  | "finalized_quote_send_failed"
  | "bol_draft_started"
  | "bol_draft_saved"
  | "bol_preview_built"
  | "bol_sent"
  | "bol_send_failed"
  | "pdf_generated"
  | "payment_recorded"
  | "payment_completed"
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
  estimate_accepted: { estimateId: string; mode: "save" | "submit" };
  estimate_declined: { estimateId: string; reason: string | null };
  intake_submitted: { estimateId: string };
  finalized_quote_draft_started: {
    finalizedQuoteId: string;
    finalizedQuoteNumber: string;
    dispatchEstimateId: string;
  };
  finalized_quote_draft_saved: {
    finalizedQuoteId: string;
    finalizedQuoteNumber: string;
    totalAmount: number | null;
  };
  finalized_quote_preview_built: {
    finalizedQuoteId: string;
    finalizedQuoteNumber: string;
    totalAmount: number | null;
  };
  finalized_quote_sent: {
    finalizedQuoteId: string;
    finalizedQuoteNumber: string;
    totalAmount: number | null;
    emailId: string | null;
    to: string;
  };
  finalized_quote_send_failed: {
    finalizedQuoteId: string;
    finalizedQuoteNumber: string;
    reason: string;
    to: string;
  };
  bol_draft_started: {
    bolId: string;
    bolNumber: string;
    finalizedQuoteId: string;
  };
  bol_draft_saved: {
    bolId: string;
    bolNumber: string;
  };
  bol_preview_built: {
    bolId: string;
    bolNumber: string;
  };
  bol_sent: {
    bolId: string;
    bolNumber: string;
    emailId: string | null;
    to: string;
  };
  bol_send_failed: {
    bolId: string;
    bolNumber: string;
    reason: string;
    to: string;
  };
  pdf_generated: { quoteNumber: string };
  // Phase P1B: emitted by recordPayment in payment-actions.ts on every
  // successful insert into the payments table. Carries enough context
  // for CommTimeline's describe() to render the row without a join.
  payment_recorded: {
    paymentId: string;
    finalizedQuoteId: string;
    finalizedQuoteNumber: string;
    amount: number;
    currency: string;
    method: string;
    reference: string | null;
  };
  // Phase P1B: emitted ONCE when the cumulative paid amount first
  // crosses the FQ's total_amount. Subsequent over-payments do not
  // re-emit; soft-deleting a payment does NOT reverse this event.
  payment_completed: {
    finalizedQuoteId: string;
    finalizedQuoteNumber: string;
    totalAmount: number;
    paidTotal: number;
  };
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
    // Observability event -- log and move on. NEVER throw.
    console.error("[dispatch_events] insert failed", {
      kind,
      quoteRequestId,
      code: error.code,
      message: error.message,
    });
  }
}
