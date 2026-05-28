import Stripe from "stripe";

/**
 * Server-only Stripe client.
 *
 * Module is intentionally NOT marked "use client" -- importing this
 * file from a client component will fail the build. The secret key
 * lives in process.env.STRIPE_SECRET_KEY and is never sent to the
 * browser.
 *
 * Test vs live mode is determined by the key prefix:
 *   sk_test_...  -> test mode (Stripe sandbox)
 *   sk_live_...  -> live mode (real money)
 *
 * Stripe's library handles the routing automatically. The customer-
 * facing payment flow stays identical between modes; only the env
 * var swap promotes a tested flow to production.
 */

let cached: Stripe | null = null;

/**
 * Returns the singleton Stripe client. Throws if STRIPE_SECRET_KEY is
 * not configured -- the server action / webhook wrapper should catch
 * and surface a user-facing error rather than crashing the request.
 */
export function getStripeClient(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. Payment checkout cannot run.",
    );
  }
  cached = new Stripe(key, {
    // Pin a stable API version so an upstream Stripe version bump does
    // not silently change response shapes mid-flight.
    apiVersion: "2026-04-22.dahlia",
    appInfo: {
      name: "HARBLANC SERVICES",
      version: "0.1.0",
    },
    typescript: true,
  });
  return cached;
}

/**
 * Origin used to build Stripe success / cancel URLs. NEXT_PUBLIC_SITE_URL
 * is preferred; falls back to the production hostname matching the
 * acceptUrl pattern in admin/quotes/actions.ts so links stay coherent.
 */
export function publicOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://www.harblancservices.com"
  );
}
