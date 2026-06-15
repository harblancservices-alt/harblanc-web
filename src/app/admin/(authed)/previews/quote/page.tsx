import type { Metadata } from "next";
import { QuoteForm } from "@/components/quote/QuoteForm";
import { company } from "@/lib/company";
import { Footer } from "@/components/site/Footer";

/**
 * Quick Quote — preview-only route.
 *
 * Recreates the visual chrome of /quote (the public-facing Quick Quote
 * landing page) with the real QuoteForm component wrapped in a
 * <fieldset disabled> so every input, file picker, and submit button
 * inside is non-interactive at the browser level. React's onClick /
 * onChange handlers do not fire on disabled controls, so no server
 * action — including the upload action and the submit handler — can
 * run from inside this preview.
 *
 * Loaded by the Admin Preview Lab inside an iframe at
 * /admin/previews/quote. The path lives under the admin authed segment
 * so the requireAdmin() gate in layout.tsx guards access.
 */

export const metadata: Metadata = {
  title: "Quick Quote — preview",
  robots: { index: false, follow: false },
};

type NextStep = { n: string; title: string; body: string };

const nextSteps: NextStep[] = [
  {
    n: "01",
    title: "Dispatch reviews the lane",
    body: "We check capacity against your pickup window and the lane.",
  },
  {
    n: "02",
    title: "You get a price range within the hour",
    body: "Reply from a real dispatcher with a range — not an auto-quoter.",
  },
  {
    n: "03",
    title: "We confirm details and book",
    body: "Once you’re ready, we lock in pickup, drop, equipment, and rate.",
  },
];

export default function QuotePreviewPage() {
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;

  return (
    <div className="bg-canvas">
      {/* Preview banner — visible to the operator inside the iframe so
          they can never confuse the preview view with the real customer
          screen. */}
      <div className="border-b border-red-300 bg-red-600 px-4 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-white sm:py-2.5">
        Preview only &middot; no email sent &middot; no records changed
      </div>

      {/* Page header — mirrors /quote chrome exactly. */}
      <section className="border-b border-line bg-canvas">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            Request a Quote
          </p>

          <h1 className="mt-5 text-3xl font-display leading-[1.05] tracking-[-0.02em] text-fg sm:text-5xl lg:text-6xl">
            Direct dispatch. Honest pricing.
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-fg sm:text-lg">
            Lane, load, contact. That&rsquo;s all dispatch needs to get back to
            you with a price range. Real dispatcher replies within the hour
            &mdash; no broker layers, no auto-quoters.
          </p>

          {/* Credential strip */}
          <dl className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.18em] uppercase">
            <div className="flex items-baseline gap-2">
              <dt className="text-fg">USDOT</dt>
              <dd className="text-fg">{company.dotNumber}</dd>
            </div>
            <span aria-hidden className="text-red-600">/</span>
            <div className="flex items-baseline gap-2">
              <dt className="text-fg">MC</dt>
              <dd className="text-fg">{company.mcNumber}</dd>
            </div>
            <span aria-hidden className="text-red-600">/</span>
            <div>
              <dt className="sr-only">Operating status</dt>
              <dd className="text-fg">{company.authorityText}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Form + sidebar — QuoteForm wrapped in <fieldset disabled> so no
          server actions can fire. The fieldset is invisible (m-0 border-0
          p-0) so the visual chrome is identical to the real page. */}
      <section>
        <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-3 lg:gap-14 lg:px-8 lg:py-20">
          <div className="lg:col-span-2">
            <fieldset
              disabled
              aria-label="Preview only — interactions disabled"
              className="m-0 border-0 p-0"
            >
              <QuoteForm />
            </fieldset>
          </div>

          <aside
            aria-labelledby="next-steps-heading"
            className="lg:col-span-1"
          >
            <div className="border border-line bg-card/40 p-6 sm:p-7">
              <h2
                id="next-steps-heading"
                className="font-mono text-[10px] tracking-[0.22em] text-fg uppercase"
              >
                What happens next
              </h2>
              <ol className="mt-5 space-y-5">
                {nextSteps.map((step) => (
                  <li key={step.n} className="flex gap-4">
                    <span className="font-mono text-xs text-red-500">
                      {step.n}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-fg">
                        {step.title}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-7 border-t border-line pt-5">
                <h3 className="font-mono text-[10px] tracking-[0.22em] text-fg uppercase">
                  Need to talk to dispatch?
                </h3>
                <a
                  href={phoneHref}
                  className="mt-3 block text-sm font-semibold text-fg hover:text-red-600"
                >
                  {company.dispatchPhone}
                </a>
                <a
                  href={`mailto:${company.dispatchEmail}`}
                  className="block text-sm break-all text-fg hover:text-red-600"
                >
                  {company.dispatchEmail}
                </a>
              </div>

            </div>
          </aside>
        </div>
      </section>
      <Footer />
    </div>
  );
}
