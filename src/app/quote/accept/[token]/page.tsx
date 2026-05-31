import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { resolveByToken } from "@/lib/quote-token/lookup";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { company } from "@/lib/company";
import { IntakeForm, type IntakeFormDefaults } from "./IntakeForm";
import { type IntakeUploadRow } from "./IntakeUploads";

/**
 * Load the customer's existing uploads for this lead, newest first.
 * Service-role read — the token gate already happened in resolveByToken.
 */
async function loadIntakeUploads(
  quoteRequestId: string,
): Promise<IntakeUploadRow[]> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("shipment_intake_uploads")
    .select("id, original_filename, mime_type, size_bytes, note, created_at")
    .eq("quote_request_id", quoteRequestId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id,
    originalFilename: r.original_filename,
    mimeType: r.mime_type,
    sizeBytes: Number(r.size_bytes),
    note: r.note,
    createdAt: r.created_at,
  }));
}

export const metadata: Metadata = {
  title: "Confirm Shipment Details",
  description: "Confirm the estimate range and provide the shipment details dispatch needs before locking the truck.",
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

function num(v: number | null): string {
  return v == null ? "" : String(v);
}

/**
 * Customer-facing date formatter for the top summary. Accepts a
 * canonical "YYYY-MM-DD" ISO date string (the form Supabase returns
 * for `date` columns) and renders as "May 25, 2026". Parsed
 * component-wise so the wall-clock day doesn't drift across timezones
 * — a valid-through date shouldn't shift on the customer's device
 * clock.
 *
 *   "2026-05-25" → "May 25, 2026"
 *   "2026-01-01" → "January 1, 2026"
 *   null / ""    → "—"
 */
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

/**
 * Build the customer-facing quote reference from the lead's UUID.
 * Same shape email renderers and the Finalized Quote workspace use —
 * last 8 hex chars of the UUID, upper-case, hyphenated, prefixed with
 * "HS-". Returns "" for an obviously malformed id (defensive only;
 * lead.id is always a real UUID at this point).
 *
 *   "00000000-0000-0000-0000-0000a4f29b1c" → "HS-A4F2-9B1C"
 */
/**
 * Format a lane endpoint for the summary card. Real freight is named
 * by city and state ("Denver, CO"), not by a database ZIP code. When
 * city+state are both available, we render them as the primary line
 * and demote the ZIP to a small secondary line below. When only ZIP
 * is available (uncommon — quote_requests usually carries both), we
 * fall back to ZIP-as-primary so the lane still reads sensibly.
 */
type LaneEndpoint = { primary: string; secondary: string };

function formatLaneEndpoint(
  city: string | null,
  state: string | null,
  zip: string | null,
): LaneEndpoint {
  if (city && state) {
    return { primary: `${city}, ${state}`, secondary: zip ?? "" };
  }
  if (zip) {
    return { primary: zip, secondary: "" };
  }
  return { primary: "—", secondary: "" };
}

function quoteRefNumber(uuid: string): string {
  const hex = uuid.replace(/-/g, "");
  if (hex.length < 8) return "";
  const tail = hex.slice(-8).toUpperCase();
  return `HS-${tail.slice(0, 4)}-${tail.slice(4)}`;
}

/**
 * Backward-compat helper for the date-window migration. If the new
 * pickup_window_start / delivery_window_start columns are null but the
 * legacy free-text pickup_window / delivery_window column happens to be
 * a YYYY-MM-DD date string (which it always is for newly-submitted
 * intakes from before the migration, because the old form used a
 * native date input), surface it as the start-date default so the
 * customer doesn't lose their prior input.
 */
function isIsoDate(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function QuoteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolveByToken(token);
  if (!resolved.ok) notFound();
  const { estimate, lead, intake } = resolved;

  // If they've already declined, surface that state instead of the
  // intake form.
  if (estimate.declinedAt) {
    return (
      <DeclinedView
        rate={formatRate(estimate.linehaulLow, estimate.linehaulHigh)}
      />
    );
  }

  const initialStatus: "in_progress" | "submitted" | "new" =
    intake?.status ?? "new";

  // Pre-fill what we know — pickup ZIP from the original quote, exact
  // weight as a starting point, commodity as a kicker for the longer
  // description field.
  // Backward-compat: if the new start columns are null but the legacy
  // free-text column happens to hold a YYYY-MM-DD value (true for every
  // intake submitted via the prior single-date UI), surface it as the
  // start-date default. The legacy text columns are also still
  // populated by the server actions on every save going forward — see
  // the derive-text branch in /quote/accept/[token]/actions.ts.
  const pickupStartFallback = isIsoDate(intake?.pickupWindow ?? null)
    ? (intake?.pickupWindow as string)
    : "";
  const deliveryStartFallback = isIsoDate(intake?.deliveryWindow ?? null)
    ? (intake?.deliveryWindow as string)
    : "";

  const defaults: IntakeFormDefaults = {
    pickupCompany: intake?.pickupCompany ?? "",
    pickupContactName: intake?.pickupContactName ?? "",
    pickupContactPhone: intake?.pickupContactPhone ?? "",
    pickupContactEmail: intake?.pickupContactEmail ?? "",
    pickupAddressLine1: intake?.pickupAddressLine1 ?? "",
    pickupAddressLine2: intake?.pickupAddressLine2 ?? "",
    pickupCity: intake?.pickupCity ?? "",
    pickupState: intake?.pickupState ?? "",
    pickupZip: intake?.pickupZip ?? lead.pickupZip ?? "",
    pickupWindowStart:
      intake?.pickupWindowStart ?? pickupStartFallback,
    pickupWindowEnd: intake?.pickupWindowEnd ?? "",
    deliveryCompany: intake?.deliveryCompany ?? "",
    deliveryContactName: intake?.deliveryContactName ?? "",
    deliveryContactPhone: intake?.deliveryContactPhone ?? "",
    deliveryContactEmail: intake?.deliveryContactEmail ?? "",
    deliveryAddressLine1: intake?.deliveryAddressLine1 ?? "",
    deliveryAddressLine2: intake?.deliveryAddressLine2 ?? "",
    deliveryCity: intake?.deliveryCity ?? "",
    deliveryState: intake?.deliveryState ?? "",
    deliveryZip: intake?.deliveryZip ?? lead.deliveryZip ?? "",
    deliveryWindowStart:
      intake?.deliveryWindowStart ?? deliveryStartFallback,
    deliveryWindowEnd: intake?.deliveryWindowEnd ?? "",
    commodityDetails: intake?.commodityDetails ?? lead.commodity ?? "",
    lengthIn: num(intake?.lengthIn ?? null),
    widthIn: num(intake?.widthIn ?? null),
    heightIn: num(intake?.heightIn ?? null),
    exactWeightLbs: num(intake?.exactWeightLbs ?? null),
    loadingResponsibility: intake?.loadingResponsibility ?? "",
    unloadingResponsibility: intake?.unloadingResponsibility ?? "",
    appointmentStatus: intake?.appointmentStatus ?? "",
    specialRequirements: intake?.specialRequirements ?? "",
    referenceLinks: intake?.referenceLinks ?? "",
    notes: intake?.notes ?? "",
  };

  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;
  const mailHref = `mailto:${company.dispatchEmail}`;
  const rate = formatRate(estimate.linehaulLow, estimate.linehaulHigh);
  const initialUploads = await loadIntakeUploads(lead.id);

  return (
    // Premium trucking intake portal — three-layer depth model.
    //
    //   Page    = #050505  (deepest near-black)
    //   Cards   = #1a1a1a  (clearly lifted graphite)
    //   Inputs  = #2e2e2e  (clearly lighter editable wells)
    //
    // Each tonal step is ~8 luminance points apart so the layering reads
    // immediately on any monitor. Red 4px left strips mark every
    // operational card. The public Navbar above (also dark) flows into
    // this surface without a tonal jump.
    <div className="bg-[#050505] text-zinc-100">
      {/* Header band — gradient runs from pitch-black at top down into
          graphite, giving the hero genuine cinematic motion. */}
      <section className="border-b border-[#1a1a1a] bg-gradient-to-b from-[#050505] via-[#0a0a0a] to-[#141414]">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          {/* Centered title block — preamble label, h1, and supporting
              copy share a single centered hero treatment so the page
              reads as a polished customer portal rather than admin
              paperwork. A green vertical spine drops from the top of
              the hero down to meet the red border on the lane summary
              card below, visually leading the eye into the quote. The
              -top-10/-14/-16 values cancel the outer container's py
              top padding so the spine touches the top of the section;
              -bottom-7 covers the dl's mt-7 gap so it lands exactly on
              the red border. */}
          <div className="relative">
            <div
              aria-hidden
              className="absolute -bottom-7 left-0 -top-10 w-1 bg-green-500 sm:-top-14 lg:-top-16"
            />
            <p className="flex items-center justify-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-red-600">
              <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
              Shipment finalization
            </p>
            <h1 className="mt-3 text-center text-3xl font-display leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-5xl">
              Confirm Shipment Details
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-zinc-300 sm:text-lg">
              These details let dispatch confirm equipment, finalize the
              rate, and coordinate pickup and delivery. A dispatcher
              reviews the shipment before any scheduling call is made.
            </p>
          </div>

          {/* Lane / estimate summary — four KVs in a freight-document
              header row. Money renders in white (red money reads as
              "warning" to customers); HARBLANC red is restricted to
              the 4px accent strip on the card edge and the small "→"
              arrow between lane endpoints. Dates run through
              formatHumanDate so the valid-through reads "May 25, 2026"
              rather than the raw ISO date. */}
          {(() => {
            // Format both endpoints once so the JSX below stays readable.
            const pickup = formatLaneEndpoint(
              lead.pickupCity,
              lead.pickupState,
              lead.pickupZip,
            );
            const delivery = formatLaneEndpoint(
              lead.deliveryCity,
              lead.deliveryState,
              lead.deliveryZip,
            );
            const showZipSecondary =
              pickup.secondary.length > 0 || delivery.secondary.length > 0;
            return (
              // 4-cell freight-document header row. Lane spans 2 columns
              // at lg so the "City, ST → City, ST" string never wraps —
              // the lane is the emotional anchor of the summary, not a
              // narrow cell forced to wrap. Other cells stay 1fr each.
              <dl className="mt-7 grid grid-cols-1 gap-x-8 gap-y-4 border-l-4 border-l-red-600 bg-[#1a1a1a] p-5 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] sm:grid-cols-2 sm:p-6 lg:grid-cols-[1fr_2fr_1fr_1fr]">
                <KV label="Quote #">
                  <span className="font-mono text-base font-semibold text-white tabular-nums">
                    {quoteRefNumber(lead.id) || "—"}
                  </span>
                </KV>
                <KV label="Lane">
                  <span className="font-mono text-base font-semibold text-white">
                    {pickup.primary}
                    <span
                      aria-hidden
                      className="mx-2 text-red-600"
                    >
                      &rarr;
                    </span>
                    {delivery.primary}
                  </span>
                  {showZipSecondary ? (
                    // ZIP demoted to a small operational secondary line —
                    // present for dispatch reference, but visually
                    // subordinate to the named city/state lane.
                    <span className="mt-1 block font-mono text-[11px] text-zinc-500 tabular-nums">
                      {pickup.secondary || "—"}
                      <span
                        aria-hidden
                        className="mx-1.5 text-zinc-600"
                      >
                        &rarr;
                      </span>
                      {delivery.secondary || "—"}
                    </span>
                  ) : null}
                </KV>
                <KV label="Estimate range">
                  <span className="font-mono text-base font-bold text-white tabular-nums">
                    {rate}
                  </span>
                </KV>
                <KV label="Valid through">
                  <span className="font-mono text-base text-white tabular-nums">
                    {formatHumanDate(estimate.expirationAt)}
                  </span>
                </KV>
              </dl>
            );
          })()}

          {/* Need dispatch help? — compact support panel marked by a
              neutral left strip (not the red operational strip) so it
              reads as related help rather than another form section.
              Same shadow as the operational cards for layer parity. */}
          <div className="mt-6 flex flex-col gap-3 border-l-2 border-l-neutral-600 bg-[#161616] p-4 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.55)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                Need dispatch help?
              </p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-200">
                Reach a dispatcher directly to clarify load specs,
                equipment, or scheduling before submitting.{" "}
                <span className="font-medium text-zinc-100 tabular-nums">
                  {company.dispatchPhone}
                </span>
              </p>
            </div>
            {/* Text-link affordance, not a button. The phone number is
                already visible in the sentence above; this is the
                "tap to call" mirror in mono-uppercase freight voice.
                py-1 keeps a touch-friendly tap target without giving
                it button geometry. */}
            <a
              href={phoneHref}
              className="btn-cut inline-flex items-center justify-center gap-2 whitespace-nowrap border border-red-600 bg-zinc-800 px-6 py-3 font-mono text-base font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-zinc-700 sm:shrink-0 sm:text-lg"
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

      {/* Intake form — main interaction. The Documents & Photos uploader
          renders INSIDE this form (between Logistics and Notes & links)
          so it disappears alongside the form once the customer submits —
          uploads are pre-confirmation only and never surface after the
          success card replaces the editable branch. */}
      <section className="bg-[#050505]">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
          <IntakeForm
            token={token}
            defaults={defaults}
            initialStatus={initialStatus}
            initialUploads={initialUploads}
          />

          <p className="mt-8 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Changed your mind?{" "}
            <Link
              href={`/quote/decline/${token}`}
              className="text-zinc-300 underline-offset-4 hover:text-red-400 hover:underline"
            >
              Decline this estimate instead
            </Link>
          </p>
        </div>
      </section>
      {/* Dispatch support + carrier authority footer */}
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

          <div className="mt-10 border-t border-[#1a1a1a] pt-6">
            <div className="flex flex-col items-center justify-center gap-6 text-center">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white sm:text-[11px]">
                  HARBLANC Services LLC
                </p>
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500 sm:text-[11px]">
                  USDOT {company.dotNumber} &middot; MC {company.mcNumber} &middot; Licensed &amp; Insured
                </p>
              </div>
              <nav className="flex items-center gap-5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] sm:text-[11px]">
                <Link href="/" className="text-zinc-300 transition-colors hover:text-white">Home</Link>
                <Link href="/quote" className="text-zinc-300 transition-colors hover:text-white">Quote</Link>
                <Link href="/apply" className="text-zinc-300 transition-colors hover:text-white">Carriers</Link>
              </nav>
            </div>
          </div>

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

function KV({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}

function DeclinedView({ rate }: { rate: string }) {
  return (
    <div className="bg-[#050505] text-zinc-100">
      <section className="border-b border-[#1a1a1a] bg-gradient-to-b from-[#050505] via-[#0a0a0a] to-[#141414]">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-red-600">
            <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            Declined
          </p>
          <h1 className="mt-3 text-3xl font-display leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-5xl">
            This estimate was declined.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">
            The estimate at {rate} was already declined and isn&rsquo;t open
            for finalization. If you&rsquo;d like to revisit the lane, reply
            to the original quote email or contact dispatch directly.
          </p>
          <div className="mt-8">
            <Link
              href="/"
              className="btn-cut inline-flex min-w-[200px] items-center justify-center whitespace-nowrap border border-red-600 bg-zinc-800 px-6 py-3 font-mono text-base font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-zinc-700 sm:text-lg"
            >
              Back to home
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
