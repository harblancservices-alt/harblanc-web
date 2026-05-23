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
  | "estimate_resent"
  | "finalized_quote_resent"
  | "bol_resent"
  | "estimate_bounced"
  | "finalized_quote_bounced"
  | "bol_bounced"
  | "email_complained"
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
  // Phase Q1: resend event payloads. Carry both IDs so the timeline can
  // link the redelivery back to the original send without a join, and
  // capture the (possibly-overridden) recipient + optional operator note.
  estimate_resent: {
    newEstimateId: string;
    resentFromId: string;
    to: string;
    emailId: string | null;
    reason: string | null;
  };
  finalized_quote_resent: {
    newFinalizedQuoteId: string;
    resentFromId: string;
    finalizedQuoteNumber: string;
    to: string;
    emailId: string | null;
    reason: string | null;
  };
  bol_resent: {
    newBolId: string;
    resentFromId: string;
    bolNumber: string;
    to: string;
    emailId: string | null;
    reason: string | null;
  };
  // Phase Q2: bounce ingestion. Emitted by the /api/resend-webhook route
  // after matching an incoming bounce/complaint to a sent row by
  // sent_email_id. Carries the document id so the timeline can render
  // without a join, and the upstream bounce reason verbatim so operators
  // can decide whether to re-send (soft bounce) or chase a new address
  // (hard bounce). `kind` mirrors the persisted `bounce_kind` column on
  // the same row.
  estimate_bounced: {
    estimateId: string;
    emailId: string;
    to: string;
    kind: "hard" | "soft" | "complaint";
    reason: string | null;
  };
  finalized_quote_bounced: {
    finalizedQuoteId: string;
    finalizedQuoteNumber: string;
    emailId: string;
    to: string;
    kind: "hard" | "soft" | "complaint";
    reason: string | null;
  };
  bol_bounced: {
    bolId: string;
    bolNumber: string;
    emailId: string;
    to: string;
    kind: "hard" | "soft" | "complaint";
    reason: string | null;
  };
  // Distinct from the three bounce types: a complaint is an "I marked
  // this as spam" report. Persisted on the same row as bounce_kind =
  // 'complaint', but emitted as its own event kind so the timeline can
  // call it out separately from a delivery failure (operationally
  // different — a complaint is a deliverability reputation hazard).
  email_complained: {
    docType: "estimate" | "finalized_quote" | "bol";
    docId: string;
    docNumber: string | null;
    emailId: string;
    to: string;
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
