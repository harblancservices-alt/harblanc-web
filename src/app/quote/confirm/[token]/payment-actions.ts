"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { logDispatchEvent } from "@/lib/dispatch/events";
import { resolveByConfirmationToken } from "@/lib/quote-token/lookup";
import { getStripeClient } from "@/lib/stripe/server";

/**
 * Customer-facing payment server action for /quote/confirm/[token].
 *
 * Creates a Stripe PaymentIntent and returns its client_secret. The
 * client component mounts a Stripe Elements <PaymentElement> using
 * that secret and a HARBLANC dark-theme Appearance config, so the
 * card form reads as freight paperwork instead of Stripe'''s default.
 *
 * Card data NEVER touches our origin -- Stripe Elements is a
 * tokenization iframe. PCI scope is the same as Embedded Checkout.
 *
 * Trust model (unchanged from the prior Embedded Checkout version):
 *   - No admin auth -- token IS the authorization
 *   - Total, customer email, FQ id all read from DB; client cannot
 *     tamper with the amount
 *   - Pending payments row inserted BEFORE Stripe call; dedupes
 *     rapid double-clicks within 24h
 *   - Cancellation marks the pending row '''cancelled''' with notes
 *
 * Webhook payment_intent.succeeded flips the row to '''completed'''.
 */

export type CreatePaymentSessionResult =
  | { ok: true; clientSecret: string; paymentIntentId: string; amountDue: number }
  | { ok: false; reason: string };

const PENDING_REUSE_HOURS = 24;

export async function createPaymentCheckoutSession(
  token: string,
): Promise<CreatePaymentSessionResult> {
  const resolved = await resolveByConfirmationToken(token);
  if (!resolved.ok) {
    return { ok: false, reason: "This confirmation link isn'''t valid." };
  }

  const { finalizedQuote, lead } = resolved;

  if (!finalizedQuote.confirmedAt) {
    return {
      ok: false,
      reason: "Confirm the finalized quote before paying.",
    };
  }
  if (finalizedQuote.totalAmount == null || finalizedQuote.totalAmount <= 0) {
    return {
      ok: false,
      reason: "This quote has no payable amount on file. Contact dispatch.",
    };
  }
  if (!lead.email || !lead.email.includes("@")) {
    return {
      ok: false,
      reason: "Customer email missing on the lead. Contact dispatch.",
    };
  }

  const sb = createServiceRoleClient();

  // Sum completed payments. If already paid in full, refuse new PI.
  const { data: completedRows, error: paidErr } = await sb
    .from("payments")
    .select("amount")
    .eq("finalized_quote_id", finalizedQuote.id)
    .eq("status", "completed")
    .is("deleted_at", null);
  if (paidErr) {
    return { ok: false, reason: `Payment lookup failed: ${paidErr.message}` };
  }
  const paidSoFar = (completedRows ?? []).reduce(
    (sum, r) => sum + Number(r.amount ?? 0),
    0,
  );
  if (paidSoFar >= finalizedQuote.totalAmount) {
    return {
      ok: false,
      reason: "This finalized quote is already paid in full.",
    };
  }

  const dueAmount = finalizedQuote.totalAmount - paidSoFar;
  const amountInCents = Math.round(dueAmount * 100);
  if (amountInCents < 50) {
    return {
      ok: false,
      reason: "Remaining balance is below the minimum chargeable amount.",
    };
  }

  // Dedupe pending rows (same logic as Phase B Embedded Checkout).
  const reuseCutoff = new Date(
    Date.now() - PENDING_REUSE_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data: existingPending } = await sb
    .from("payments")
    .select("id, recorded_at, stripe_checkout_session_id")
    .eq("finalized_quote_id", finalizedQuote.id)
    .eq("status", "pending")
    .is("deleted_at", null)
    .gte("recorded_at", reuseCutoff)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      recorded_at: string;
      stripe_checkout_session_id: string | null;
    }>();

  let paymentRowId: string;
  if (existingPending) {
    paymentRowId = existingPending.id;
  } else {
    const { data: inserted, error: insertErr } = await sb
      .from("payments")
      .insert({
        finalized_quote_id: finalizedQuote.id,
        quote_request_id: lead.id,
        amount: dueAmount,
        currency: "USD",
        method: "card",
        status: "pending",
      })
      .select("id")
      .single<{ id: string }>();
    if (insertErr || !inserted) {
      return {
        ok: false,
        reason: `Could not create payment record: ${insertErr?.message ?? "unknown"}`,
      };
    }
    paymentRowId = inserted.id;
  }

  // Create the PaymentIntent. Metadata is identical to the prior
  // Embedded Checkout session so the webhook can stay unchanged
  // (apart from handling a new event type -- see /api/stripe/webhook).
  const stripe = getStripeClient();
  let intent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      receipt_email: lead.email,
      description: `HARBLANC SERVICES freight payment -- ${finalizedQuote.finalizedQuoteNumber}`,
      metadata: {
        quote_request_id: lead.id,
        finalized_quote_id: finalizedQuote.id,
        finalized_quote_number: finalizedQuote.finalizedQuoteNumber,
        customer_email: lead.email,
        payment_row_id: paymentRowId,
        confirmation_token: token,
      },
    });
  } catch (e) {
    await sb
      .from("payments")
      .update({
        status: "cancelled",
        notes:
          "Stripe intent creation failed: " +
          (e instanceof Error ? e.message : String(e)),
      })
      .eq("id", paymentRowId);
    return {
      ok: false,
      reason:
        e instanceof Error
          ? `Stripe intent failed: ${e.message}`
          : "Stripe intent failed for an unknown reason.",
    };
  }

  if (!intent.client_secret) {
    return {
      ok: false,
      reason: "Stripe intent created but no client secret returned.",
    };
  }

  // Stamp the PaymentIntent id on the pending row (reuses the
  // stripe_payment_intent_id column added in 20260542000000).
  await sb
    .from("payments")
    .update({
      stripe_payment_intent_id: intent.id,
      amount: dueAmount,
    })
    .eq("id", paymentRowId);

  await logDispatchEvent(sb, lead.id, "payment_session_created", {
    finalizedQuoteId: finalizedQuote.id,
    finalizedQuoteNumber: finalizedQuote.finalizedQuoteNumber,
    amount: dueAmount,
    stripePaymentIntentId: intent.id,
    paymentRowId,
  });

  return {
    ok: true,
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    amountDue: dueAmount,
  };
}
