import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveByToken } from "@/lib/quote-token/lookup";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { company } from "@/lib/company";
import { IntakeForm, type IntakeFormDefaults } from "./IntakeForm";
import { IntakeUploads, type IntakeUploadRow } from "./IntakeUploads";

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
  title: "Finalize shipment details",
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
    pickupWindow: intake?.pickupWindow ?? "",
    deliveryCompany: intake?.deliveryCompany ?? "",
    deliveryContactName: intake?.deliveryContactName ?? "",
    deliveryContactPhone: intake?.deliveryContactPhone ?? "",
    deliveryContactEmail: intake?.deliveryContactEmail ?? "",
    deliveryAddressLine1: intake?.deliveryAddressLine1 ?? "",
    deliveryAddressLine2: intake?.deliveryAddressLine2 ?? "",
    deliveryCity: intake?.deliveryCity ?? "",
    deliveryState: intake?.deliveryState ?? "",
    deliveryZip: intake?.deliveryZip ?? lead.deliveryZip ?? "",
    deliveryWindow: intake?.deliveryWindow ?? "",
    commodityDetails: intake?.commodityDetails ?? lead.commodity ?? "",
    lengthIn: num(intake?.lengthIn ?? null),
    widthIn: num(intake?.widthIn ?? null),
    heightIn: num(intake?.heightIn ?? null),
    exactWeightLbs: num(intake?.exactWeightLbs ?? null),
    loadingResponsibility: intake?.loadingResponsibility ?? "",
    unloadingResponsibility: intake?.unloadingResponsibility ?? "",
    specialRequirements: intake?.specialRequirements ?? "",
    referenceLinks: intake?.referenceLinks ?? "",
    notes: intake?.notes ?? "",
  };

  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;
  const rate = formatRate(estimate.linehaulLow, estimate.linehaulHigh);
  const initialUploads = await loadIntakeUploads(lead.id);

  return (
    <div className="bg-neutral-950">
      {/* Page header — restates the estimate so the customer has context. */}
      <section className="border-b border-neutral-800 bg-neutral-950">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            Shipment finalization
          </p>
          <h1 className="mt-5 text-3xl font-display leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl">
            Confirm shipment details.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-neutral-300 sm:text-lg">
            You&rsquo;ve accepted the estimate range. Dispatch needs the
            details below to lock the truck and finalize routing. This
            isn&rsquo;t a booking confirmation yet — once you submit, a
            dispatcher reviews and follows up to confirm.
          </p>

          <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-4 border border-neutral-800 bg-neutral-900/40 p-5 sm:grid-cols-3 sm:p-6">
            <KV label="Lane">
              <span className="font-mono text-base text-white">
                {lead.pickupZip ?? "—"}
                <span aria-hidden className="mx-2 text-red-500">
                  &rarr;
                </span>
                {lead.deliveryZip ?? "—"}
              </span>
            </KV>
            <KV label="Estimate range">
              <span className="font-mono text-base font-semibold text-white">
                {rate}
              </span>
            </KV>
            <KV label="Valid through">
              <span className="font-mono text-base text-white">
                {estimate.expirationAt ?? "—"}
              </span>
            </KV>
          </dl>

          <p className="mt-6 font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
            Need to talk it over first?{" "}
            <a
              href={phoneHref}
              className="text-red-400 underline-offset-4 hover:underline"
            >
              {company.dispatchPhone}
            </a>
          </p>
        </div>
      </section>

      {/* Intake form — main interaction. */}
      <section className="bg-neutral-950">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <IntakeForm
            token={token}
            defaults={defaults}
            initialStatus={initialStatus}
          />

          {/* Documents & Photos — supporting files for dispatch. */}
          <IntakeUploads token={token} initialUploads={initialUploads} />

          <p className="mt-8 font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
            Changed your mind?{" "}
            <Link
              href={`/quote/decline/${token}`}
              className="text-neutral-400 underline-offset-4 hover:text-white hover:underline"
            >
              Decline this estimate instead
            </Link>
          </p>
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
      <dt className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}

function DeclinedView({ rate }: { rate: string }) {
  return (
    <div className="bg-neutral-950">
      <section className="border-b border-neutral-800 bg-neutral-950">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            Declined
          </p>
          <h1 className="mt-5 text-3xl font-display leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl">
            This estimate was declined.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-neutral-300 sm:text-lg">
            The estimate at {rate} was already declined and isn&rsquo;t open
            for finalization. If you&rsquo;d like to revisit the lane, reply
            to the original quote email or contact dispatch directly.
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
