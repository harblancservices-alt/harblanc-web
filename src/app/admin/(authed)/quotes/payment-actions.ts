"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logDispatchEvent } from "@/lib/dispatch/events";
import { type LeadStatus } from "@/lib/dispatch/status";
import {
  computePaymentSummary,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/dispatch/payment";

/**
 * Phase P1B — manual admin payment recording server actions.
 *
 * No UI yet (Phase P1C). No external integrations (Phase P3). No
 * customer-facing payment portal (Phase P3). These actions are
 * called only from admin server components / forms and operate via
 * the service-role Supabase client.
 *
 * Workflow gate:
 *   - sendFinalizedQuote (finalized-quote-actions.ts) auto-advances
 *     booked → awaiting_payment.
 *   - recordPayment auto-advances awaiting_payment → ready_to_dispatch
 *     iff the new total paid reaches the FQ's total_amount AND the
 *     event hasn't already fired for this FQ. The transition is the
 *     primary thing this file exists to enable.
 *
 * Event emissions:
 *   - payment_recorded — on every successful payment insert
 *   - payment_completed — exactly once, when paid_so_far first crosses
 *     finalized_quotes.total_amount
 *   - status_changed — when paid-in-full advances the lead status
 *   - note — on soft-delete of a payment (audit breadcrumb)
 */

// ─── primitive parsers (mirror finalized-quote-actions style) ───────────

function s(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const str = String(v).trim();
  return str.length === 0 ? null : str;
}

function n(v: FormDataEntryValue | null): number | null {
  const str = s(v);
  if (str === null) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

// ─── recordPayment ──────────────────────────────────────────────────────

/**
 * Insert a payment row, emit observability events, and possibly advance
 * the lead status if this receipt closes the balance on the finalized
 * quote.
 *
 * FormData keys (operator UI in Phase P1C must match these — these keys
 * are NOT used anywhere yet, so they're free to define now):
 *   finalized_quote_id  : string (UUID)
 *   quote_request_id    : string (UUID)
 *   amount              : decimal as string, > 0
 *   method              : one of PAYMENT_METHODS
 *   received_at         : ISO date or datetime (operator-entered)
 *   reference           : string, optional (check #, wire conf, etc.)
 *   notes               : string, optional (free-form note)
 *   currency            : string, optional (defaults "USD")
 *
 * Throws on validation failure. Side effects after the payment row is
 * inserted are best-effort: a logging failure does NOT throw (the
 * money was recorded, that's what matters). Mirror of the pattern in
 * actions.ts sendEstimate.
 */
export async function recordPayment(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  // ── 1. Parse + validate inputs ─────────────────────────────────────────
  const finalizedQuoteId = s(formData.get("finalized_quote_id"));
  const quoteRequestId = s(formData.get("quote_request_id"));
  const amount = n(formData.get("amount"));
  const methodRaw = s(formData.get("method"));
  const receivedAt = s(formData.get("received_at"));
  const reference = s(formData.get("reference"));
  const notes = s(formData.get("notes"));
  const currency = s(formData.get("currency")) ?? "USD";

  if (!finalizedQuoteId) throw new Error("Missing finalized_quote_id.");
  if (!quoteRequestId) throw new Error("Missing quote_request_id.");
  if (amount === null) throw new Error("Amount is required.");
  if (amount <= 0) throw new Error("Amount must be greater than zero.");
  if (!methodRaw) throw new Error("Payment method is required.");
  if (!(PAYMENT_METHODS as readonly string[]).includes(methodRaw)) {
    throw new Error(`Unknown payment method: ${methodRaw}`);
  }
  if (!receivedAt) throw new Error("Received-at date is required.");

  // Normalize received_at: accept either a date (YYYY-MM-DD from <input type="date">)
  // or a full ISO timestamp. Reject anything that can't be parsed.
  const receivedAtIso = new Date(receivedAt).toISOString();
  if (Number.isNaN(new Date(receivedAtIso).getTime())) {
    throw new Error(`received_at could not be parsed: ${receivedAt}`);
  }

  const method = methodRaw as PaymentMethod;

  const sb = createServiceRoleClient();

  // ── 2. Verify FQ exists and matches the quote_request ─────────────────
  // We need total_amount + finalized_quote_number for event payloads,
  // and we want to defend against ID-mismatch (FQ belongs to a different
  // lead than the form claims).
  const { data: fq, error: fqErr } = await sb
    .from("finalized_quotes")
    .select(
      "id, finalized_quote_number, quote_request_id, total_amount, sent_at",
    )
    .eq("id", finalizedQuoteId)
    .maybeSingle<{
      id: string;
      finalized_quote_number: string;
      quote_request_id: string;
      total_amount: string | number | null;
      sent_at: string | null;
    }>();

  if (fqErr) throw new Error(`Finalized quote lookup failed: ${fqErr.message}`);
  if (!fq) throw new Error("Finalized quote not found.");
  if (fq.quote_request_id !== quoteRequestId) {
    throw new Error(
      "quote_request_id does not match the finalized quote's parent lead.",
    );
  }
  // We deliberately allow payments against an unsent FQ — a deposit may
  // arrive on the back of an emailed PDF before formal send. The status
  // gate handles the rest.

  const totalAmount =
    fq.total_amount === null || fq.total_amount === undefined
      ? null
      : Number(fq.total_amount);

  // ── 3. Snapshot the BEFORE-summary so we can detect the paid-in-full edge.
  // We sum non-deleted payments for this FQ. (The new payment isn't
  // inserted yet, so this reflects state before recording.)
  const { data: existingPayments, error: existErr } = await sb
    .from("payments")
    .select("amount")
    .eq("finalized_quote_id", finalizedQuoteId)
    .is("deleted_at", null);
  if (existErr) {
    throw new Error(`Existing-payments lookup failed: ${existErr.message}`);
  }

  const beforeSummary = computePaymentSummary(
    totalAmount,
    (existingPayments ?? []).map((p) => ({
      amount: Number(p.amount),
      currency: "USD",
    })),
  );

  // ── 4. Insert the payment row ─────────────────────────────────────────
  const recordedAt = new Date().toISOString();
  const { data: inserted, error: insertErr } = await sb
    .from("payments")
    .insert({
      finalized_quote_id: finalizedQuoteId,
      quote_request_id: quoteRequestId,
      amount,
      currency,
      received_at: receivedAtIso,
      method,
      reference,
      notes,
      recorded_by: user.id,
      recorded_at: recordedAt,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertErr || !inserted) {
    throw new Error(
      `Payment insert failed: ${insertErr?.message ?? "no row returned"}`,
    );
  }

  // ── 5. Emit payment_recorded ─────────────────────────────────────────
  await logDispatchEvent(sb, quoteRequestId, "payment_recorded", {
    paymentId: inserted.id,
    finalizedQuoteId,
    finalizedQuoteNumber: fq.finalized_quote_number,
    amount,
    currency,
    method,
    reference,
  });

  // ── 6. Compute AFTER-summary and detect paid-in-full transition ──────
  const afterSummary = computePaymentSummary(totalAmount, [
    ...(existingPayments ?? []).map((p) => ({
      amount: Number(p.amount),
      currency: "USD",
    })),
    { amount, currency },
  ]);

  const justBecamePaidInFull =
    !beforeSummary.isPaidInFull && afterSummary.isPaidInFull;

  if (justBecamePaidInFull && totalAmount !== null) {
    // Emit payment_completed exactly once per FQ.
    await logDispatchEvent(sb, quoteRequestId, "payment_completed", {
      finalizedQuoteId,
      finalizedQuoteNumber: fq.finalized_quote_number,
      totalAmount,
      paidTotal: afterSummary.paid,
    });

    // ── 7. Auto-advance lead status if currently awaiting_payment ──────
    // Mirror of the pattern in sendEstimate (actions.ts L808-825): read
    // lead status, only advance from the expected source state, log the
    // status_changed event AFTER updating, never throw on side-effect
    // failures (the payment was recorded — that's what matters).
    const { data: lead, error: leadErr } = await sb
      .from("quote_requests")
      .select("lead_status")
      .eq("id", quoteRequestId)
      .maybeSingle<{ lead_status: LeadStatus }>();

    if (leadErr) {
      console.error("[recordPayment] lead lookup failed (no status advance)", {
        quoteRequestId,
        message: leadErr.message,
      });
    } else if (lead && lead.lead_status === "awaiting_payment") {
      const previous = lead.lead_status;
      const now = new Date().toISOString();
      const { error: statusErr } = await sb
        .from("quote_requests")
        .update({
          lead_status: "ready_to_dispatch",
          lead_status_updated_at: now,
        })
        .eq("id", quoteRequestId);
      if (statusErr) {
        console.error("[recordPayment] status advance failed", {
          quoteRequestId,
          message: statusErr.message,
        });
      } else {
        await logDispatchEvent(sb, quoteRequestId, "status_changed", {
          from: previous,
          to: "ready_to_dispatch",
        });
      }
    }
  }

  // ── 8. Revalidate the surfaces that render this lead ──────────────────
  revalidatePath(`/admin/quotes/${quoteRequestId}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}

// ─── softDeletePayment ──────────────────────────────────────────────────

/**
 * Mark a payment row as soft-deleted. Soft-delete does NOT reverse a
 * prior payment_completed event or roll back a status auto-advance —
 * those are append-only history. The operator must manually flip lead
 * status back via StatusSelector if needed.
 *
 * A `note` event is emitted so the timeline shows the soft-delete with
 * a human-readable description.
 */
export async function softDeletePayment(paymentId: string): Promise<void> {
  await requireAdmin();
  if (!paymentId) throw new Error("Missing payment id.");

  const sb = createServiceRoleClient();

  // Read the row first so we can write a meaningful note + revalidate.
  const { data: row, error: readErr } = await sb
    .from("payments")
    .select("id, quote_request_id, amount, currency, method, reference, deleted_at")
    .eq("id", paymentId)
    .maybeSingle<{
      id: string;
      quote_request_id: string;
      amount: string | number;
      currency: string;
      method: string;
      reference: string | null;
      deleted_at: string | null;
    }>();

  if (readErr) throw new Error(`Payment lookup failed: ${readErr.message}`);
  if (!row) throw new Error("Payment not found.");
  if (row.deleted_at) {
    // Idempotent — already deleted is a no-op rather than an error.
    return;
  }

  const now = new Date().toISOString();
  // Soft-delete with the same 30-day delete_after window pattern used on
  // other ops tables (delete_after is purely informational here — actual
  // hard delete is handled by the lead's permanently-delete cascade).
  const deleteAfter = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error: updErr } = await sb
    .from("payments")
    .update({ deleted_at: now, delete_after: deleteAfter })
    .eq("id", paymentId);
  if (updErr) {
    throw new Error(`Payment soft-delete failed: ${updErr.message}`);
  }

  const amountNum = Number(row.amount);
  const refPart = row.reference ? ` (${row.reference})` : "";
  await logDispatchEvent(sb, row.quote_request_id, "note", {
    body: `Payment soft-deleted: ${amountNum.toLocaleString("en-US", {
      style: "currency",
      currency: row.currency ?? "USD",
    })} via ${row.method}${refPart}`,
  });

  revalidatePath(`/admin/quotes/${row.quote_request_id}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}
