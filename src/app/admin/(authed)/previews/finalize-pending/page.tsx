import type { Metadata } from "next";
import Link from "next/link";
import { company } from "@/lib/company";
import { ConfirmButton } from "@/app/quote/confirm/[token]/ConfirmButton";
import { SAMPLE_FINALIZED_QUOTE_CONFIRM } from "@/lib/preview/sample-data";
import { Footer } from "@/components/site/Footer";

/**
 * Confirm Finalized Quote — PENDING state preview.
 *
 * Recreates the visual chrome of /quote/confirm/[token] (the customer
 * rate-confirmation page) in its pre-confirm state, where finalizedQuote.
 * confirmedAt is null and the Confirm button is the primary action.
 *
 * The ConfirmButton component is rendered inside a <fieldset disabled>
 * so the confirmFinalizedQuote server action cannot fire from inside the
 * preview no matter what the operator clicks. The matching CONFIRMED
 * state lives at /admin/previews/finalize-confirmed.
 *
 * Sample data is read from SAMPLE_FINALIZED_QUOTE_CONFIRM. Payment
 * surfaces are intentionally NOT added here — this preview reflects the
 * production page as it ships today.
 */

export const metadata: Metadata = {
  title: "Confirm Finalized Quote — preview (pending)",
  robots: { index: false, follow: false },
};

const SAMPLE = SAMPLE_FINALIZED_QUOTE_CONFIRM;

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

function formatUsd(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function FinalizePendingPreviewPage() {
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;

  return (
    <div className="bg-[#050505] text-fg">
      {/* Preview banner */}
      <div className="border-b border-red-300 bg-red-600 px-4 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-white sm:py-2.5">
        Preview only &middot; no email sent &middot; no records changed
      </div>

      <section className="border-b border-[#1a1a1a] bg-gradient-to-b from-[#050505] via-[#0a0a0a] to-[#141414]">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <p className="flex items-center justify-center gap-2 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            Rate confirmation
          </p>
          <h1 className="mt-3 text-center text-3xl font-display leading-[1.05] tracking-[-0.02em] text-fg sm:text-4xl lg:text-5xl">
            Confirm Finalized Quote
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-fg sm:text-lg">
            Review the rate and shipment scope below. Confirming locks the
            rate and signals dispatch to coordinate pickup and delivery.
          </p>

          {/* Summary card */}
          <dl className="mt-7 grid grid-cols-1 gap-x-8 gap-y-4 border-l-4 border-l-red-600 bg-[#1a1a1a] p-5 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] sm:grid-cols-2 sm:p-6 lg:grid-cols-[1fr_2fr_1fr_1fr]">
            <KV label="Quote #">
              <span className="font-mono text-base font-semibold text-fg tabular-nums">
                {SAMPLE.finalizedQuoteNumber}
              </span>
            </KV>
            <KV label="Lane">
              <span className="font-mono text-base font-semibold text-fg">
                {SAMPLE.pickupCity}, {SAMPLE.pickupState}
                <span aria-hidden className="mx-2 text-red-600">
                  &rarr;
                </span>
                {SAMPLE.deliveryCity}, {SAMPLE.deliveryState}
              </span>
              <span className="mt-1 block font-mono text-[11px] text-fg tabular-nums">
                {SAMPLE.pickupZip}
                <span aria-hidden className="mx-1.5 text-red-600">
                  &rarr;
                </span>
                {SAMPLE.deliveryZip}
              </span>
            </KV>
            <KV label="Total rate">
              <span className="font-mono text-base font-bold text-fg tabular-nums">
                {formatUsd(SAMPLE.totalAmount)}
              </span>
            </KV>
            <KV label="Valid through">
              <span className="font-mono text-base text-fg tabular-nums">
                {formatHumanDate(SAMPLE.expirationAt)}
              </span>
            </KV>
          </dl>

          {/* Action zone — Confirm button, wrapped in <fieldset disabled>
              so the server action cannot fire from inside the preview. */}
          <div className="mt-7">
            <fieldset
              disabled
              aria-label="Preview only — interactions disabled"
              className="m-0 border-0 p-0"
            >
              <ConfirmButton token="PREVIEW-TOKEN" />
            </fieldset>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg">
              Confirming records the rate and shipment scope above as
              accepted. A dispatcher follows up to schedule the pickup
              and delivery windows by phone.
            </p>
          </div>

          {/* Need help support panel */}
          <div className="mt-7 flex flex-col gap-3 border-l-2 border-l-neutral-600 bg-[#161616] p-4 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.55)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-fg">
                Need dispatch help?
              </p>
            </div>
            <a
              href={phoneHref}
              className="inline-flex items-center gap-1.5 py-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-red-600 transition-colors hover:text-red-700 sm:shrink-0"
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
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-fg">
            Have the rate confirmation email handy?{" "}
            <Link
              href="/"
              className="text-fg underline-offset-4 hover:text-red-600 hover:underline"
            >
              Back to home
            </Link>
          </p>
        </div>
      </section>
      <Footer />
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
      <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-fg">
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}
