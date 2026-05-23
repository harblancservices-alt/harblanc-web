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
import {
  FinalizedQuoteSection,
  type FinalizedQuoteWorkflowState,
} from "./FinalizedQuoteSection";
import type { SentFinalizedQuoteRow } from "./SentFinalizedQuotesList";
import {
  BillOfLadingSection,
  type BolWorkflowState,
} from "./BillOfLadingSection";
import type { SentBolRow } from "./SentBolsList";
import {
  SubmittedIntakePanel,
  type SubmittedIntakeData,
} from "./SubmittedIntakePanel";
import {
  DispatchOwnershipPanel,
  type DispatchOwnership,
} from "./DispatchOwnershipPanel";

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
  assigned_dispatcher: string | null;
  assigned_carrier: string | null;
  assigned_truck: string | null;
  trailer_type: string | null;
};

type TabId = "request" | "activity" | "finalized" | "bol" | "generated" | "metadata";

// Phase J2: "Quote PDF" (id: "generated") demoted from primary tab nav.
// The TabId union below still includes "generated", the panel body branch
// still renders GeneratedQuoteTab when activeTab === "generated", and the
// header "Open Quote PDF" button still flips activeTab to "generated" —
// the tab is just no longer surfaced as a primary navigation choice.
const TABS: { id: TabId; label: string }[] = [
  { id: "request", label: "Workspace" },
  { id: "activity", label: "Activity" },
  { id: "finalized", label: "Finalized Quote" },
  { id: "bol", label: "BOL" },
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
  finalizedQuoteState,
  sentFinalizedQuotes,
  bolState,
  sentBols,
  submittedIntake,
  ownership,
}: {
  row: QuoteDetailRow;
  generatedQuote: GeneratedQuoteSummary | null;
  signedPdfUrl: string | null;
  draftEstimate: EstimateDraft | null;
  sentEstimates: SentEstimateRow[];
  events: DispatchEvent[];
  computedMiles: number | null;
  finalizedQuoteState: FinalizedQuoteWorkflowState;
  sentFinalizedQuotes: SentFinalizedQuoteRow[];
  bolState: BolWorkflowState;
  sentBols: SentBolRow[];
  submittedIntake: SubmittedIntakeData | null;
  ownership: DispatchOwnership;
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
              className="btn-outline-cut inline-flex w-full items-center justify-center px-4 py-2 text-[11px] font-semibold tracking-[0.18em] text-neutral-300 uppercase transition-colors hover:text-white sm:w-auto"
            >
              Open Quote PDF
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
        className="mt-6 flex overflow-x-auto sm:mt-8 [mask-image:linear-gradient(to_right,black_88%,transparent)] sm:[mask-image:none]"
      >
        {TABS.map((tab, i) => {
          const isActive = activeTab === tab.id;
          const showCount = tab.id === "activity" && activityCount > 0;
          // Phase N: Metadata tab visually de-emphasized when inactive
          // (admin-only technical info, lower priority than workflow tabs).
          const isMetadata = tab.id === "metadata";
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
                "shrink-0 border px-5 py-3.5 text-[11px] font-semibold tracking-[0.18em] uppercase transition-colors " +
                (i > 0 ? "-ml-px " : "") +
                (isActive
                  ? "relative z-10 border-neutral-800 border-b-neutral-900 bg-neutral-900 text-white"
                  : isMetadata
                    ? "border-neutral-800 bg-neutral-950 text-neutral-600 hover:bg-neutral-900/40 hover:text-neutral-300"
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
        className="relative -mt-px border border-neutral-800 bg-neutral-900 p-5 shadow-2xl shadow-black/50 sm:p-7"
      >
        {activeTab === "request" ? (
          <RequestTab
            row={row}
            phoneHref={phoneHref}
            draftEstimate={draftEstimate}
            sentEstimates={sentEstimates}
            computedMiles={computedMiles}
            isTrashed={isTrashed}
            submittedIntake={submittedIntake}
            ownership={ownership}
          />
        ) : null}
        {activeTab === "activity" ? (
          <CommTimeline quoteRequestId={row.id} events={events} />
        ) : null}
        {activeTab === "finalized" ? (
          <FinalizedQuoteSection
            quoteRequestId={row.id}
            leadName={row.name}
            state={finalizedQuoteState}
            sentHistory={sentFinalizedQuotes}
            isTrashed={isTrashed}
            submittedIntake={submittedIntake}
          />
        ) : null}
        {activeTab === "bol" ? (
          <BillOfLadingSection
            quoteRequestId={row.id}
            leadName={row.name}
            state={bolState}
            sentHistory={sentBols}
            isTrashed={isTrashed}
          />
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
  submittedIntake,
  ownership,
}: {
  row: QuoteDetailRow;
  phoneHref: string;
  draftEstimate: EstimateDraft | null;
  sentEstimates: SentEstimateRow[];
  computedMiles: number | null;
  isTrashed: boolean;
  submittedIntake: SubmittedIntakeData | null;
  ownership: DispatchOwnership;
}) {
  const hasLane = Boolean(row.pickup_zip && row.delivery_zip);

  return (
    <div className="space-y-8">
      {!isTrashed ? (
        <QuickActions phone={row.phone} email={row.email} />
      ) : null}

      {/* GROUP: Load overview — lane, primary contact, shipment, customer notes */}
      <section className="space-y-5">
        <GroupHeading>Load overview</GroupHeading>

      {hasLane ? (
        <section className="border border-neutral-700 bg-neutral-800 p-5 sm:p-6">
          <h2 className="label-cap">
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
          <p className="mt-3 label-cap">
            Pickup target:{" "}
            <span className="text-zinc-200">{row.pickup_date ?? "ASAP"}</span>
          </p>
        </section>
      ) : null}

      <div className="grid grid-cols-1 divide-y divide-neutral-700 border border-neutral-700 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <section className="bg-neutral-800 p-5 sm:p-6">
          <h2 className="label-cap">
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
        <section className="bg-neutral-800 p-5 sm:p-6">
          <h2 className="label-cap">
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
        <section className="border border-neutral-700 bg-neutral-800 p-5 sm:p-6">
          <h2 className="label-cap">
            Customer notes
          </h2>
          <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-neutral-100">
            {row.notes}
          </p>
        </section>
      ) : null}
      </section>

      {/* GROUP: Finalized load information — only when intake submitted */}
      {submittedIntake ? (
        <section className="space-y-5">
          <GroupHeading>Finalized load information</GroupHeading>
          <SubmittedIntakePanel intake={submittedIntake} />
        </section>
      ) : null}

      {/* GROUP: Dispatch ownership */}
      {!isTrashed ? (
        <section className="space-y-5">
          <GroupHeading>Dispatch ownership</GroupHeading>
          <DispatchOwnershipPanel
            quoteRequestId={row.id}
            ownership={ownership}
          />
        </section>
      ) : null}

      {/* GROUP: Range quote — primary action area */}
      <section className="space-y-5">
        <GroupHeading>Range quote</GroupHeading>
        {!isTrashed ? (
          <section className="border border-neutral-600 border-t-2 border-t-red-600 bg-neutral-800 p-5 shadow-lg shadow-black/40 sm:p-7">
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
            <p className="label-cap text-neutral-500">
              Request is in trash
            </p>
            <p className="mt-3 text-sm leading-relaxed text-neutral-400">
              Restore the request from trash to build an estimate.
            </p>
          </section>
        )}
      </section>

      {/* GROUP: Estimate history */}
      <section className="space-y-5">
        <GroupHeading>Estimate history</GroupHeading>
        <SentEstimatesList rows={sentEstimates} />
      </section>
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
        <p className="text-[11px] font-semibold tracking-[0.18em] text-red-400 uppercase">
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
        <h2 className="label-cap">
          Quote PDF
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
      {/* Phase N: dimmed treatment so the tab visibly reads as
          secondary/admin-only rather than a primary workflow surface. */}
      <h2 className="label-cap text-neutral-500">
        Metadata
      </h2>
      <p className="mt-1.5 text-xs text-neutral-500">
        Technical record · admin-only
      </p>
      <dl className="mt-5 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
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

/**
 * Phase K: visual group heading used by RequestTab to split the Workspace
 * into ~5 conceptual zones (Load overview / Finalized load information /
 * Dispatch ownership / Range quote / Estimate history). Sits above each
 * group's existing card(s). Slightly larger, brighter, and bottom-bordered
 * compared to the `label-cap` headings INSIDE the cards, so groups read
 * as a tier above sections without changing any logic or composition.
 */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-neutral-800 pb-2.5 text-sm font-semibold uppercase tracking-[0.18em] text-white">
      {children}
    </h2>
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
          "label-cap " +
          (muted ? "text-neutral-500" : "text-neutral-500")
        }
      >
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}
