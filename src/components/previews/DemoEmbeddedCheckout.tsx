"use client";

import { useCallback, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { harblancStripeAppearance } from "@/lib/stripe/appearance";

const stripePromise = (() => {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return key ? loadStripe(key) : null;
})();

/**
 * Demo Stripe Elements (PaymentElement) wrapped in HARBLANC dark
 * theme. Identical visual treatment to the customer-facing
 * /quote/confirm/[token] PayButton, but no token gating and no
 * payments-table write -- this is preview-only. Shared by
 * PaymentPreview.tsx, used by both /admin/previews/payment and
 * /tms-v2/previews/pages/payment (retirement-readiness Objective 1D).
 */
export function DemoEmbeddedCheckout({
  clientSecret,
}: {
  clientSecret: string;
}) {
  if (!stripePromise) {
    return (
      <div className="border border-amber-300 bg-amber-100 px-4 py-3 font-mono text-[11px] text-amber-700">
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not configured. Stripe
        Elements cannot mount in the browser.
      </div>
    );
  }
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: harblancStripeAppearance,
      }}
    >
      <DemoPaymentForm />
    </Elements>
  );
}

function DemoPaymentForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!stripe || !elements) return;
      setSubmitting(true);
      setFormError(null);
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          // Return to the current preview page (works for both
          // /admin/previews/payment and /tms-v2/previews/pages/payment —
          // was hardcoded to the admin path before this component was
          // shared with /tms-v2).
          return_url:
            (typeof window !== "undefined" ? window.location.href : "") +
            (typeof window !== "undefined" && window.location.search
              ? "&demo=complete"
              : "?demo=complete"),
        },
      });
      if (error) {
        setFormError(
          error.message ?? "Payment could not be completed. Try again.",
        );
        setSubmitting(false);
      }
    },
    [stripe, elements],
  );

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement options={{ layout: "tabs" }} />
      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 border-0 bg-canvas px-5 py-3.5 font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-fg transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
      >
        {submitting ? "Processing payment..." : "Pay $3,050.00 \u2192"}
      </button>
      {formError ? (
        <p
          role="alert"
          className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-red-600"
        >
          {formError}
        </p>
      ) : null}
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
        Sandbox demo &middot; test card 4242 4242 4242 4242
      </p>
    </form>
  );
}
