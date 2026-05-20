import type { Metadata } from "next";
import { QuoteForm } from "@/components/quote/QuoteForm";
import { company } from "@/lib/company";

export const metadata: Metadata = {
  title: "Request a Freight Quote",
  description:
    "Get a freight quote from HARBLANC SERVICES LLC dispatch. Hotshot, expedited, equipment, and general freight.",
};

export default function QuotePage() {
  return (
    <div className="bg-neutral-950">
      {/* Page header */}
      <section className="border-b border-neutral-800">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-red-500 uppercase">
            <span className="inline-block h-3 w-1 bg-red-600" aria-hidden />
            Request a Quote
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Tell us about the load.
          </h1>
          <p className="mt-4 text-base text-zinc-400 sm:text-lg">
            A few quick details on pickup, delivery, and equipment is all we
            need. Pricing comes back directly from dispatch — no broker
            layers, no auto-replies.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-500">
            <li className="font-mono">{company.dot}</li>
            <li aria-hidden className="text-zinc-700">·</li>
            <li className="font-mono">{company.mc}</li>
            <li aria-hidden className="text-zinc-700">·</li>
            <li>Licensed &amp; insured motor carrier</li>
          </ul>
        </div>
      </section>

      {/* Form */}
      <section>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <QuoteForm />
        </div>
      </section>
    </div>
  );
}
