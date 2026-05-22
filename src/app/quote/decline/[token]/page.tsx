import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveByToken } from "@/lib/quote-token/lookup";
import { company } from "@/lib/company";
import { DeclineForm } from "./DeclineForm";

export const metadata: Metadata = {
  title: "Decline quote",
  robots: { index: false, follow: false },
};

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

export default async function QuoteDeclinePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolveByToken(token);
  if (!resolved.ok) notFound();
  const { estimate, lead } = resolved;

  // If they already accepted, you can't flip a declined flag without
  // talking to dispatch — show a softer message.
  if (estimate.acceptedAt) {
    return (
      <AcceptedAlreadyView
        rate={formatRate(estimate.linehaulLow, estimate.linehaulHigh)}
      />
    );
  }

  const rate = formatRate(estimate.linehaulLow, estimate.linehaulHigh);
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;

  return (
    <div className="bg-neutral-950">
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
              {lead.pickupZip ?? "—"} &rarr; {lead.deliveryZip ?? "—"}
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

      <section className="bg-neutral-950">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <DeclineForm
            token={token}
            initialReason={estimate.declinedReason}
            alreadyDeclined={Boolean(estimate.declinedAt)}
          />

          <p className="mt-8 font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
            Changed your mind?{" "}
            <Link
              href={`/quote/accept/${token}`}
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

function AcceptedAlreadyView({ rate }: { rate: string }) {
  return (
    <div className="bg-neutral-950">
      <section className="border-b border-neutral-800 bg-neutral-950">
        <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-green-500 uppercase">
            <span aria-hidden className="inline-block h-3 w-1 bg-green-600" />
            Already accepted
          </p>
          <h1 className="mt-5 text-3xl font-display leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl">
            This estimate was accepted.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-neutral-300 sm:text-lg">
            The estimate at {rate} was already accepted and intake started.
            If you need to back out, reply to the original quote email so
            dispatch can sort it out manually — they can&rsquo;t auto-cancel
            after acceptance.
          </p>
          <div className="mt-8">
            <Link
              href="/"
              className="btn-outline-cut inline-flex items-center justify-center px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100"
            >
              Back to home
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
