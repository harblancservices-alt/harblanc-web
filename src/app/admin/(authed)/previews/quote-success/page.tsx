import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { company } from "@/lib/company";
import { JourneyMap } from "@/components/quote/JourneyMap";
import { Footer } from "@/components/site/Footer";

/**
 * Quick Quote success — preview-only route. Mirrors /quote/success
 * with a red preview banner at the top.
 */

export const metadata: Metadata = {
  title: "Request received — preview",
  robots: { index: false, follow: false },
};

export default function QuoteSuccessPreviewPage() {
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;
  const mailHref = `mailto:${company.dispatchEmail}`;

  return (
    <div className="bg-[#050505] text-zinc-100">
      <div className="border-b border-red-700 bg-red-600 px-4 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-white sm:py-2.5">
        Preview only &middot; no email sent &middot; no records changed
      </div>

      <section className="relative overflow-hidden border-b border-[#1a1a1a]">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover"
          style={{
            backgroundImage: "url('/brand/Overhead.jpg')",
            backgroundPosition: "center 38%",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-[#050505]/30 via-[#050505]/45 to-[#141414]/65"
        />
        <div className="relative mx-auto max-w-3xl px-4 pb-32 pt-16 sm:px-6 sm:pb-44 sm:pt-20 lg:px-8 lg:pb-52 lg:pt-24">
          <h1 className="flex items-center justify-center gap-4 text-center text-3xl font-display font-medium leading-[1.1] tracking-[-0.015em] text-white sm:text-4xl lg:text-5xl">
            <span aria-hidden className="inline-block h-8 w-1.5 bg-green-500 sm:h-10 lg:h-12" />
            Request Received
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-white sm:text-lg">
            Dispatch has received your request. A coordinator will review the shipment and prepare your quote.
          </p>
        </div>
      </section>

      <div className="relative z-10 -mt-2 px-4 sm:-mt-6 sm:px-6 lg:-mt-10 lg:px-8">
        <dl className="mx-auto grid max-w-3xl grid-cols-1 gap-x-8 gap-y-3 border-l-4 border-l-green-500 bg-[#1a1a1a] p-5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)] sm:grid-cols-2 sm:p-6">
          <div className="text-center">
            <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-green-500">
              Estimated response
            </dt>
            <dd className="mt-1.5 font-mono text-base font-medium text-white sm:text-lg">
              Within 1 business day
            </dd>
          </div>
          <div className="text-center sm:border-l sm:border-l-[#27272a] sm:pl-8">
            <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-green-500">
              Status
            </dt>
            <dd className="mt-1.5 font-mono text-base font-medium text-white sm:text-lg">
              Shipment under review
            </dd>
          </div>
        </dl>
      </div>

      <JourneyMap />

      <section className="border-t border-[#1a1a1a] bg-[#0a0a0a]">
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-8 lg:px-8 lg:pb-14 lg:pt-10">
          <p className="flex items-center justify-center gap-2 font-mono text-base font-bold uppercase tracking-[0.16em] text-white sm:text-lg">
            <span aria-hidden className="inline-block h-5 w-1 bg-red-600 sm:h-6" />
            Need instant dispatch support?
          </p>

          <div className="mt-8 flex flex-col items-center gap-5 text-center">
            <div className="flex flex-col items-center gap-4">
              <a
                href={phoneHref}
                className="btn-cut mt-3 inline-flex min-w-[240px] items-center justify-center whitespace-nowrap border border-red-600 bg-zinc-800 px-6 py-3 font-mono text-base font-bold tabular-nums uppercase tracking-[0.14em] text-white transition-colors hover:bg-zinc-700 sm:text-lg"
              >
                <span>{company.dispatchPhone.replace(/[^\d]/g, "").replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}</span>
              </a>
              <a
                href={mailHref}
                className="btn-cut mt-3 inline-flex min-w-[240px] items-center justify-center border border-red-600 bg-zinc-800 px-6 py-3 font-mono text-base font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-zinc-700 sm:text-lg"
              >
                Email Us
              </a>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
