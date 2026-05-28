import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveByConfirmationToken } from "@/lib/quote-token/lookup";
import { company } from "@/lib/company";
import { ConfirmButton } from "./ConfirmButton";
import { PayButton } from "./PayButton";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Customer-facing rate-confirmation page. Lands here from the Confirm
 * Finalized Quote button in the Rate Confirmation email.
 *
 * Visual direction matches /quote/accept/[token]:
 *   - three-layer dark depth (#050505 page, #1a1a1a card, no inputs)
 *   - centered hero block with red preamble + h1 + supporting copy
 *   - 4-cell summary card (Quote # / Lane / Rate / Valid through)
 *   - Need help support panel + tappable phone text-link
 *
 * Two render states driven by finalizedQuote.confirmedAt:
 *   - null   → confirm card with a single muted-green Confirm button
 *   - !null  → success state ("Finalized Quote Confirmed")
 *
 * The Confirm button calls the server action confirmFinalizedQuote which
 * stamps confirmed_at + logs a dispatch event. Re-clicking a confirmed
 * token lands here in the success state — fully idempotent.
 */

export const metadata: Metadata = {
  title: "Confirm Finalized Quote",
  robots: { index: false, follow: false },
};

function formatHumanDate(iso: string | null): string {
  if (!iso) return "—";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts.map((n) => parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return iso;
  }
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}

function formatHumanDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const mm = String(minutes).padStart(2, "0");
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${h12}:${mm} ${ampm}`;
}

function formatUsd(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type LaneEndpoint = { primary: string; secondary: string };
function formatLaneEndpoint(
  city: string | null,
  state: string | null,
  zip: string | null,
): LaneEndpoint {
  if (city && state) {
    return { primary: `${city}, ${state}`, secondary: zip ?? "" };
  }
  if (zip) return { primary: zip, secondary: "" };
  return { primary: "—", secondary: "" };
}

export default async function ConfirmFinalizedQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { token } = await params;
  const { payment: paymentStatus } = await searchParams;
  const resolved = await resolveByConfirmationToken(token);
  if (!resolved.ok) notFound();

  const { finalizedQuote, lead } = resolved;
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;
  const pickup = formatLaneEndpoint(lead.pickupCity, lead.pickupState, lead.pickupZip);
  const delivery = formatLaneEndpoint(
    lead.deliveryCity,
    lead.deliveryState,
    lead.deliveryZip,
  );
  const showZipSecondary =
    pickup.secondary.length > 0 || delivery.secondary.length > 0;

  const isConfirmed = !!finalizedQuote.confirmedAt;

  // ── Payment state lookup (runs only when the quote is confirmed) ────
  //
  // Reads the existing payments table (Phase P1A + Stripe migration).
  // We surface three pieces of state to the post-confirm payment card:
  //   - paidSoFar (sum of completed.amount) -- if >= total, hide Pay
  //   - hasPendingPayment -- if a Stripe checkout was started but the
  //     webhook hasn'''t reported back yet, change the button label
  //   - lastSessionAt -- not currently displayed, kept for future
  //
  // When unconfirmed we skip the lookup entirely.
  let paidSoFar = 0;
  let hasPendingPayment = false;
  if (isConfirmed && finalizedQuote.totalAmount != null) {
    const sb = createServiceRoleClient();
    const { data: rows } = await sb
      .from("payments")
      .select("amount, status")
      .eq("finalized_quote_id", finalizedQuote.id)
      .is("deleted_at", null);
    for (const r of rows ?? []) {
      if (r.status === "completed") {
        paidSoFar += Number(r.amount ?? 0);
      } else if (r.status === "pending") {
        hasPendingPayment = true;
      }
    }
  }
  const amountDue =
    finalizedQuote.totalAmount != null
      ? Math.max(0, finalizedQuote.totalAmount - paidSoFar)
      : null;
  const paidInFull = amountDue !== null && amountDue <= 0.005;

  return (
    <div className="bg-[#050505] text-zinc-100">
      <section className="border-b border-[#1a1a1a] bg-gradient-to-b from-[#050505] via-[#0a0a0a] to-[#141414]">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <p className="flex items-center justify-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-red-600">
            <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            Rate confirmation
          </p>
          <h1 className="mt-3 text-center text-3xl font-display leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-5xl">
            {isConfirmed ? "Finalized Quote Confirmed" : "Confirm Finalized Quote"}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-white sm:text-lg">
            {isConfirmed
              ? "Dispatch has received your confirmation. A HARBLANC dispatcher will coordinate the next scheduling step."
              : "Review the rate and shipment scope below. Confirming locks the rate and signals dispatch to coordinate pickup and delivery."}
          </p>

          {/* Summary card — same freight-document header row as the
              email and the intake page. Lane spans 2 columns at lg. */}
          <dl className="mt-7 grid grid-cols-1 gap-x-8 gap-y-4 border-l-4 border-l-red-600 bg-[#1a1a1a] p-5 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] sm:grid-cols-2 sm:p-6 lg:grid-cols-[1fr_2fr_1fr_1fr]">
            <KV label="Quote #">
              <span className="font-mono text-base font-semibold text-white tabular-nums">
                {finalizedQuote.finalizedQuoteNumber}
              </span>
            </KV>
            <KV label="Lane">
              <span className="font-mono text-base font-semibold text-white">
                {pickup.primary}
                <span aria-hidden className="mx-2 text-red-600">
                  &rarr;
                </span>
                {delivery.primary}
              </span>
              {showZipSecondary ? (
                <span className="mt-1 block font-mono text-[11px] text-white tabular-nums">
                  {pickup.secondary || "—"}
                  <span aria-hidden className="mx-1.5 text-zinc-600">
                    &rarr;
                  </span>
                  {delivery.secondary || "—"}
                </span>
              ) : null}
            </KV>
            <KV label="Total rate">
              <span className="font-mono text-base font-bold text-white tabular-nums">
                {formatUsd(finalizedQuote.totalAmount)}
              </span>
            </KV>
            <KV label="Valid through">
              <span className="font-mono text-base text-white tabular-nums">
                {formatHumanDate(finalizedQuote.expirationAt)}
              </span>
            </KV>
          </dl>

          {/* Action zone — Confirm button or confirmed-at timestamp */}
          {isConfirmed ? (
            <>
              <div className="mt-7 border-l-4 border-l-green-500 bg-[#1a1a1a] p-5 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] sm:p-6">
                <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-green-400">
                  <span aria-hidden className="inline-block h-3 w-1 bg-green-500" />
                  Confirmed
                </p>
                <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-white">
                  Confirmed at
                </p>
                <p className="mt-1 font-mono text-base text-white tabular-nums">
                  {formatHumanDateTime(finalizedQuote.confirmedAt)}
                </p>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white">
                  A dispatcher will reach out to coordinate pickup and
                  delivery windows. Watch for a separate scheduling email
                  or call from the dispatch number above.
                </p>
              </div>

              {/* Payment block - only renders when the quote is confirmed.
                  Three states:
                    - paid in full          -> green "Paid" panel
                    - pending Stripe session -> amber "Payment processing" panel
                    - awaiting payment      -> red Pay-with-card CTA
                  Success / cancelled query params from the Stripe return
                  trip render a small status banner above the block. */}
              {paymentStatus === "success" ? (
                <div className="mt-7 border-l-4 border-l-green-500 bg-[#0e2118] p-4 sm:p-5">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-green-300">
                    Payment submitted
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-green-100">
                    Stripe is processing your payment. Once it clears
                    (usually within seconds for card, 1-3 business days
                    for bank), this page will show {"\"Paid in full\""} and
                    dispatch will be notified.
                  </p>
                </div>
              ) : null}
              {paymentStatus === "cancelled" ? (
                <div className="mt-7 border-l-4 border-l-amber-500 bg-[#1f1709] p-4 sm:p-5">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300">
                    Payment cancelled
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-amber-100">
                    No charge was made. You can retry the payment below
                    whenever you{"\u2019"}re ready.
                  </p>
                </div>
              ) : null}

              {paidInFull ? (
                <div className="mt-7 border-l-4 border-l-green-500 bg-[#1a1a1a] p-5 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] sm:p-6">
                  <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-green-400">
                    <span aria-hidden className="inline-block h-3 w-1 bg-green-500" />
                    Paid in full
                  </p>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white">
                    Dispatch has the funds. No further action is required
                    from you on payment.
                  </p>
                </div>
              ) : amountDue != null && amountDue > 0 ? (
                <div className="mt-7 border-l-4 border-l-red-600 bg-[#1a1a1a] p-5 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] sm:p-6">
                  <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-red-500">
                    <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
                    {hasPendingPayment ? "Payment in progress" : "Payment required"}
                  </p>
                  <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-white">
                    Amount due
                  </p>
                  <p className="mt-1 font-mono text-2xl font-bold text-white tabular-nums sm:text-3xl">
                    {formatUsd(amountDue)}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-white">
                    {finalizedQuote.finalizedQuoteNumber} &middot; Due before pickup &middot; USD
                  </p>
                  <div className="mt-5">
                    <PayButton
                      token={token}
                      amountLabel={formatUsd(amountDue)}
                      label={
                        hasPendingPayment
                          ? `Resume secure payment \u2192`
                          : `Pay freight invoice \u2014 ${formatUsd(amountDue)} \u2192`
                      }
                    />
                  </div>
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white">
                    Stripe checkout &middot; secure card entry &middot; receipt emailed on success
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-7">
              <ConfirmButton token={token} />
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white">
                Confirming records the rate and shipment scope above as
                accepted. A dispatcher follows up to schedule the
                pickup and delivery windows by phone.
              </p>
            </div>
          )}

          {/* Need help support panel — calmer than the intake page's
              version since this page has fewer actions. */}
          <div className="mt-7 flex flex-col gap-3 border-l-2 border-l-neutral-600 bg-[#161616] p-4 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.55)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                Need dispatch help?
              </p>
              <p className="mt-1 text-sm leading-relaxed text-white">
                Reach a dispatcher directly with any questions on the
                rate or scheduling.{" "}
                <span className="font-medium text-zinc-100 tabular-nums">
                  {company.dispatchPhone}
                </span>
              </p>
            </div>
            <a
              href={phoneHref}
              className="inline-flex items-center gap-1.5 py-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-red-400 transition-colors hover:text-red-300 sm:shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden
              >
                <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" />
              </svg>
              Call dispatch
            </a>
          </div>
        </div>
      </section>

      <section className="bg-[#050505]">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
            Have the rate confirmation email handy?{" "}
            <Link
              href="/"
              className="text-white underline-offset-4 hover:text-red-400 hover:underline"
            >
              Back to home
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

function KV({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white">
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}
