import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { company } from "@/lib/company";
import { IntakeForm } from "@/app/quote/accept/[token]/IntakeForm";
import {
  SAMPLE_INTAKE_DEFAULTS,
  SAMPLE_INTAKE_HEADER,
} from "@/lib/preview/sample-data";
import { Footer } from "@/components/site/Footer";

/**
 * Confirm Shipment Details — preview-only route.
 *
 * Recreates the exact visual chrome of /quote/accept/[token]/page.tsx
 * with sample data, then wraps the IntakeForm in a <fieldset disabled>
 * so every input, file picker, and submit button is non-interactive at
 * the browser level. The form's onClick / onChange handlers never fire,
 * so no server actions can run from inside this preview no matter what
 * the operator clicks.
 *
 * Loaded by the Admin Preview Lab inside an iframe at
 * /admin/previews/confirm-shipment. The path lives under the admin
 * authed segment so the standard requireAdmin() gate in layout.tsx
 * guards access — no public token route exposes this preview.
 *
 * The "decline" link is omitted because that flow uses a real token
 * and is not part of what we're previewing. Everything else matches
 * the customer page byte-for-byte so visual QA reflects production.
 */

export const metadata: Metadata = {
  title: "Confirm Shipment Details — preview",
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
  if (low != null && high != null && high > low) {
    return `${fmt(low)} – ${fmt(high)}`;
  }
  return fmt((low ?? high) as number);
}

// Local helpers — keep in lockstep with the real customer page so the
// Preview Lab reflects what production renders.
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

const SAMPLE_QUOTE_REF = "HS-A4F2-9B1C";

export default function ConfirmShipmentPreviewPage() {
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;
  const rate = formatRate(
    SAMPLE_INTAKE_HEADER.rateLow,
    SAMPLE_INTAKE_HEADER.rateHigh,
  );

  return (
    // Mirrors the real customer page chrome — three-layer depth model
    // on a deep #050505 shell. Keep this file in lockstep with
    // src/app/quote/accept/[token]/page.tsx so the Preview Lab reflects
    // the production-equivalent surface.
    <div className="bg-[#050505] text-fg">
      {/* Preview banner — visible to the operator inside the iframe so
          they can never confuse the preview view with the real customer
          screen. */}
      <div className="border-b border-red-300 bg-red-600 px-4 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-white sm:py-2.5">
        Preview only &middot; no email sent &middot; no records changed
      </div>

      <section className="border-b border-[#1a1a1a] bg-gradient-to-b from-[#050505] via-[#0a0a0a] to-[#141414]">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <div className="relative">
            <div
              aria-hidden
              className="absolute -bottom-7 left-0 -top-10 w-1 bg-green-500 sm:-top-14 lg:-top-16"
            />
            <p className="flex items-center justify-center gap-2 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
              <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
              Shipment finalization
            </p>
            <h1 className="mt-3 text-center text-3xl font-display leading-[1.05] tracking-[-0.02em] text-fg sm:text-4xl lg:text-5xl">
              Confirm Shipment Details
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-fg sm:text-lg">
              Providing accurate shipment details helps dispatch confirm the
              correct equipment, timing, and final rate before scheduling.
            </p>
          </div>

          <dl className="mt-7 grid grid-cols-1 gap-x-8 gap-y-4 border-l-4 border-l-red-600 bg-[#1a1a1a] p-5 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] sm:grid-cols-2 sm:p-6 lg:grid-cols-[1fr_2fr_1fr_1fr]">
            <KV label="Quote #">
              <span className="font-mono text-base font-semibold text-fg tabular-nums">
                {SAMPLE_QUOTE_REF}
              </span>
            </KV>
            <KV label="Lane">
              <span className="font-mono text-base font-semibold text-fg">
                {SAMPLE_INTAKE_HEADER.pickupCity},{" "}
                {SAMPLE_INTAKE_HEADER.pickupState}
                <span aria-hidden className="mx-2 text-red-600">
                  &rarr;
                </span>
                {SAMPLE_INTAKE_HEADER.deliveryCity},{" "}
                {SAMPLE_INTAKE_HEADER.deliveryState}
              </span>
              <span className="mt-1 block font-mono text-[11px] text-fg tabular-nums">
                {SAMPLE_INTAKE_HEADER.pickupZip}
                <span aria-hidden className="mx-1.5 text-red-600">
                  &rarr;
                </span>
                {SAMPLE_INTAKE_HEADER.deliveryZip}
              </span>
            </KV>
            <KV label="Estimate range">
              <span className="font-mono text-base font-bold text-fg tabular-nums">
                {rate}
              </span>
            </KV>
            <KV label="Valid through">
              <span className="font-mono text-base text-fg tabular-nums">
                {formatHumanDate(SAMPLE_INTAKE_HEADER.expirationAt)}
              </span>
            </KV>
          </dl>

          <div className="mt-6 flex flex-col gap-3 border-l-2 border-l-neutral-600 bg-[#161616] p-4 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.55)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[10px] tracking-[0.22em] text-fg uppercase">
                Need dispatch help?
              </p>
            </div>
            <a
              href={phoneHref}
              className="btn-outline-cut-light inline-flex items-center justify-center gap-2 whitespace-nowrap px-6 py-3 text-base font-bold uppercase tracking-[0.14em] text-fg transition-colors sm:shrink-0 sm:text-lg"
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

      {/* Intake form — wrapped in <fieldset disabled> so every input,
          select, textarea, file picker, and button inside is disabled at
          the browser level. React's onClick/onChange handlers will not
          fire on disabled controls, so no server action can run from
          inside this preview. The fieldset itself has no border / padding
          to keep the visual chrome identical to the real customer page. */}
      <section className="bg-[#050505]">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
          <fieldset
            disabled
            aria-label="Preview only — interactions disabled"
            className="m-0 border-0 p-0"
          >
            <IntakeForm
              token="PREVIEW-TOKEN"
              defaults={SAMPLE_INTAKE_DEFAULTS}
              initialStatus="new"
              initialUploads={[]}
            />
          </fieldset>
        </div>
      </section>
      {/* Dispatch support + carrier authority footer */}
      <section className="border-t border-[#1a1a1a] bg-[#0a0a0a]">
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-8 lg:px-8 lg:pb-14 lg:pt-10">
          <p className="flex items-center justify-center gap-2 font-mono text-base font-bold uppercase tracking-[0.16em] text-fg sm:text-lg">
            <span aria-hidden className="inline-block h-5 w-1 bg-red-600 sm:h-6" />
            Need instant dispatch support?
          </p>

          <div className="mt-8 flex flex-col items-center gap-5 text-center">
            <div className="flex flex-col items-center gap-4">
              <a href={phoneHref} className="btn-outline-cut-light mt-3 inline-flex min-w-[240px] items-center justify-center whitespace-nowrap px-6 py-3 text-base font-bold tabular-nums uppercase tracking-[0.14em] text-fg transition-colors sm:text-lg">
                <span>{company.dispatchPhone.replace(/[^\d]/g, "").replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}</span>
              </a>
              <a href={`mailto:${company.dispatchEmail}`} className="btn-outline-cut-light mt-3 inline-flex min-w-[240px] items-center justify-center px-6 py-3 text-base font-bold uppercase tracking-[0.14em] text-fg transition-colors sm:text-lg">Email Us</a>
            </div>
          </div>
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
      <dt className="font-mono text-[10px] tracking-[0.22em] text-fg uppercase">
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}
