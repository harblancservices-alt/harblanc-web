import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatDateFull, relativeTime } from "@/lib/admin/format";
import { estimateLaneMiles } from "@/lib/dispatch/distance";
import {
  softDeleteQuote,
  restoreQuote,
  permanentlyDeleteQuote,
} from "../actions";
import { QuoteDetailTabs, type QuoteDetailRow } from "./QuoteDetailTabs";
import type { GeneratedQuoteSummary } from "./GeneratedQuotePreview";
import type { EstimateDraft } from "./EstimateComposer";
import type { SentEstimateRow } from "./SentEstimatesList";
import type { DispatchEvent } from "./CommTimeline";

export const metadata: Metadata = {
  title: "Quote detail",
  robots: { index: false, follow: false },
};

const QUOTES_BUCKET = "quotes";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

type GeneratedQuoteRow = {
  id: string;
  quote_number: string;
  issued_at: string;
  expires_at: string | null;
  total_amount: string | number | null;
  prepared_by: string | null;
  payment_terms: string | null;
  pdf_storage_path: string | null;
};

type DispatchEstimateRow = {
  id: string;
  linehaul_low: string | number | null;
  linehaul_high: string | number | null;
  miles_estimate: number | null;
  pickup_timing_notes: string | null;
  equipment_notes: string | null;
  dispatch_notes: string | null;
  expiration_at: string | null;
  closing_line: string | null;
  sent_at: string | null;
  sent_email_id: string | null;
  preview_subject: string | null;
  preview_preheader: string | null;
  preview_html: string | null;
  preview_to: string | null;
  preview_from: string | null;
  preview_reply_to: string | null;
  preview_built_at: string | null;
};

function toEstimateDraft(row: DispatchEstimateRow | null): EstimateDraft | null {
  if (!row) return null;
  const preview =
    row.preview_built_at &&
    row.preview_subject &&
    row.preview_html &&
    row.preview_to &&
    row.preview_from &&
    row.preview_reply_to
      ? {
          subject: row.preview_subject,
          preheader: row.preview_preheader ?? "",
          html: row.preview_html,
          to: row.preview_to,
          from: row.preview_from,
          replyTo: row.preview_reply_to,
          builtAt: row.preview_built_at,
        }
      : null;
  return {
    id: row.id,
    linehaulLow:
      row.linehaul_low === null ? null : Number(row.linehaul_low),
    linehaulHigh:
      row.linehaul_high === null ? null : Number(row.linehaul_high),
    milesEstimate: row.miles_estimate,
    pickupTimingNotes: row.pickup_timing_notes,
    equipmentNotes: row.equipment_notes,
    dispatchNotes: row.dispatch_notes,
    expirationAt: row.expiration_at,
    closingLine: row.closing_line,
    sentAt: row.sent_at,
    sentEmailId: row.sent_email_id,
    preview,
  };
}

type SentEstimateDbRow = {
  id: string;
  sent_at: string;
  sent_email_id: string | null;
  linehaul_low: string | number | null;
  linehaul_high: string | number | null;
  preview_subject: string | null;
  preview_preheader: string | null;
  preview_html: string | null;
  preview_to: string | null;
  preview_from: string | null;
  preview_reply_to: string | null;
};

function toSentEstimateRow(row: SentEstimateDbRow): SentEstimateRow {
  return {
    id: row.id,
    sentAt: row.sent_at,
    sentEmailId: row.sent_email_id,
    linehaulLow:
      row.linehaul_low === null ? null : Number(row.linehaul_low),
    linehaulHigh:
      row.linehaul_high === null ? null : Number(row.linehaul_high),
    subject: row.preview_subject ?? "(no subject recorded)",
    preheader: row.preview_preheader ?? "",
    html: row.preview_html ?? "",
    to: row.preview_to ?? "",
    from: row.preview_from ?? "",
    replyTo: row.preview_reply_to ?? "",
  };
}

async function loadDetail(id: string): Promise<{
  row: QuoteDetailRow;
  generatedQuote: GeneratedQuoteSummary | null;
  signedPdfUrl: string | null;
  draftEstimate: EstimateDraft | null;
  sentEstimates: SentEstimateRow[];
  events: DispatchEvent[];
  computedMiles: number | null;
} | null> {
  const sb = createServiceRoleClient();

  const { data: row } = await sb
    .from("quote_requests")
    .select(
      "id, created_at, name, email, phone, commodity, weight, notes, pickup_zip, delivery_zip, pickup_date, lead_status, lead_status_updated_at, user_agent, ip, deleted_at, delete_after",
    )
    .eq("id", id)
    .maybeSingle<QuoteDetailRow>();
  if (!row) return null;

  // Fetch related data in parallel. Draft and sent history are now two
  // distinct fetches — the draft is the single sent_at IS NULL row (if
  // any), the history is every sent_at IS NOT NULL row newest-first.
  const [
    { data: rawGenerated },
    { data: draftEstimateRow },
    { data: sentEstimateRows },
    { data: eventRows },
  ] = await Promise.all([
    sb
      .from("generated_quotes")
      .select(
        "id, quote_number, issued_at, expires_at, total_amount, prepared_by, payment_terms, pdf_storage_path",
      )
      .eq("quote_request_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<GeneratedQuoteRow>(),
    sb
      .from("dispatch_estimates")
      .select(
        "id, linehaul_low, linehaul_high, miles_estimate, pickup_timing_notes, equipment_notes, dispatch_notes, expiration_at, closing_line, sent_at, sent_email_id, preview_subject, preview_preheader, preview_html, preview_to, preview_from, preview_reply_to, preview_built_at",
      )
      .eq("quote_request_id", id)
      .is("sent_at", null)
      .maybeSingle<DispatchEstimateRow>(),
    sb
      .from("dispatch_estimates")
      .select(
        "id, sent_at, sent_email_id, linehaul_low, linehaul_high, preview_subject, preview_preheader, preview_html, preview_to, preview_from, preview_reply_to",
      )
      .eq("quote_request_id", id)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .returns<SentEstimateDbRow[]>(),
    sb
      .from("dispatch_events")
      .select("id, kind, payload, created_at")
      .eq("quote_request_id", id)
      .order("created_at", { ascending: false })
      .returns<DispatchEvent[]>(),
  ]);

  let generatedQuote: GeneratedQuoteSummary | null = null;
  let signedPdfUrl: string | null = null;

  if (rawGenerated) {
    generatedQuote = {
      id: rawGenerated.id,
      quoteNumber: rawGenerated.quote_number,
      issuedAt: rawGenerated.issued_at,
      expiresAt: rawGenerated.expires_at,
      totalAmount:
        rawGenerated.total_amount === null
          ? null
          : Number(rawGenerated.total_amount),
      preparedBy: rawGenerated.prepared_by,
      paymentTerms: rawGenerated.payment_terms,
    };

    if (rawGenerated.pdf_storage_path) {
      const { data: signed } = await sb.storage
        .from(QUOTES_BUCKET)
        .createSignedUrl(rawGenerated.pdf_storage_path, SIGNED_URL_TTL_SECONDS);
      signedPdfUrl = signed?.signedUrl ?? null;
    }
  }

  // Lane miles — server-computed (zipcodes is Node-only).
  let computedMiles: number | null = null;
  if (row.pickup_zip && row.delivery_zip) {
    const r = estimateLaneMiles(row.pickup_zip, row.delivery_zip);
    if (r.ok) computedMiles = r.miles;
  }

  return {
    row,
    generatedQuote,
    signedPdfUrl,
    draftEstimate: toEstimateDraft(draftEstimateRow ?? null),
    sentEstimates: (sentEstimateRows ?? []).map(toSentEstimateRow),
    events: eventRows ?? [],
    computedMiles,
  };
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await loadDetail(id);
  if (!detail) notFound();
  const {
    row,
    generatedQuote,
    signedPdfUrl,
    draftEstimate,
    sentEstimates,
    events,
    computedMiles,
  } = detail;

  const isTrashed = Boolean(row.deleted_at);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      {/* Back link */}
      <Link
        href={isTrashed ? "/admin/quotes/trash" : "/admin/quotes"}
        className="inline-flex items-center font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase transition-colors hover:text-white"
      >
        &larr; Back to {isTrashed ? "trash" : "quotes"}
      </Link>

      {/* Trash banner */}
      {isTrashed ? (
        <div className="mt-5 flex items-start gap-3 border border-red-700/60 bg-red-950/30 p-4">
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600"
          />
          <div>
            <p className="font-mono text-[10px] tracking-[0.22em] text-red-400 uppercase">
              In trash
            </p>
            <p className="mt-1 text-sm leading-relaxed text-red-200">
              Moved to trash {relativeTime(row.deleted_at!)}.{" "}
              {row.delete_after ? (
                <>
                  Auto-purge on{" "}
                  <span className="font-mono text-red-100">
                    {formatDateFull(row.delete_after)}
                  </span>
                  .
                </>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}

      {/* Title + tabs + tab content (client component) */}
      <QuoteDetailTabs
        row={row}
        generatedQuote={generatedQuote}
        signedPdfUrl={signedPdfUrl}
        draftEstimate={draftEstimate}
        sentEstimates={sentEstimates}
        events={events}
        computedMiles={computedMiles}
      />

      {/* Action zone — outside tabs, global to the record */}
      <section className="mt-6 border border-neutral-800 border-t-2 border-t-red-600 bg-neutral-900 p-5 sm:mt-8 sm:p-6">
        <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
          Actions
        </h2>
        <div
          className={
            "mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center " +
            (isTrashed ? "sm:justify-between" : "")
          }
        >
          {isTrashed ? (
            <>
              <form action={restoreQuote.bind(null, row.id)}>
                <button
                  type="submit"
                  className="btn-outline-cut inline-flex w-full items-center justify-center px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors sm:w-auto"
                >
                  Restore
                </button>
              </form>
              <form action={permanentlyDeleteQuote.bind(null, row.id)}>
                <button
                  type="submit"
                  className="btn-cut inline-flex w-full items-center justify-center bg-red-600 px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 sm:w-auto"
                >
                  Permanently delete
                </button>
              </form>
            </>
          ) : (
            <form action={softDeleteQuote.bind(null, row.id)}>
              <button
                type="submit"
                className="btn-outline-cut inline-flex w-full items-center justify-center px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors sm:w-auto"
              >
                Move to trash
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
