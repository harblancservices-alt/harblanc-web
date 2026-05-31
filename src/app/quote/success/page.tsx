import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { company } from "@/lib/company";
import { JourneyMap } from "@/components/quote/JourneyMap";

export const metadata: Metadata = {
  title: "Request received",
  description:
    "Your freight request reached dispatch. A real dispatcher will reply personally with a price range.",
  robots: { index: false, follow: false },
};

/**
 * Quick Quote success page.
 *
 * Sections (top to bottom):
 *   1. Dispatch acknowledgment hero (preamble + "Request Received" headline
 *      + one-line subhead + operational data strip carrying response SLA
 *      and current status). Lane photo background with a dark overlay.
 *   2. <JourneyMap /> — the "What happens next" milestone route board
 *   3. Dispatch help band — primary Call button + quiet Email link
 *   4. Operational footer with carrier authority + site nav
 *
 * Reads like a dispatch ticket, not a marketing landing page.
 */

export default function QuoteSuccessPage() {
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;
  const mailHref = `mailto:${company.dispatchEmail}`;

  return (
    <div className="bg-[#050505] text-zinc-100">
      {/* Letter-style hero with overhead lane photo as background */}
      <section className="relative overflow-hidden border-b border-[#1a1a1a]">
        {/* Lane photo */}
        <div
          aria-hidden
          className="absolute inset-0 bg-cover"
          style={{
            backgroundImage: "url('/brand/Overhead.jpg')",
            backgroundPosition: "center 38%",
          }}
        />
        {/* Dark gradient overlay — keeps the white headline readable */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-[#050505]/30 via-[#050505]/45 to-[#141414]/65"
        />
        <div className="relative mx-auto max-w-3xl px-4 pb-32 pt-16 sm:px-6 sm:pb-44 sm:pt-20 lg:px-8 lg:pb-52 lg:pt-24">
          <div aria-hidden className="absolute bottom-0 left-[34px] top-0 w-px bg-green-500 sm:left-[46px] lg:left-[54px]" />
<h1 className="flex items-center justify-center gap-4 text-center text-3xl font-display font-medium leading-[1.1] tracking-[-0.015em] text-white sm:text-4xl lg:text-5xl">
            <span aria-hidden className="inline-block h-8 w-1.5 bg-green-500 sm:h-10 lg:h-12" />
            Request Received
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-zinc-200 sm:text-lg">
            Dispatch has received your request. A coordinator will review the shipment and prepare your quote.
          </p>

        </div>
      </section>
      {/* Floating data panel — straddles the hero/journey boundary */}
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


      {/* Dispatch support + carrier authority footer */}
      <section className="border-t border-[#1a1a1a] bg-[#0a0a0a]">
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-8 lg:px-8 lg:pb-14 lg:pt-10">
          {/* Eyebrow */}
          <p className="flex items-center justify-center gap-2 font-mono text-base font-bold uppercase tracking-[0.16em] text-white sm:text-lg">
            <span aria-hidden className="inline-block h-5 w-1 bg-red-600 sm:h-6" />
            Need instant dispatch support?
          </p>

          {/* Main row — dispatch contact, centered */}
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

          {/* Authority strip + nav */}
          <div className="mt-10 border-t border-[#1a1a1a] pt-6">
            <div className="flex flex-col items-center justify-center gap-6 text-center">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white sm:text-[11px]">
                  HARBLANC Services LLC
                </p>
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500 sm:text-[11px]">
                  USDOT {company.dotNumber} · MC {company.mcNumber} · Licensed &amp; Insured
                </p>
              </div>
              <nav className="flex items-center gap-5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] sm:text-[11px]">
                <Link href="/" className="text-zinc-300 transition-colors hover:text-white">
                  Home
                </Link>
                <Link href="/quote" className="text-zinc-300 transition-colors hover:text-white">
                  Quote
                </Link>
                <Link href="/apply" className="text-zinc-300 transition-colors hover:text-white">
                  Carriers
                </Link>
              </nav>
            </div>
          </div>

          {/* HARBLANC mark */}
          <div className="mt-6 flex justify-center">
            <Image
              src="/brand/logo-mark.png"
              alt="HARBLANC"
              width={637}
              height={574}
              className="h-16 w-auto opacity-80"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
