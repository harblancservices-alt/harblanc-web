import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatDateFull, relativeTime } from "@/lib/admin/format";
import { StatusBadge } from "../StatusBadge";
import { type LeadStatus } from "@/lib/dispatch/status";

/**
 * Phase DEL-1 — minimal quote-detail page after the admin UI reset.
 *
 * The prior tangled detail UI (QuoteDetailTabs, EstimateComposer,
 * FinalizedQuoteComposer, BillOfLadingComposer, PaymentSection,
 * sent-history lists, status selectors, composers, preview panes) was
 * removed in DEL-1 because its workflow tangles produced silent buttons
 * and the only way out was a clean rebuild.
 *
 * This page is intentionally read-only. It loads the lead row and
 * renders enough operational context for Brent to know which lead he
 * is looking at — identity, lane, status, when it came in. It does NOT
 * advance the workflow, generate quotes, build previews, send emails,
 * record payments, or change status. Those actions still exist as
 * server actions under this directory; new UI panels will reintroduce
 * them one at a time in subsequent REBUILD phases.
 *
 * Critical: no email rendering changes, no PDF rendering changes, no
 * Resend changes, no database schema changes, no Supabase data changes
 * resulted from this phase. Customer-facing routes (/quote/*) are
 * untouched. Server actions in actions.ts /
 * finalized-quote-actions.ts / bol-actions.ts / payment-actions.ts are
 * untouched and orphaned-but-functional pending the rebuild.
 */

export const metadata: Metadata = {
  title: "Quote detail",
  robots: { index: false, follow: false },
};

type QuoteDetailRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string;
  pickup_zip: string | null;
  delivery_zip: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  lead_status: LeadStatus;
  lead_status_updated_at: string | null;
  deleted_at: string | null;
  delete_after: string | null;
};

async function loadQuoteRequest(id: string): Promise<QuoteDetailRow | null> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("quote_requests")
    .select(
      "id, created_at, name, email, phone, pickup_zip, delivery_zip, pickup_city, pickup_state, delivery_city, delivery_state, lead_status, lead_status_updated_at, deleted_at, delete_after",
    )
    .eq("id", id)
    .maybeSingle<QuoteDetailRow>();
  return data ?? null;
}

function laneLabel(
  city: string | null,
  state: string | null,
  zip: string | null,
): string {
  if (city && state) return `${city}, ${state}`;
  return zip ?? "—";
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await loadQuoteRequest(id);
  if (!row) notFound();

  const phoneHref = `tel:${row.phone.replace(/[^\d+]/g, "")}`;
  const mailHref = `mailto:${row.email}`;
  const isTrashed = Boolean(row.deleted_at);
  const pickupLabel = laneLabel(row.pickup_city, row.pickup_state, row.pickup_zip);
  const deliveryLabel = laneLabel(
    row.delivery_city,
    row.delivery_state,
    row.delivery_zip,
  );
  const hasLane = Boolean(row.pickup_zip && row.delivery_zip);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      {/* Back link */}
      <Link
        href={isTrashed ? "/admin/quotes/trash" : "/admin/quotes"}
        prefetch={false}
        className="inline-flex items-center font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase transition-colors hover:text-zinc-900"
      >
        &larr; Back to {isTrashed ? "trash" : "quotes"}
      </Link>

      {/* Trash banner */}
      {isTrashed ? (
        <div className="mt-5 flex items-start gap-3 border border-red-300 bg-red-50 p-4">
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600"
          />
          <div>
            <p className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
              In trash
            </p>
            <p className="mt-1 text-sm leading-relaxed text-red-800">
              Moved to trash {relativeTime(row.deleted_at!)}.{" "}
              {row.delete_after ? (
                <>
                  Auto-purge on{" "}
                  <span className="font-mono text-red-800">
                    {formatDateFull(row.delete_after)}
                  </span>
                  .
                </>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}

      {/* Eyebrow + status updated caption */}
      <header className="mt-5 sm:mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
            Quote request
          </p>
          {row.lead_status_updated_at ? (
            <span
              className="font-mono text-xs text-zinc-700"
              title={formatDateFull(row.lead_status_updated_at)}
            >
              Status updated {relativeTime(row.lead_status_updated_at)}
            </span>
          ) : null}
        </div>

        {/* Hero — customer name */}
        <h1 className="mt-3 text-3xl font-display tracking-tight text-zinc-900 sm:text-4xl">
          {row.name}
        </h1>
        <p
          className="mt-2 font-mono text-xs text-zinc-600"
          title={formatDateFull(row.created_at)}
        >
          Received {relativeTime(row.created_at)}
          <span aria-hidden className="mx-1.5 text-zinc-500">·</span>
          {formatDateFull(row.created_at)}
        </p>
      </header>

      {/* Identity strip — phone + email + status badge */}
      <section className="mt-5 grid grid-cols-1 gap-3 border-y border-zinc-200 py-4 sm:grid-cols-3 sm:items-center sm:gap-6">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-[0.1em] text-zinc-700 uppercase">
            Phone
          </p>
          <a
            href={phoneHref}
            className="mt-1 block font-mono text-base text-zinc-900 underline-offset-4 hover:underline sm:text-lg"
          >
            {row.phone}
          </a>
        </div>
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-[0.1em] text-zinc-700 uppercase">
            Email
          </p>
          <a
            href={mailHref}
            className="mt-1 block break-all text-sm text-zinc-900 underline-offset-4 hover:underline"
          >
            {row.email}
          </a>
        </div>
        <div>
          <p className="font-mono text-xs tracking-[0.1em] text-zinc-700 uppercase">
            Status
          </p>
          <div className="mt-1.5">
            <StatusBadge status={row.lead_status} />
          </div>
        </div>
      </section>

      {/* Lane block */}
      {hasLane ? (
        <section className="mt-6 border border-zinc-200 bg-white p-5 sm:p-6">
          <p className="font-mono text-xs tracking-[0.1em] text-zinc-700 uppercase">
            Lane
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-lg font-semibold text-zinc-900 sm:text-2xl">
              {pickupLabel}
            </span>
            <span aria-hidden className="text-base text-red-600 sm:text-xl">
              &rarr;
            </span>
            <span className="text-lg font-semibold text-zinc-900 sm:text-2xl">
              {deliveryLabel}
            </span>
          </div>
          <p className="mt-1.5 font-mono text-xs text-zinc-700">
            {row.pickup_zip}
            <span aria-hidden className="mx-1.5 text-zinc-500">→</span>
            {row.delivery_zip}
          </p>
        </section>
      ) : null}

      {/* Rebuild notice */}
      <section
        role="status"
        className="mt-6 border border-amber-300 bg-amber-50 p-5 sm:p-6"
      >
        <p className="font-mono text-xs tracking-[0.12em] text-amber-800 uppercase">
          Workspace under reconstruction
        </p>
        <h2 className="mt-2 text-xl font-display tracking-tight text-zinc-900 sm:text-2xl">
          Admin workspace is being rebuilt.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-700">
          The quote-detail workspace was reset in DEL-1 because the prior
          tabbed composer system produced silent buttons and was not
          reliably moving leads through the pipeline. The data is
          untouched — every lead, sent estimate, finalized quote, BOL,
          payment, and dispatch event is preserved in Supabase. The
          workflow panels (range proposal, finalized quote, BOL,
          payments) will return one at a time in upcoming REBUILD
          phases.
        </p>
      </section>

      {/* Placeholder card — single visual seat for the future panels */}
      <section className="mt-6 border border-zinc-200 bg-zinc-50 p-5 text-center sm:p-8">
        <p className="font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase">
          Future workspace
        </p>
        <p className="mt-3 max-w-md mx-auto text-sm leading-relaxed text-zinc-600">
          Range proposal, finalized quote, bill of lading, and payment
          panels will land here in REBUILD phases. No actions are
          available on this page in DEL-1 — this is the clean reset
          before the rebuild begins.
        </p>
      </section>

      {/* Metadata strip — minimal audit info */}
      <section className="mt-8 border-t border-zinc-200 pt-5">
        <p className="font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase">
          Record
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="font-mono text-xs tracking-[0.1em] text-zinc-600 uppercase">
              Request ID
            </dt>
            <dd className="mt-1 font-mono text-xs break-all text-zinc-700">
              {row.id}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-xs tracking-[0.1em] text-zinc-600 uppercase">
              Created
            </dt>
            <dd className="mt-1 font-mono text-xs text-zinc-700">
              {formatDateFull(row.created_at)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
