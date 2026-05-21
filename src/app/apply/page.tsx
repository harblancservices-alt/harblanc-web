import type { Metadata } from "next";
import { ApplyForm } from "@/components/apply/ApplyForm";
import { company } from "@/lib/company";

export const metadata: Metadata = {
  title: "Join the Fleet",
  description:
    "Owner-operator application for HARBLANC SERVICES LLC. Direct dispatch, honest pay, real freight.",
};

type NextStep = { n: string; title: string; body: string };

const nextSteps: NextStep[] = [
  {
    n: "01",
    title: "Dispatch reviews your application",
    body: "We read the details and check fit against current and upcoming lanes.",
  },
  {
    n: "02",
    title: "We get in touch",
    body: "Quick follow-up by phone or email. Real conversation, not a form-letter.",
  },
  {
    n: "03",
    title: "Paperwork + first load",
    body: "Onboarding paperwork, insurance verification, then a starting lane that fits your equipment.",
  },
];

export default function ApplyPage() {
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;

  return (
    <div className="bg-neutral-950">
      {/* Page header */}
      <section className="border-b border-neutral-800 bg-neutral-950">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            Join the Fleet
          </p>

          <h1 className="mt-5 text-3xl font-display leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl lg:text-6xl">
            Drive direct.
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-neutral-300 sm:text-lg">
            We run owner-operated dispatch. No broker layers, no auto-replies,
            no chasing pay. Tell us about your equipment and experience and
            we&rsquo;ll get back to you direct.
          </p>

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
            <ApplyForm />
          </div>

          <aside
            aria-labelledby="apply-next-steps-heading"
            className="lg:col-span-1"
          >
            <div className="border border-neutral-800 bg-neutral-900/40 p-6 sm:p-7">
              <h2
                id="apply-next-steps-heading"
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
                  Talk to dispatch directly
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
                  Your application goes directly to dispatch. We don&rsquo;t
                  share your contact info or run it through a recruiting
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
