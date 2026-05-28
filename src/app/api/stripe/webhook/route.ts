import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logDispatchEvent } from "@/lib/dispatch/events";

/**
 * Stripe webhook handler -- POST /api/stripe/webhook
 *
 * Receives lifecycle events from Stripe (primarily checkout.session.completed
 * for our flow). Verifies the request signature against STRIPE_WEBHOOK_SECRET
 * before touching the database. Unsigned, replayed, or tampered events are
 * rejected with 403.
 *
 * Posture mirrors /api/resend-webhook/route.ts:
 *   - Refuses without the signing secret (returns 503, no DB writes)
 *   - Verifies signature with stripe.webhooks.constructEvent
 *   - Idempotent: re-processing the same session_id is a no-op
 *
 * Events handled:
 *   checkout.session.completed    -> mark payment row status="completed"
 *   checkout.session.expired      -> mark payment row status="cancelled"
 *   checkout.session.async_payment_failed -> mark payment row status="failed"
 *
 * Any other event type is acknowledged with 200 (Stripe expects 2xx within
 * a few seconds) but otherwise ignored.
 */

// Stripe requires the raw request body for signature verification --
// Next.js'''s default JSON parsing would mutate it. Reading via .text()
// preserves the exact bytes Stripe signed.
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signingSecret) {
    // No secret configured -- refuse all events. Mirrors the Resend
    // webhook posture; we never accept unsigned payment events.
    return NextResponse.json(
      { error: "webhook_secret_not_configured" },
      { status: 503 },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "missing_stripe_signature_header" },
      { status: 400 },
    );
  }

  const rawBody = await req.text();

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, sig, signingSecret);
  } catch (e) {
    return NextResponse.json(
      {
        error: "signature_verification_failed",
        detail: e instanceof Error ? e.message : "unknown",
      },
      { status: 403 },
    );
  }

  const sb = createServiceRoleClient();

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const intent = event.data.object;
        await handlePaymentIntentSucceeded(sb, intent);
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object;
        await markIntentStatus(sb, intent.id, "failed");
        break;
      }
      case "payment_intent.canceled": {
        const intent = event.data.object;
        await markIntentStatus(sb, intent.id, "cancelled");
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object;
        await handleCheckoutCompleted(sb, session);
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object;
        await markSessionStatus(sb, session.id, "cancelled");
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        await markSessionStatus(sb, session.id, "failed");
        break;
      }
      default:
        // Acknowledged but not acted on. Returning 200 keeps Stripe from
        // retrying these forever.
        break;
    }
  } catch (e) {
    // Returning non-2xx triggers Stripe retry. Log + surface a 500 so
    // transient DB issues get retried automatically.
    console.error("[stripe-webhook] handler failed", {
      eventId: event.id,
      eventType: event.type,
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "handler_failed", eventId: event.id },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, eventId: event.id });
}

// ─── Handlers ──────────────────────────────────────────────────────────

type SupabaseSrc = ReturnType<typeof createServiceRoleClient>;

type CompletedSession = {
  id: string;
  payment_intent: string | null | { id: string };
  metadata: Record<string, string> | null;
  amount_total: number | null;
  currency: string | null;
  customer_email: string | null;
};

async function handleCheckoutCompleted(
  sb: SupabaseSrc,
  session: CompletedSession,
): Promise<void> {
  // Find the pending payment row -- prefer session_id, fall back to
  // payment_row_id metadata if a stamp failed at session creation.
  const pi =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const { data: row, error: lookupErr } = await sb
    .from("payments")
    .select(
      "id, finalized_quote_id, quote_request_id, amount, status",
    )
    .eq("stripe_checkout_session_id", session.id)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      finalized_quote_id: string;
      quote_request_id: string;
      amount: number;
      status: string;
    }>();
  if (lookupErr) {
    throw new Error(`Payment row lookup failed: ${lookupErr.message}`);
  }

  let paymentRow = row;
  if (!paymentRow) {
    // Fallback: look up by metadata.payment_row_id.
    const rowId = session.metadata?.payment_row_id;
    if (rowId) {
      const { data: byId } = await sb
        .from("payments")
        .select(
          "id, finalized_quote_id, quote_request_id, amount, status",
        )
        .eq("id", rowId)
        .is("deleted_at", null)
        .maybeSingle<typeof paymentRow>();
      paymentRow = byId ?? null;
    }
  }

  if (!paymentRow) {
    // Webhook reached us before the session id was stamped, AND no
    // payment_row_id metadata. Insert a fresh completed row using
    // session metadata so the audit log still has it -- operator will
    // need to reconcile manually.
    const fqId = session.metadata?.finalized_quote_id;
    const qrId = session.metadata?.quote_request_id;
    if (!fqId || !qrId || !session.amount_total) {
      console.warn("[stripe-webhook] orphan completed session", {
        sessionId: session.id,
      });
      return;
    }
    await sb.from("payments").insert({
      finalized_quote_id: fqId,
      quote_request_id: qrId,
      amount: session.amount_total / 100,
      currency: (session.currency ?? "USD").toUpperCase(),
      method: "card",
      status: "completed",
      received_at: new Date().toISOString(),
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: pi,
      notes: "Reconstructed from webhook; no pre-checkout pending row found.",
    });
    return;
  }

  if (paymentRow.status === "completed") {
    // Already processed -- idempotent no-op.
    return;
  }

  const { error: updateErr } = await sb
    .from("payments")
    .update({
      status: "completed",
      received_at: new Date().toISOString(),
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: pi,
    })
    .eq("id", paymentRow.id);
  if (updateErr) {
    throw new Error(`Payment row update failed: ${updateErr.message}`);
  }

  await logDispatchEvent(sb, paymentRow.quote_request_id, "payment_received", {
    paymentId: paymentRow.id,
    finalizedQuoteId: paymentRow.finalized_quote_id,
    amount: paymentRow.amount,
    stripeSessionId: session.id,
    stripePaymentIntentId: pi,
  });
}

async function markSessionStatus(
  sb: SupabaseSrc,
  sessionId: string,
  status: "cancelled" | "failed",
): Promise<void> {
  // Find the row and update its status. If the row does not exist we
  // silently ignore -- a session can expire without our pre-row if
  // the user never reached the create-session call (impossible in our
  // flow but defensive).
  await sb
    .from("payments")
    .update({ status })
    .eq("stripe_checkout_session_id", sessionId)
    .eq("status", "pending");
}
type PaymentIntent = {
  id: string;
  amount: number | null;
  currency: string | null;
  metadata: Record<string, string> | null;
  receipt_email: string | null;
};

async function handlePaymentIntentSucceeded(
  sb: SupabaseSrc,
  intent: PaymentIntent,
): Promise<void> {
  const { data: row, error: lookupErr } = await sb
    .from("payments")
    .select("id, finalized_quote_id, quote_request_id, amount, status")
    .eq("stripe_payment_intent_id", intent.id)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      finalized_quote_id: string;
      quote_request_id: string;
      amount: number;
      status: string;
    }>();
  if (lookupErr) {
    throw new Error(`Payment row lookup failed: ${lookupErr.message}`);
  }

  let paymentRow = row;
  if (!paymentRow) {
    // Fallback to payment_row_id metadata when the intent id stamp
    // didn'''t complete (rare network race).
    const rowId = intent.metadata?.payment_row_id;
    if (rowId) {
      const { data: byId } = await sb
        .from("payments")
        .select(
          "id, finalized_quote_id, quote_request_id, amount, status",
        )
        .eq("id", rowId)
        .is("deleted_at", null)
        .maybeSingle<typeof paymentRow>();
      paymentRow = byId ?? null;
    }
  }

  if (!paymentRow) {
    // Orphan: reconstruct a completed row from intent metadata so
    // the audit log is intact. Operator can reconcile manually.
    const fqId = intent.metadata?.finalized_quote_id;
    const qrId = intent.metadata?.quote_request_id;
    if (!fqId || !qrId || !intent.amount) {
      console.warn("[stripe-webhook] orphan succeeded intent", {
        intentId: intent.id,
      });
      return;
    }
    await sb.from("payments").insert({
      finalized_quote_id: fqId,
      quote_request_id: qrId,
      amount: intent.amount / 100,
      currency: (intent.currency ?? "USD").toUpperCase(),
      method: "card",
      status: "completed",
      received_at: new Date().toISOString(),
      stripe_payment_intent_id: intent.id,
      notes:
        "Reconstructed from webhook; no pre-payment pending row found.",
    });
    return;
  }

  if (paymentRow.status === "completed") return;

  const { error: updateErr } = await sb
    .from("payments")
    .update({
      status: "completed",
      received_at: new Date().toISOString(),
      stripe_payment_intent_id: intent.id,
    })
    .eq("id", paymentRow.id);
  if (updateErr) {
    throw new Error(`Payment row update failed: ${updateErr.message}`);
  }

  await logDispatchEvent(sb, paymentRow.quote_request_id, "payment_received", {
    paymentId: paymentRow.id,
    finalizedQuoteId: paymentRow.finalized_quote_id,
    amount: paymentRow.amount,
    stripePaymentIntentId: intent.id,
  });
}

async function markIntentStatus(
  sb: SupabaseSrc,
  intentId: string,
  status: "cancelled" | "failed",
): Promise<void> {
  await sb
    .from("payments")
    .update({ status })
    .eq("stripe_payment_intent_id", intentId)
    .eq("status", "pending");
}
