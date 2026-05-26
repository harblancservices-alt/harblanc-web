import type { Metadata } from "next";
import Link from "next/link";
import { company } from "@/lib/company";

/**
 * Quick Quote success — preview-only route.
 *
 * Recreates the visual chrome of /quote/success (the "Request received"
 * confirmation page customers land on after submitting the Quick Quote
 * form). The page is static markup with phone/mail links — no inputs to
 * disable. Phone and mail anchors are kept as <a> so the visual matches
 * the production page byte-for-byte; the iframe sandbox in the Preview
 * Lab prevents top-navigation regardless of whether the operator taps a
 * link.
 *
 * Loaded by the Admin Preview Lab inside an iframe at
 * /admin/previews/quote-success.
 */

export const metadata: Metadata = {
  title: "Request received — preview",
  robots: { index: false, follow: false },
};

type NextStep = { n: string; title: string; body: string };

const nextSteps: NextStep[] = [
  {
    n: "01",
    title: "Dispatch reviews now",
    body: "We read the lane and check capacity against your pickup window.",
  },
  {
    n: "02",
    title: "Reply within the hour",
    body: "A real dispatcher replies with a price range — not an auto-quote.",
  },
  {
    n: "03",
    title: "Confirm and book",
    body: "Once the range works, we lock in details, equipment, and rate.",
  },
];

export default function QuoteSuccessPreviewPage() {
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;

  return (
    <div className="bg-neutral-950">
      {/* Preview banner */}
      <div className="border-b border-red-700 bg-red-600 px-4 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-white sm:py-2.5">
        Preview only &middot; no email sent &middot; no records changed
      </div>

      <section className="border-b border-neutral-800 bg-neutral-950">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            Submitted
          </p>

          <h1 className="mt-5 text-3xl font-display leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl lg:text-6xl">
            Request received.
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-neutral-300 sm:text-lg">
            Your freight request reached dispatch. A real dispatcher will reply
            within the hour with a price range. For anything time-critical,
            call direct.
          </p>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <a
              href={phoneHref}
              className="btn-cut inline-flex items-center justify-center bg-red-600 px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500"
            >
              Call dispatch &middot; {company.dispatchPhone}
            </a>
            <Link
              href="/"
              className="btn-outline-cut inline-flex items-center justify-center px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors"
            >
              Back to home
            </Link>
          </div>

          {/* Credential strip */}
          <dl className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.18em] uppercase">
            <div className="flex items-baseline gap-2">
              <dt className="text-neutral-500">USDOT</dt>
              <dd className="text-white">{company.dotNumber}</dd>
            </div>
            <span aria-hidden className="text-neutral-700">/</span>
            <div className="flex items-baseline gap-2">
              <dt className="text-neutral-500">MC</dt>
              <dd className="text-white">{company.mcNumber}</dd>
            </div>
            <span aria-hidden className="text-neutral-700">/</span>
            <div>
              <dt className="sr-only">Operating status</dt>
              <dd className="text-white">{company.authorityText}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* What happens next */}
      <section>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <h2 className="font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase">
            What happens next
          </h2>
          <ol className="mt-6 space-y-6 border border-neutral-800 bg-neutral-900/40 p-6 sm:p-7">
            {nextSteps.map((step) => (
              <li key={step.n} className="flex gap-4">
                <span className="font-mono text-xs text-red-500">{step.n}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">
                    {step.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-400">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-6 font-mono text-[10px] tracking-[0.18em] text-neutral-500 uppercase">
            Check spam if you don&rsquo;t see a confirmation email in a few
            minutes &mdash; it&rsquo;s from{" "}
            <a
              href={`mailto:${company.dispatchEmail}`}
              className="text-zinc-300 underline-offset-4 hover:text-white hover:underline"
            >
              {company.dispatchEmail}
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
