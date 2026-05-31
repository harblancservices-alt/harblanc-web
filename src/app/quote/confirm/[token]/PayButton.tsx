"use client";

import { useCallback, useState, useTransition } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { harblancStripeAppearance } from "@/lib/stripe/appearance";
import { createPaymentCheckoutSession } from "./payment-actions";

/**
 * Customer-facing payment button + inline Stripe Elements form.
 *
 * Two phases:
 *   - "ready": shows a red HARBLANC button. Click triggers the server
 *     action createPaymentCheckoutSession(token), which creates a
 *     Stripe PaymentIntent and returns its client_secret.
 *   - "mounted": Stripe Elements <PaymentElement> renders INSIDE the
 *     HARBLANC card. Theme matches the freight-document aesthetic.
 *     A custom Submit button below it triggers stripe.confirmPayment()
 *     which sends card data straight to Stripe (never touches our
 *     server) and redirects to ?payment=success on completion.
 *
 * The card-input DOM lives inside a Stripe-controlled iframe so PCI
 * scope is the same as Embedded Checkout. The wrapping styling is
 * fully ours.
 */

const stripePromise = (() => {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[PayButton] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY missing -- " +
          "Stripe Elements will not mount.",
      );
    }
    return null;
  }
  return loadStripe(key);
})();

export function PayButton({
  token,
  label,
  amountLabel,
}: {
  token: string;
  label: string;
  amountLabel: string;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onPay() {
    setError(null);
    startTransition(async () => {
      const result = await createPaymentCheckoutSession(token);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setClientSecret(result.clientSecret);
    });
  }

  if (stripePromise === null) {
    return (
      <div>
        <button
          type="button"
          disabled
          className="inline-flex w-full items-center justify-center gap-2 border-0 bg-zinc-700 px-5 py-3.5 font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-white sm:w-auto"
        >
          {label}
        </button>
        <p
          role="alert"
          className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-amber-400"
        >
          Online payment unavailable &middot; contact dispatch to settle by wire or check
        </p>
      </div>
    );
  }

  if (clientSecret) {
    return (
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: harblancStripeAppearance,
        }}
      >
        <PaymentForm token={token} amountLabel={amountLabel} />
      </Elements>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onPay}
        disabled={isPending}
        aria-label={`Pay freight invoice -- ${amountLabel}`}
        className="inline-flex w-full items-center justify-center gap-2 border-0 bg-black px-5 py-3.5 font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
      >
        {isPending ? "Opening secure payment..." : label}
      </button>
      {error ? (
        <p
          role="alert"
          className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-red-400"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PaymentForm({
  token,
  amountLabel,
}: {
  token: string;
  amountLabel: string;
}) {
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
          return_url:
            (typeof window !== "undefined"
              ? window.location.origin
              : "") +
            `/quote/confirm/${token}?payment=success`,
        },
      });

      // confirmPayment returns control here only if there was an
      // IMMEDIATE error (network blocked, validation failed, etc).
      // Successful payments redirect via return_url. setSubmitting
      // back to false so the user can retry.
      if (error) {
        setFormError(
          error.message ?? "Payment could not be completed. Try again.",
        );
        setSubmitting(false);
      }
    },
    [stripe, elements, token],
  );

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement
        options={{
          layout: "tabs",
        }}
      />
      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 border-0 bg-black px-5 py-3.5 font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
      >
        {submitting
          ? "Processing payment..."
          : `Pay ${amountLabel} \u2192`}
      </button>
      {formError ? (
        <p
          role="alert"
          className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-red-400"
        >
          {formError}
        </p>
      ) : null}
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        Secure payment via Stripe &middot; card data never touches HARBLANC servers
      </p>
    </form>
  );
}
