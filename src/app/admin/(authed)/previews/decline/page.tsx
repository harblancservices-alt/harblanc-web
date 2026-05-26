import type { Metadata } from "next";
import Link from "next/link";
import { company } from "@/lib/company";
import { DeclineForm } from "@/app/quote/decline/[token]/DeclineForm";
import { SAMPLE_INTAKE_HEADER } from "@/lib/preview/sample-data";

/**
 * Decline quote — preview-only route.
 *
 * Recreates the visual chrome of /quote/decline/[token] with sample data
 * and wraps the DeclineForm in a <fieldset disabled> so the
 * declineEstimate server action cannot fire from inside the preview.
 *
 * The "already declined" and "already accepted" branches of the
 * production page are NOT exercised here — this preview is for the
 * primary decline state operators visually QA most often. Reuses
 * SAMPLE_INTAKE_HEADER for the lane/rate so the preview reads
 * consistently with the other tiles in the Lab.
 */

export const metadata: Metadata = {
  title: "Decline quote — preview",
  robots: { index: false, follow: false },
};

const SAMPLE_RATE_LOW = SAMPLE_INTAKE_HEADER.rateLow;
const SAMPLE_RATE_HIGH = SAMPLE_INTAKE_HEADER.rateHigh;

function formatRate(low: number | null, high: number | null): string {
  if (low == null && high == null) return "—";
  const fmt = (n: number) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  if (low != null && high != null && high > low) return `${fmt(low)} – ${fmt(high)}`;
  return fmt((low ?? high) as number);
}

export default function DeclinePreviewPage() {
  const rate = formatRate(SAMPLE_RATE_LOW, SAMPLE_RATE_HIGH);
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;

  return (
    <div className="bg-neutral-950">
      {/* Preview banner */}
      <div className="border-b border-red-700 bg-red-600 px-4 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-white sm:py-2.5">
        Preview only &middot; no email sent &middot; no records changed
      </div>

      <section className="border-b border-neutral-800 bg-neutral-950">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            Declining quote
          </p>
          <h1 className="mt-5 text-3xl font-display leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl">
            Decline this estimate.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-neutral-300 sm:text-lg">
            The estimate at <span className="font-mono text-white">{rate}</span>{" "}
            on{" "}
            <span className="font-mono text-white">
              {SAMPLE_INTAKE_HEADER.pickupZip} &rarr;{" "}
              {SAMPLE_INTAKE_HEADER.deliveryZip}
            </span>{" "}
            is open. Confirm below if you&rsquo;d like to decline. A short
            note helps dispatch on the next quote, but it&rsquo;s optional.
          </p>

          <p className="mt-6 font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
            Want to talk first?{" "}
            <a
              href={phoneHref}
              className="text-red-400 underline-offset-4 hover:underline"
            >
              {company.dispatchPhone}
            </a>
          </p>
        </div>
      </section>

      {/* DeclineForm wrapped in <fieldset disabled> so the server action
          cannot fire. token / initialReason / alreadyDeclined are stubbed
          for the preview only. */}
      <section className="bg-neutral-950">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <fieldset
            disabled
            aria-label="Preview only — interactions disabled"
            className="m-0 border-0 p-0"
          >
            <DeclineForm
              token="PREVIEW-TOKEN"
              initialReason={null}
              alreadyDeclined={false}
            />
          </fieldset>

          <p className="mt-8 font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
            Changed your mind?{" "}
            <Link
              href="/admin/previews/confirm-shipment"
              className="text-neutral-400 underline-offset-4 hover:text-white hover:underline"
            >
              Accept and finalize instead
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
