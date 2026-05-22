"use client";

import { useState } from "react";
import { formatDateFull, relativeTime } from "@/lib/admin/format";
import { GenerateQuoteForm } from "./GenerateQuoteForm";
import {
  GeneratedQuotePreview,
  type GeneratedQuoteSummary,
} from "./GeneratedQuotePreview";
import { EstimateComposer, type EstimateDraft } from "./EstimateComposer";
import {
  SentEstimatesList,
  type SentEstimateRow,
} from "./SentEstimatesList";
import { CommTimeline, type DispatchEvent } from "./CommTimeline";
import { StatusBadge } from "./StatusBadge";
import { StatusSelector } from "./StatusSelector";
import { QuickActions } from "./QuickActions";
import { type LeadStatus } from "@/lib/dispatch/status";

export type QuoteDetailRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string;
  commodity: string;
  weight: string;
  notes: string | null;
  pickup_zip: string | null;
  delivery_zip: string | null;
  pickup_date: string | null;
  lead_status: LeadStatus;
  lead_status_updated_at: string | null;
  user_agent: string | null;
  ip: string | null;
  deleted_at: string | null;
  delete_after: string | null;
};

type TabId = "request" | "activity" | "generated" | "metadata";

const TABS: { id: TabId; label: string }[] = [
  { id: "request", label: "Workspace" },
  { id: "activity", label: "Activity" },
  { id: "generated", label: "Generated Quote" },
  { id: "metadata", label: "Metadata" },
];

export function QuoteDetailTabs({
  row,
  generatedQuote,
  signedPdfUrl,
  draftEstimate,
  sentEstimates,
  events,
  computedMiles,
}: {
  row: QuoteDetailRow;
  generatedQuote: GeneratedQuoteSummary | null;
  signedPdfUrl: string | null;
  draftEstimate: EstimateDraft | null;
  sentEstimates: SentEstimateRow[];
  events: DispatchEvent[];
  computedMiles: number | null;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("request");
  const isTrashed = Boolean(row.deleted_at);
  const phoneHref = `tel:${row.phone.replace(/[^\d+]/g, "")}`;
  const activityCount = events.length;

  return (
    <>
      <header className="mt-5 sm:mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            Quote request
          </p>
          <StatusBadge status={row.lead_status} />
          {row.lead_status_updated_at ? (
            <span
              className="font-mono text-[10px] text-neutral-500"
              title={formatDateFull(row.lead_status_updated_at)}
            >
              {relativeTime(row.lead_status_updated_at)}
            </span>
          ) : null}
        </div>

        <div className="mt-3 sm:flex sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-3xl font-display tracking-tight text-white sm:text-4xl lg:text-5xl">
              {row.name}
            </h1>
            <p
              className="mt-2 font-mono text-xs text-neutral-500"
              title={formatDateFull(row.created_at)}
            >
              Received {relativeTime(row.created_at)}{" "}
              <span aria-hidden className="mx-1 text-neutral-700">
                ·
              </span>{" "}
              {formatDateFull(row.created_at)}
            </p>
          </div>
          <div className="mt-5 sm:mt-0 sm:shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("generated")}
              className="btn-cut inline-flex w-full items-center justify-center bg-red-600 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 sm:w-auto"
            >
              Generate Quote
            </button>
          </div>
        </div>

        {!isTrashed ? (
          <div className="mt-4">
            <StatusSelector
              quoteRequestId={row.id}
              status={row.lead_status}
            />
          </div>
        ) : null}
      </header>

      <nav
        role="tablist"
        aria-label="Quote detail sections"
        className="mt-6 flex overflow-x-auto sm:mt-8"
      >
        {TABS.map((tab, i) => {
          const isActive = activeTab === tab.id;
          const showCount = tab.id === "activity" && activityCount > 0;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={
                "shrink-0 border px-5 py-3 font-mono text-[11px] tracking-[0.18em] uppercase transition-colors " +
                (i > 0 ? "-ml-px " : "") +
                (isActive
                  ? "relative z-10 border-neutral-800 border-b-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:bg-neutral-900/40 hover:text-white")
              }
            >
              {tab.label}
              {showCount ? (
                <span
                  aria-hidden
                  className="ml-2 inline-flex items-center bg-neutral-800 px-1.5 text-[9px] text-neutral-300"
                >
                  {activityCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="relative -mt-px border border-neutral-800 bg-neutral-900 p-5 sm:p-6"
      >
        {activeTab === "request" ? (
          <RequestTab
            row={row}
            phoneHref={phoneHref}
            draftEstimate={draftEstimate}
            sentEstimates={sentEstimates}
            computedMiles={computedMiles}
            isTrashed={isTrashed}
          />
        ) : null}
        {activeTab === "activity" ? (
          <CommTimeline quoteRequestId={row.id} events={events} />
        ) : null}
        {activeTab === "generated" ? (
          <GeneratedQuoteTab
            row={row}
            generatedQuote={generatedQuote}
            signedPdfUrl={signedPdfUrl}
            isTrashed={isTrashed}
          />
        ) : null}
        {activeTab === "metadata" ? <MetadataTab row={row} /> : null}
      </div>
    </>
  );
}

function RequestTab({
  row,
  phoneHref,
  draftEstimate,
  sentEstimates,
  computedMiles,
  isTrashed,
}: {
  row: QuoteDetailRow;
  phoneHref: string;
  draftEstimate: EstimateDraft | null;
  sentEstimates: SentEstimateRow[];
  computedMiles: number | null;
  isTrashed: boolean;
}) {
  const hasLane = Boolean(row.pickup_zip && row.delivery_zip);

  return (
    <div className="space-y-5">
      {/* Quick dispatch actions — one-tap call / email / copy. */}
      {!isTrashed ? (
        <QuickActions phone={row.phone} email={row.email} />
      ) : null}

      {/* Lane band — top of detail. Most important info at a glance. */}
      {hasLane ? (
        <section className="border border-neutral-800 bg-neutral-900/40 p-5 sm:p-6">
          <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
            Lane
          </h2>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <span className="font-mono text-2xl font-semibold text-white sm:text-3xl">
              {row.pickup_zip}
            </span>
            <span aria-hidden className="font-mono text-xl text-red-500">
              &rarr;
            </span>
            <span className="font-mono text-2xl font-semibold text-white sm:text-3xl">
              {row.delivery_zip}
            </span>
            {computedMiles != null ? (
              <span className="ml-1 font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
                ~{computedMiles} mi
              </span>
            ) : null}
          </div>
          <p className="mt-3 font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase">
            Pickup target:{" "}
            <span className="text-zinc-200">{row.pickup_date ?? "ASAP"}</span>
          </p>
        </section>
      ) : null}

      {/* Primary contact + Shipment — stacked mobile, side-by-side tablet+ */}
      <div className="grid grid-cols-1 divide-y divide-neutral-800 border border-neutral-800 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <section className="bg-neutral-900/40 p-5 sm:p-6">
          <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
            Primary contact
          </h2>
          <dl className="mt-4 space-y-4">
            <Field label="Phone">
              <a
                href={phoneHref}
                className="block break-all font-mono text-xl text-white underline-offset-4 hover:underline sm:text-2xl"
              >
                {row.phone}
              </a>
            </Field>
            <Field label="Email">
              <a
                href={`mailto:${row.email}`}
                className="block break-all text-base text-white underline-offset-4 hover:underline sm:text-lg"
              >
                {row.email}
              </a>
            </Field>
          </dl>
        </section>
        <section className="bg-neutral-900/40 p-5 sm:p-6">
          <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
            Shipment
          </h2>
          <dl className="mt-4 space-y-4">
            <Field label="Commodity">
              <span className="block text-xl text-white sm:text-2xl">
                {row.commodity}
              </span>
            </Field>
            <Field label="Approximate weight">
              <span className="block font-mono text-xl text-white sm:text-2xl">
                {row.weight}
              </span>
            </Field>
          </dl>
        </section>
      </div>

      {row.notes ? (
        <section className="border border-neutral-800 bg-neutral-900/40 p-5 sm:p-6">
          <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
            Customer notes
          </h2>
          <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-neutral-100">
            {row.notes}
          </p>
        </section>
      ) : null}

      {/* Quick Estimate Composer — the dispatch workspace.
          The `key` re-inits the composer when the draft identity
          changes — e.g. after Send, when the previous draft is
          consumed into history and the next draft slot opens up
          empty. */}
      {!isTrashed ? (
        <section className="border border-neutral-800 border-t-2 border-t-red-600 bg-neutral-900/40 p-5 sm:p-6">
          <EstimateComposer
            key={draftEstimate?.id ?? "no-draft"}
            quoteRequestId={row.id}
            leadName={row.name}
            laneRecap={{
              pickupZip: row.pickup_zip,
              deliveryZip: row.delivery_zip,
            }}
            computedMiles={computedMiles}
            draft={draftEstimate}
          />
        </section>
      ) : (
        <section className="border border-neutral-800 bg-neutral-950 p-8 text-center">
          <p className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
            Request is in trash
          </p>
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            Restore the request from trash to build an estimate.
          </p>
        </section>
      )}

      {/* Estimate history — every sent estimate for this quote. */}
      <SentEstimatesList rows={sentEstimates} />
    </div>
  );
}

function GeneratedQuoteTab({
  row,
  generatedQuote,
  signedPdfUrl,
  isTrashed,
}: {
  row: QuoteDetailRow;
  generatedQuote: GeneratedQuoteSummary | null;
  signedPdfUrl: string | null;
  isTrashed: boolean;
}) {
  if (generatedQuote && signedPdfUrl) {
    return <GeneratedQuotePreview quote={generatedQuote} signedUrl={signedPdfUrl} />;
  }

  if (generatedQuote && !signedPdfUrl) {
    return (
      <div className="border border-red-700/60 bg-red-950/30 p-5 sm:p-6">
        <p className="font-mono text-[10px] tracking-[0.22em] text-red-400 uppercase">
          PDF unavailable
        </p>
        <p className="mt-2 text-sm leading-relaxed text-red-200">
          A generated quote row exists ({generatedQuote.quoteNumber}) but its
          stored PDF couldn&rsquo;t be loaded. Re-generate to refresh.
        </p>
      </div>
    );
  }

  if (isTrashed) {
    return (
      <div className="border border-neutral-800 bg-neutral-950 p-8 text-center">
        <p className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
          Request is in trash
        </p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          Restore the request from trash to generate a quote PDF.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
          Generate quote
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-300">
          Build a customer-ready Premium Carrier Quote PDF. Once generated,
          the PDF appears here for download or send.
        </p>
      </header>

      <GenerateQuoteForm
        defaults={{
          quoteRequestId: row.id,
          customerName: row.name,
          customerEmail: row.email,
          customerPhone: row.phone,
          commodity: row.commodity,
          weight: row.weight,
          pickupZip: row.pickup_zip,
          deliveryZip: row.delivery_zip,
          pickupDate: row.pickup_date,
        }}
      />
    </div>
  );
}

function MetadataTab({ row }: { row: QuoteDetailRow }) {
  return (
    <div>
      <h2 className="font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase">
        Metadata
      </h2>
      <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
        <Field label="Created" muted>
          <span className="font-mono text-xs text-neutral-300 sm:text-sm">
            {formatDateFull(row.created_at)}
          </span>
        </Field>
        {row.deleted_at ? (
          <Field label="Deleted" muted>
            <span className="font-mono text-xs text-red-300 sm:text-sm">
              {formatDateFull(row.deleted_at)}
            </span>
          </Field>
        ) : null}
        {row.delete_after ? (
          <Field label="Auto-purge" muted>
            <span className="font-mono text-xs text-neutral-300 sm:text-sm">
              {formatDateFull(row.delete_after)}
            </span>
          </Field>
        ) : null}
        <Field label="Request ID" muted full>
          <span className="font-mono text-xs break-all text-neutral-300">
            {row.id}
          </span>
        </Field>
        {row.user_agent ? (
          <Field label="User agent" muted full>
            <span className="font-mono text-[11px] break-all text-neutral-500">
              {row.user_agent}
            </span>
          </Field>
        ) : null}
        {row.ip ? (
          <Field label="IP" muted>
            <span className="font-mono text-xs text-neutral-500">{row.ip}</span>
          </Field>
        ) : null}
      </dl>
    </div>
  );
}

function Field({
  label,
  children,
  full = false,
  muted = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <dt
        className={
          "font-mono text-[10px] tracking-[0.22em] uppercase " +
          (muted ? "text-neutral-500" : "text-neutral-500")
        }
      >
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}
