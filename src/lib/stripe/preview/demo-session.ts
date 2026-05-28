import "server-only";
import { getStripeClient } from "@/lib/stripe/server";

/**
 * Create a one-off Stripe PaymentIntent for the Admin Preview Lab
 * demo tile. The preview mounts Stripe Elements (PaymentElement)
 * styled to match HARBLANC, so the operator sees exactly the form
 * the customer will see on /quote/confirm/[token].
 *
 * Returns null/error when STRIPE_SECRET_KEY is not configured.
 */
export async function createPreviewDemoSession(): Promise<
  { ok: true; clientSecret: string } | { ok: false; reason: string }
> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, reason: "STRIPE_SECRET_KEY not configured." };
  }
  const stripe = getStripeClient();
  try {
    const intent = await stripe.paymentIntents.create({
      amount: 305000,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      description:
        "Freight payment -- ADMIN PREVIEW DEMO (sandbox, not a real customer)",
      metadata: {
        preview_demo: "true",
        do_not_fulfill: "true",
      },
    });
    if (!intent.client_secret) {
      return { ok: false, reason: "Stripe returned no client secret." };
    }
    return { ok: true, clientSecret: intent.client_secret };
  } catch (e) {
    return {
      ok: false,
      reason:
        e instanceof Error
          ? `Stripe error: ${e.message}`
          : "Stripe error (unknown).",
    };
  }
}
