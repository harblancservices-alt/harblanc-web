import type { Metadata } from "next";
import { QuoteForm } from "@/components/quote/QuoteForm";
import { company } from "@/lib/company";

export const metadata: Metadata = {
  title: "Request a Freight Quote",
  description:
    "Get a freight quote from HARBLANC SERVICES LLC dispatch. Hotshot, expedited, equipment, and general freight.",
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
    body: "Reply from a real dispatcher with a range \u2014 not an auto-quoter.",
  },
  {
    n: "03",
    title: "We confirm details and book",
    body: "Once you\u2019re ready, we lock in pickup, drop, equipment, and rate.",
  },
];

export default function QuotePage() {
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;

  return (
    <div className="bg-neutral-950">
      {/* Page header */}
      <section className="border-b border-neutral-800 bg-neutral-950">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            Request a Quote
          </p>

          <h1 className="mt-5 text-3xl font-display leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl lg:text-6xl">
            Direct dispatch. Honest pricing.
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-neutral-300 sm:text-lg">
            Lane, load, contact. That’s all dispatch needs to get back to you
            with a price range. Real dispatcher replies within the hour — no
            broker layers, no auto-quoters.
          </p>

          {/* Credential strip \u2014 mono manifest style */}
          <dl className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.18em] uppercase">
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

      {/* Form + sidebar */}
      <section>
        <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-3 lg:gap-14 lg:px-8 lg:py-20">
          <div className="lg:col-span-2">
            <QuoteForm />
          </div>

          <aside
            aria-labelledby="next-steps-heading"
            className="lg:col-span-1"
          >
            <div className="border border-neutral-800 bg-neutral-900/40 p-6 sm:p-7">
              <h2
                id="next-steps-heading"
                className="font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase"
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

              <div className="mt-7 border-t border-neutral-800 pt-5">
                <h3 className="font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase">
                  Need to talk to dispatch?
                </h3>
                <a
                  href={phoneHref}
                  className="mt-3 block text-sm font-semibold text-zinc-100 hover:text-white"
                >
                  {company.dispatchPhone}
                </a>
                <a
                  href={`mailto:${company.dispatchEmail}`}
                  className="block text-sm break-all text-zinc-300 hover:text-white"
                >
                  {company.dispatchEmail}
                </a>
              </div>

              <div className="mt-6 border-t border-neutral-800 pt-5">
                <h3 className="font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase">
                  Privacy
                </h3>
                <p className="mt-3 text-xs leading-relaxed text-neutral-400">
                  Your request goes directly to dispatch. We don’t share your
                  contact info, sell leads, or route this through a broker
                  network.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
