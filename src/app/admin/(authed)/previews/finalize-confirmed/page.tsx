import type { Metadata } from "next";
import Link from "next/link";
import { company } from "@/lib/company";
import { SAMPLE_FINALIZED_QUOTE_CONFIRM } from "@/lib/preview/sample-data";
import { Footer } from "@/components/site/Footer";

/**
 * Confirm Finalized Quote — CONFIRMED state preview.
 *
 * Recreates the visual chrome of /quote/confirm/[token] in its post-
 * confirm success state, where finalizedQuote.confirmedAt is non-null
 * and the page shows the green "Confirmed" panel with the timestamp.
 *
 * No interactive controls render in this state on the production page,
 * so no fieldset wrap is needed — the page is pure display. The
 * matching PENDING state lives at /admin/previews/finalize-pending.
 */

export const metadata: Metadata = {
  title: "Finalized Quote Confirmed — preview",
  robots: { index: false, follow: false },
};

const SAMPLE = SAMPLE_FINALIZED_QUOTE_CONFIRM;

function formatHumanDate(iso: string | null): string {
  if (!iso) return "—";
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
  if (!iso) return "—";
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
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${h12}:${mm} ${ampm}`;
}

function formatUsd(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function FinalizeConfirmedPreviewPage() {
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;

  return (
    <div className="bg-[#050505] text-fg">
      {/* Preview banner */}
      <div className="border-b border-red-300 bg-red-600 px-4 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-white sm:py-2.5">
        Preview only &middot; no email sent &middot; no records changed
      </div>

      <section className="border-b border-[#1a1a1a] bg-gradient-to-b from-[#050505] via-[#0a0a0a] to-[#141414]">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <p className="flex items-center justify-center gap-2 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            Rate confirmation
          </p>
          <h1 className="mt-3 text-center text-3xl font-display leading-[1.05] tracking-[-0.02em] text-fg sm:text-4xl lg:text-5xl">
            Finalized Quote Confirmed
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-fg sm:text-lg">
            Dispatch has received your confirmation. A HARBLANC dispatcher
            will coordinate the next scheduling step.
          </p>

          {/* Summary card */}
          <dl className="mt-7 grid grid-cols-1 gap-x-8 gap-y-4 border-l-4 border-l-red-600 bg-[#1a1a1a] p-5 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] sm:grid-cols-2 sm:p-6 lg:grid-cols-[1fr_2fr_1fr_1fr]">
            <KV label="Quote #">
              <span className="font-mono text-base font-semibold text-fg tabular-nums">
                {SAMPLE.finalizedQuoteNumber}
              </span>
            </KV>
            <KV label="Lane">
              <span className="font-mono text-base font-semibold text-fg">
                {SAMPLE.pickupCity}, {SAMPLE.pickupState}
                <span aria-hidden className="mx-2 text-red-600">
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
            <KV label="Total rate">
              <span className="font-mono text-base font-bold text-fg tabular-nums">
                {formatUsd(SAMPLE.totalAmount)}
              </span>
            </KV>
            <KV label="Valid through">
              <span className="font-mono text-base text-fg tabular-nums">
                {formatHumanDate(SAMPLE.expirationAt)}
              </span>
            </KV>
          </dl>

          {/* Confirmed-at panel */}
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
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-fg">
              A dispatcher will reach out to coordinate pickup and
              delivery windows. Watch for a separate scheduling email
              or call from the dispatch number above.
            </p>
          </div>

          {/* Need help support panel */}
          <div className="mt-7 flex flex-col gap-3 border-l-2 border-l-neutral-600 bg-[#161616] p-4 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.55)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-fg">
                Need dispatch help?
              </p>
            </div>
            <a
              href={phoneHref}
              className="inline-flex items-center gap-1.5 py-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-red-600 transition-colors hover:text-red-700 sm:shrink-0"
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
              className="text-fg underline-offset-4 hover:text-red-600 hover:underline"
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
