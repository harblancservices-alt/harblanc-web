import Link from "next/link";
import { company } from "@/lib/company";
import { SAMPLE_FINALIZED_QUOTE_CONFIRM } from "@/lib/preview/sample-data";
import { createPreviewDemoSession } from "@/lib/stripe/preview/demo-session";
import { DemoEmbeddedCheckout } from "./DemoEmbeddedCheckout";
import { Footer } from "@/components/site/Footer";

/**
 * Payment screen - preview-only content, shared by /admin/previews/payment
 * and /tms-v2/previews/pages/payment (retirement-readiness Objective 1D).
 *
 * Customer-facing payment surface that the recipient sees IMMEDIATELY
 * after clicking "Confirm Finalized Quote" on /quote/confirm/[token].
 * Same page chrome as the post-confirm success state, but with a
 * payment block + Stripe Pay-with-card CTA stacked under the
 * confirmation timestamp panel.
 *
 * This is a MOCKUP -- no Stripe SDK is loaded, no Pay button is wired,
 * no actual payment can occur from this page. Used to iterate on the
 * visual + copy before committing to a live payment integration.
 *
 * Sample data is read from SAMPLE_FINALIZED_QUOTE_CONFIRM so the lane,
 * total, and confirmation timestamp match the Finalized Quote
 * Confirmed preview tile next to it in the Preview Lab.
 */

const SAMPLE = SAMPLE_FINALIZED_QUOTE_CONFIRM;

function formatHumanDate(iso: string | null): string {
  if (!iso) return "\u2014";
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
  if (!iso) return "\u2014";
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
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} \u00b7 ${h12}:${mm} ${ampm}`;
}

function formatUsd(n: number | null): string {
  if (n === null) return "\u2014";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function PaymentPreviewPage() {
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;
  const total = formatUsd(SAMPLE.totalAmount);
  // Spin up a one-off Stripe embedded session per render so the
  // preview tile shows the EXACT form the customer will see on
  // /quote/confirm/[token]. Sandbox-only; never reaches a real
  // payment intent because it'''s served only inside admin auth.
  const demo = await createPreviewDemoSession();

  return (
    <div className="bg-[#050505] text-fg">
      {/* Preview banner */}
      <div className="border-b border-red-300 bg-red-600 px-4 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-white sm:py-2.5">
        Static Stripe sandbox demo only &middot; real payments use /quote/confirm/[token]
      </div>

      <section className="border-b border-[#1a1a1a] bg-gradient-to-b from-[#050505] via-[#0a0a0a] to-[#141414]">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <p className="flex items-center justify-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-fg">
            <span aria-hidden className="inline-block h-3 w-1 bg-card" />
            Rate confirmation &middot; payment
          </p>
          <h1 className="mt-3 text-center text-3xl font-display leading-[1.05] tracking-[-0.02em] text-fg sm:text-4xl lg:text-5xl">
            Finalized Quote Confirmed
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-fg sm:text-lg">
            Dispatch has received your confirmation. Complete payment below
            to lock the lane on dispatch\u2019s schedule.
          </p>

          {/* Summary card */}
          <dl className="mt-7 grid grid-cols-1 gap-x-8 gap-y-4 border-l-4 border-l-line-strong bg-[#1a1a1a] p-5 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] sm:grid-cols-2 sm:p-6 lg:grid-cols-[1fr_2fr_1fr_1fr]">
            <KV label="Quote #">
              <span className="font-mono text-base font-semibold text-fg tabular-nums">
                {SAMPLE.finalizedQuoteNumber}
              </span>
            </KV>
            <KV label="Lane">
              <span className="font-mono text-base font-semibold text-fg">
                {SAMPLE.pickupCity}, {SAMPLE.pickupState}
                <span aria-hidden className="mx-2 text-fg">
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
            <KV label="Total due">
              <span className="font-mono text-base font-bold text-fg tabular-nums">
                {total}
              </span>
            </KV>
            <KV label="Valid through">
              <span className="font-mono text-base text-fg tabular-nums">
                {formatHumanDate(SAMPLE.expirationAt)}
              </span>
            </KV>
          </dl>

          {/* Confirmed-at panel - same as the finalize-confirmed preview */}
          <div className="mt-7 border-l-4 border-l-green-500 bg-[#1a1a1a] p-5 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] sm:p-6">
            <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-green-400">
              <span aria-hidden className="inline-block h-3 w-1 bg-green-500" />
              Confirmed
            </p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-fg">
              Confirmed at
            </p>
            <p className="mt-1 font-mono text-base text-fg tabular-nums">
              {formatHumanDateTime(SAMPLE.confirmedAtConfirmed)}
            </p>
          </div>

          {/* Payment block */}
          <div className="mt-7 border-l-4 border-l-line-strong bg-[#1a1a1a] p-5 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] sm:p-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-fg">
                  <span aria-hidden className="inline-block h-3 w-1 bg-card" />
                  Balance due
                </p>
                <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-fg">
                  Amount due
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-fg tabular-nums sm:text-3xl">
                  {total}
                </p>
                <p className="mt-1 font-mono text-[11px] text-fg">
                  Due before pickup &middot; USD
                </p>
              </div>
              <div className="hidden text-right sm:block">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg">
                  Status
                </p>
                <p className="mt-1 font-mono text-[12px] font-bold uppercase tracking-[0.16em] text-fg">
                  Awaiting payment
                </p>
              </div>
            </div>

            {/* Embedded Stripe Checkout - same component the customer sees
                on /quote/confirm/[token]. Sandbox session, no real
                charge, no payments-table row. clientSecret is created
                server-side at render time (see createPreviewDemoSession). */}
            <div className="mt-5">
              {demo.ok ? (
                <DemoEmbeddedCheckout clientSecret={demo.clientSecret} />
              ) : (
                <div className="border border-amber-300 bg-amber-100 px-4 py-3 font-mono text-[11px] text-amber-700">
                  Embedded checkout demo unavailable &middot; {demo.reason}
                </div>
              )}
            </div>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-fg">
              Sandbox demo only &middot; production flow lives on the confirmed quote page &middot; test card 4242 4242 4242 4242
            </p>
          </div>

          {/* Help support panel */}
          <div className="mt-7 flex flex-col gap-3 border-l-2 border-l-neutral-600 bg-[#161616] p-4 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.55)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-fg">
                Need dispatch help?
              </p>
            </div>
            <a
              href={phoneHref}
              className="inline-flex items-center gap-1.5 py-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-fg transition-colors hover:text-fg sm:shrink-0"
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
              className="text-fg underline-offset-4 hover:text-fg hover:underline"
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
