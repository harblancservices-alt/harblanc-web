"use client";

import { useState, useEffect } from "react";
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
import { type PaymentTarget } from "./PaymentSection";
// Phase OPS-2A: operational header summary needs urgency + payment math.
import {
  computeUrgency,
  topUrgency,
  URGENCY_SEVERITY_CLASSES_LIGHT,
  type UrgencyChip,
} from "@/lib/dispatch/urgency";
import {
  computePaymentSummary,
  formatPaymentAmount,
} from "@/lib/dispatch/payment";

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

type TabId = "request" | "finalized" | "bol" | "generated" | "metadata";

// Phase J2: "Quote PDF" (id: "generated") demoted from primary tab nav.
// The TabId union below still includes "generated", the panel body branch
// still renders GeneratedQuoteTab when activeTab === "generated", and the
// header "Open Quote PDF" button still flips activeTab to "generated" —
// the tab is just no longer surfaced as a primary navigation choice.
// Phase UI-M1: Activity tab removed; CommTimeline now renders inside
// the Metadata tab as a final section below the technical record. The
// TabId union and the panel-body switch have been updated to match.
const TABS: { id: TabId; label: string }[] = [
  { id: "request", label: "Workspace" },
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
  paymentTarget,
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
  paymentTarget: PaymentTarget | null;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("request");

  // Phase OPS-2B: sticky identity bar visibility — appears once the
  // main header has scrolled off-screen (roughly 200px). Defaults to
  // hidden on SSR; the effect flips it on the first client-side scroll
  // measurement. passive listener so we don't block scrolling.
  const [stickyVisible, setStickyVisible] = useState(false);
  useEffect(() => {
    function onScroll() {
      setStickyVisible(window.scrollY > 200);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isTrashed = Boolean(row.deleted_at);
  const phoneHref = `tel:${row.phone.replace(/[^\d+]/g, "")}`;
  const mailHref = `mailto:${row.email}`;
  const hasLane = Boolean(row.pickup_zip && row.delivery_zip);

  // Phase OPS-2B: per-tab indicator dots so an operator on, say, the BOL
  // tab can see at a glance that a sent estimate bounced — without having
  // to switch tabs to find out. Computed from the same sent-history props
  // that feed the per-tab Sent lists.
  const hasBouncedEstimate = sentEstimates.some((r) => r.bounceKind !== null);
  const hasBouncedFq = sentFinalizedQuotes.some((r) => r.bounceKind !== null);
  const hasBouncedBol = sentBols.some((r) => r.bounceKind !== null);

  // Phase OPS-2A: operational header data. Computed client-side from
  // existing props (no new server query / data-flow change). intakeStartedAt
  // is null here because the detail page does not currently load the
  // in-progress intake row — its chip ("intake_in_progress") will only
  // surface on the ops home until/unless intakeStartedAt is threaded in.
  // All other urgency chips fire normally.
  const urgency: UrgencyChip[] = computeUrgency({
    leadStatus: row.lead_status,
    createdAt: row.created_at,
    latestEstimateSentAt: sentEstimates[0]?.sentAt ?? null,
    intakeStartedAt: null,
    intakeSubmittedAt: submittedIntake?.submittedAt ?? null,
    latestFinalizedSentAt: sentFinalizedQuotes[0]?.sentAt ?? null,
    latestBolSentAt: sentBols[0]?.sentAt ?? null,
    leadStatusUpdatedAt: row.lead_status_updated_at,
    now: new Date(),
  });
  const topUrgencyChip = topUrgency(urgency);

  // Outstanding balance (read from the FQ payment target if present).
  // Active (non-deleted) payments only — mirrors PaymentSection logic.
  const outstanding =
    paymentTarget && paymentTarget.totalAmount !== null
      ? computePaymentSummary(
          paymentTarget.totalAmount,
          paymentTarget.payments
            .filter((p) => p.deletedAt === null)
            .map((p) => ({ amount: p.amount, currency: p.currency })),
        ).outstanding
      : 0;

  const summaryHasContent =
    hasLane ||
    Boolean(row.pickup_date) ||
    (paymentTarget?.totalAmount !== undefined && paymentTarget.totalAmount !== null) ||
    outstanding > 0 ||
    topUrgencyChip !== null;

  return (
    <>
      {/* Phase OPS-2B: sticky condensed identity bar. Hidden when the
          main header is in view; slides down from top after scroll
          exceeds ~200px. Carries the bare minimum operational context
          (status pill + customer name + top urgency chip + Call + Email)
          so the dispatcher never loses orientation when scrolling deep
          into composer / payment / sent-history surfaces. Fixed
          positioning lets it sit on top of the page as the user scrolls;
          the AdminNav header is non-sticky and has already scrolled
          away by the time this appears, so they do not overlap. */}
      <div
        aria-hidden={!stickyVisible}
        className={
          "fixed inset-x-0 top-0 z-30 border-b border-zinc-200 bg-white shadow-sm transition-transform duration-200 " +
          (stickyVisible ? "translate-y-0" : "-translate-y-full pointer-events-none")
        }
      >
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2 sm:px-6 sm:py-2.5 lg:px-8">
          <StatusBadge status={row.lead_status} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">
            {row.name}
          </span>
          {topUrgencyChip ? (
            <span
              className={
                "shrink-0 inline-flex items-center border px-1.5 py-0.5 font-mono text-xs tracking-[0.12em] uppercase " +
                URGENCY_SEVERITY_CLASSES_LIGHT[topUrgencyChip.severity]
              }
              title={topUrgencyChip.kind}
            >
              {topUrgencyChip.label}
            </span>
          ) : null}
          <a
            href={phoneHref}
            className="shrink-0 inline-flex items-center justify-center border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold tracking-[0.12em] text-zinc-700 uppercase transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Call customer"
          >
            Call
          </a>
          <a
            href={mailHref}
            className="shrink-0 inline-flex items-center justify-center border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold tracking-[0.12em] text-zinc-700 uppercase transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Email customer"
          >
            Email
          </a>
        </div>
      </div>

      <header className="mt-4">
        {/* Phase LAYOUT-1: eyebrow row — status + relative time */}
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
            Quote request
          </p>
          <StatusBadge status={row.lead_status} />
          {row.lead_status_updated_at ? (
            <span
              className="font-mono text-xs text-zinc-600"
              title={formatDateFull(row.lead_status_updated_at)}
            >
              {relativeTime(row.lead_status_updated_at)}
            </span>
          ) : null}
        </div>

        {/* Hero — customer name dominates the page top */}
        <h1 className="mt-3 text-3xl font-display tracking-tight text-zinc-900 sm:text-4xl lg:text-5xl">
          {row.name}
        </h1>
        <p
          className="mt-2 font-mono text-xs text-zinc-600"
          title={formatDateFull(row.created_at)}
        >
          Received {relativeTime(row.created_at)}{" "}
          <span aria-hidden className="mx-1 text-zinc-600">
            ·
          </span>{" "}
          {formatDateFull(row.created_at)}
        </p>

        {/* Phase OPS-2A: operational summary strip. Compact scannable
            line carrying lane + miles, pickup target, FQ total, outstanding
            balance, and the top urgency chip. All fields conditional —
            the strip renders nothing when no fields populated. */}
        {summaryHasContent ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-zinc-200 py-3">
            {hasLane ? (
              <span className="inline-flex items-baseline gap-2">
                <span className="label-cap text-zinc-600">Lane</span>
                <span className="font-mono text-sm font-semibold text-zinc-900">
                  {row.pickup_zip}
                  <span aria-hidden className="mx-1 text-red-600">→</span>
                  {row.delivery_zip}
                </span>
                {computedMiles != null ? (
                  <span className="font-mono text-xs text-zinc-600">
                    ~{computedMiles} mi
                  </span>
                ) : null}
              </span>
            ) : null}
            {row.pickup_date ? (
              <span className="inline-flex items-baseline gap-2">
                <span className="label-cap text-zinc-600">Pickup</span>
                <span className="text-sm text-zinc-900">{row.pickup_date}</span>
              </span>
            ) : null}
            {paymentTarget && paymentTarget.totalAmount !== null ? (
              <span className="inline-flex items-baseline gap-2">
                <span className="label-cap text-zinc-600">Total</span>
                <span className="font-mono text-sm font-semibold text-zinc-900">
                  {formatPaymentAmount(paymentTarget.totalAmount)}
                </span>
              </span>
            ) : null}
            {outstanding > 0 ? (
              <span className="inline-flex items-baseline gap-2">
                <span className="label-cap text-zinc-600">Outstanding</span>
                <span className="font-mono text-sm font-semibold text-amber-800">
                  {formatPaymentAmount(outstanding)}
                </span>
              </span>
            ) : null}
            {topUrgencyChip ? (
              <span
                className={
                  "inline-flex items-center border px-2 py-0.5 font-mono text-xs tracking-[0.12em] uppercase " +
                  URGENCY_SEVERITY_CLASSES_LIGHT[topUrgencyChip.severity]
                }
                title={topUrgencyChip.kind}
              >
                {topUrgencyChip.label}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Phase OPS-2A: command row. StatusSelector on the left;
            Call + Email + Open Quote PDF on the right. Call/Email moved
            out of Workspace QuickActions so dispatchers can dial without
            tab switching. The three right-cluster buttons share the same
            secondary-light treatment for cohesion. */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            {!isTrashed ? (
              <StatusSelector
                quoteRequestId={row.id}
                status={row.lead_status}
              />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">
            <a
              href={phoneHref}
              className="inline-flex items-center gap-2 border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold tracking-[0.12em] text-zinc-700 uppercase transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
            >
              <span aria-hidden className="inline-block h-1.5 w-1 shrink-0 bg-red-600" />
              Call
            </a>
            <a
              href={mailHref}
              className="inline-flex items-center gap-2 border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold tracking-[0.12em] text-zinc-700 uppercase transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
            >
              <span aria-hidden className="inline-block h-1.5 w-1 shrink-0 bg-red-600" />
              Email
            </a>
            <button
              type="button"
              onClick={() => setActiveTab("generated")}
              className="inline-flex items-center gap-2 border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold tracking-[0.12em] text-zinc-700 uppercase transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
            >
              Open Quote PDF
            </button>
          </div>
        </div>
      </header>

      <nav
        role="tablist"
        aria-label="Quote detail sections"
        className="mt-5 flex overflow-x-auto sm:mt-6 [mask-image:linear-gradient(to_right,black_88%,transparent)] sm:[mask-image:none]"
      >
        {TABS.map((tab, i) => {
          const isActive = activeTab === tab.id;
          // Phase N: Metadata tab visually de-emphasized when inactive
          // (admin-only technical info, lower priority than workflow tabs).
          const isMetadata = tab.id === "metadata";
          // Phase OPS-2B: per-tab dot indicators. Red dot when ANY sent
          // row on that tab has a bounce_kind set. Amber dot on the
          // Finalized Quote tab when outstanding > 0. Both dots can
          // appear simultaneously on the FQ tab (rendered side-by-side).
          const showBounceDot =
            (tab.id === "request" && hasBouncedEstimate) ||
            (tab.id === "finalized" && hasBouncedFq) ||
            (tab.id === "bol" && hasBouncedBol);
          const showPaymentDot =
            tab.id === "finalized" && outstanding > 0;
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
                "shrink-0 border px-5 py-3.5 text-xs font-semibold tracking-[0.12em] uppercase transition-colors " +
                (i > 0 ? "-ml-px " : "") +
                (isActive
                  ? "relative z-10 border-zinc-200 border-b-white bg-white text-zinc-900 font-bold"
                  : isMetadata
                    ? "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-700"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900")
              }
            >
              <span className="inline-flex items-center gap-1.5">
                {tab.label}
                {showBounceDot ? (
                  <span
                    aria-hidden
                    title="One or more sent rows on this tab bounced"
                    className="inline-block h-1.5 w-1.5 shrink-0 bg-red-600"
                  />
                ) : null}
                {showPaymentDot ? (
                  <span
                    aria-hidden
                    title="Outstanding balance"
                    className="inline-block h-1.5 w-1.5 shrink-0 bg-amber-600"
                  />
                ) : null}
              </span>
            </button>
          );
        })}
      </nav>

      <div
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="relative -mt-px border border-zinc-200 bg-white p-5 shadow-sm sm:p-6"
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
          />
        ) : null}
        {activeTab === "finalized" ? (
          <FinalizedQuoteSection
            quoteRequestId={row.id}
            leadName={row.name}
            state={finalizedQuoteState}
            sentHistory={sentFinalizedQuotes}
            isTrashed={isTrashed}
            submittedIntake={submittedIntake}
            paymentTarget={paymentTarget}
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
        {activeTab === "metadata" ? (
          <MetadataTab row={row} events={events} />
        ) : null}
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
}: {
  row: QuoteDetailRow;
  phoneHref: string;
  draftEstimate: EstimateDraft | null;
  sentEstimates: SentEstimateRow[];
  computedMiles: number | null;
  isTrashed: boolean;
  submittedIntake: SubmittedIntakeData | null;
}) {
  const hasLane = Boolean(row.pickup_zip && row.delivery_zip);

  return (
    <div className="space-y-7">
      {/* Phase OPS-2A: <QuickActions /> render dropped here. The Call/Email
          anchors moved into the persistent quote-detail header command row
          (visible on every tab). QuickActions.tsx is kept in the codebase
          for code preservation but is no longer consumed. */}

      {/* Phase W2: unified Load preview replaces the prior three stacked
          groups (Load overview / Finalized load information / Dispatch
          ownership). Primary client/contact sits at the top of the shell
          and is always shown; the body switches between the lead-form
          summary (State A) and SubmittedIntakePanel (State B) depending
          on whether the customer has submitted intake. Dispatch ownership
          has been removed from Workspace for now — DispatchOwnershipPanel
          and updateDispatchOwnership remain in the codebase for later
          re-introduction. */}
      <section className="space-y-5">
        <GroupHeading>Load preview</GroupHeading>
        <LoadPreview
          row={row}
          phoneHref={phoneHref}
          computedMiles={computedMiles}
          submittedIntake={submittedIntake}
          hasLane={hasLane}
        />
      </section>

      {/* GROUP: Range quote — primary action area */}
      <section className="space-y-5">
        <GroupHeading>Range quote</GroupHeading>
        {!isTrashed ? (
          <section className="border border-zinc-400 border-t-2 border-t-red-600 bg-white p-5 shadow-lg shadow-black/40 sm:p-7">
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
          <section className="border border-zinc-200 bg-zinc-50 p-8 text-center">
            <p className="label-cap text-zinc-600">
              Request is in trash
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">
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
      <div className="border border-red-300 bg-red-50 p-5 sm:p-6">
        <p className="text-xs font-semibold tracking-[0.12em] text-red-600 uppercase">
          PDF unavailable
        </p>
        <p className="mt-2 text-sm leading-relaxed text-red-800">
          A generated quote row exists ({generatedQuote.quoteNumber}) but its
          stored PDF couldn&rsquo;t be loaded. Re-generate to refresh.
        </p>
      </div>
    );
  }

  if (isTrashed) {
    return (
      <div className="border border-zinc-200 bg-zinc-50 p-8 text-center">
        <p className="font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase">
          Request is in trash
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
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
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-700">
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

function MetadataTab({
  row,
  events,
}: {
  row: QuoteDetailRow;
  events: DispatchEvent[];
}) {
  // Phase UI-M2: lifecycle subsection only renders when something to
  // show — avoids an empty card on healthy active leads.
  const hasLifecycle = Boolean(row.deleted_at || row.delete_after);
  return (
    <div className="space-y-10 sm:space-y-12">
      {/* Top header — Metadata frames itself as the operational
          record + audit surface, not a random technical dump. The
          dimmed treatment from Phase N is preserved so the tab still
          reads as secondary to the workflow tabs. */}
      <header>
        <h2 className="label-cap text-zinc-600">
          Metadata
        </h2>
        <p className="mt-1.5 text-xs text-zinc-600">
          Operational record · audit surface
        </p>
      </header>

      {/* Subsection: Request record — how the lead came in. */}
      <section>
        <SubHeading>Request record</SubHeading>
        <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
          <Field label="Created" muted>
            <span className="font-mono text-xs text-zinc-700 sm:text-sm">
              {formatDateFull(row.created_at)}
            </span>
          </Field>
          <Field label="Request ID" muted full>
            <span className="font-mono text-xs break-all text-zinc-700">
              {row.id}
            </span>
          </Field>
          {row.user_agent ? (
            <Field label="User agent" muted full>
              <span className="font-mono text-xs break-all text-zinc-600">
                {row.user_agent}
              </span>
            </Field>
          ) : null}
          {row.ip ? (
            <Field label="IP" muted>
              <span className="font-mono text-xs text-zinc-600">
                {row.ip}
              </span>
            </Field>
          ) : null}
        </dl>
      </section>

      {/* Subsection: Lifecycle — admin actions on the request itself
          (soft-delete + scheduled purge). Conditional so it disappears
          for healthy leads. */}
      {hasLifecycle ? (
        <section>
          <SubHeading>Lifecycle</SubHeading>
          <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
            {row.deleted_at ? (
              <Field label="Deleted" muted>
                <span className="font-mono text-xs text-red-700 sm:text-sm">
                  {formatDateFull(row.deleted_at)}
                </span>
              </Field>
            ) : null}
            {row.delete_after ? (
              <Field label="Auto-purge" muted>
                <span className="font-mono text-xs text-zinc-700 sm:text-sm">
                  {formatDateFull(row.delete_after)}
                </span>
              </Field>
            ) : null}
          </dl>
        </section>
      ) : null}

      {/* Subsection: Activity timeline — merged in from the dropped
          Activity tab in UI-M1. CommTimeline's own internal header pill
          was dropped in UI-M2 since the SubHeading here now carries the
          subsection identity. */}
      <section>
        <SubHeading>Activity timeline</SubHeading>
        <div className="mt-4">
          <CommTimeline quoteRequestId={row.id} events={events} />
        </div>
      </section>
    </div>
  );
}

/**
 * Phase W2: unified Load preview shell. Renders ONE coherent operational
 * preview surface instead of the prior three stacked cards. The shell
 * has a persistent header (primary client + state badge) and a body that
 * adapts to intake state:
 *
 *   - State A (submittedIntake === null) — original lead-form data:
 *     lane, pickup target, commodity, approximate weight, customer notes.
 *
 *   - State B (submittedIntake !== null) — SubmittedIntakePanel rendered
 *     verbatim inside the shell, plus a `<details>` disclosure that
 *     surfaces the original quote-form values for comparison.
 *
 * No logic changes — purely a structural/visual consolidation. The
 * descendants (SubmittedIntakePanel, Field) are reused as-is.
 */
function LoadPreview({
  row,
  phoneHref,
  computedMiles,
  submittedIntake,
  hasLane,
}: {
  row: QuoteDetailRow;
  phoneHref: string;
  computedMiles: number | null;
  submittedIntake: SubmittedIntakeData | null;
  hasLane: boolean;
}) {
  return (
    <div className="border border-zinc-300 bg-white">
      {/* Header — primary client/contact + state badge. Always shown. */}
      <header className="border-b border-zinc-300 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="label-cap">Primary client</p>
            <p className="mt-2 text-xl font-semibold text-zinc-900 sm:text-2xl">
              {row.name}
            </p>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-6">
              <div>
                <dt className="label-cap">Phone</dt>
                <dd className="mt-1">
                  <a
                    href={phoneHref}
                    className="block break-all font-mono text-xl text-zinc-900 underline-offset-4 hover:underline sm:text-2xl"
                  >
                    {row.phone}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="label-cap">Email</dt>
                <dd className="mt-1">
                  <a
                    href={`mailto:${row.email}`}
                    className="block break-all text-base text-zinc-900 underline-offset-4 hover:underline sm:text-lg"
                  >
                    {row.email}
                  </a>
                </dd>
              </div>
            </dl>
          </div>
          <div className="shrink-0">
            {submittedIntake ? (
              <span className="inline-flex items-center border border-green-300 bg-green-50 px-2.5 py-1 font-mono text-xs tracking-[0.12em] text-green-800 uppercase">
                Intake confirmed
              </span>
            ) : (
              <span className="inline-flex items-center border border-amber-300 bg-amber-50 px-2.5 py-1 font-mono text-xs tracking-[0.12em] text-amber-800 uppercase">
                Awaiting intake
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Body — adapts to intake state. */}
      <div className="space-y-6 p-5 sm:p-6">
        {submittedIntake ? (
          <>
            {/* SubmittedIntakePanel rendered verbatim — its existing
                green-accent border-top now reads as the confirmed-intake
                indicator within the unified shell. */}
            <SubmittedIntakePanel intake={submittedIntake} />

            {/* Comparison disclosure — keeps the original quote-form
                values one tap away without cluttering the preview. */}
            <details className="group border border-zinc-200 bg-zinc-50/50 p-4">
              <summary className="block cursor-pointer list-none font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase select-none transition-colors hover:text-zinc-900">
                <span className="group-open:hidden">+ View original quote-form request</span>
                <span className="hidden group-open:inline">− Hide original quote-form request</span>
              </summary>
              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <Field label="Original commodity" muted>
                  <span className="text-sm text-zinc-800">{row.commodity}</span>
                </Field>
                <Field label="Original weight" muted>
                  <span className="font-mono text-sm text-zinc-800">{row.weight}</span>
                </Field>
                <Field label="Original pickup target" muted>
                  <span className="text-sm text-zinc-800">
                    {row.pickup_date ?? "ASAP"}
                  </span>
                </Field>
                {row.notes ? (
                  <Field label="Original notes" muted full>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                      {row.notes}
                    </p>
                  </Field>
                ) : null}
              </dl>
            </details>
          </>
        ) : (
          <>
            {/* State A: lead-form data. Same visual language as the
                prior Load overview cards, just hosted inside the unified
                shell rather than as separate stacked sections. */}
            {hasLane ? (
              <section>
                <h3 className="label-cap">Lane</h3>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
                  <span className="font-mono text-2xl font-semibold text-zinc-900 sm:text-3xl">
                    {row.pickup_zip}
                  </span>
                  <span aria-hidden className="font-mono text-xl text-red-600">
                    &rarr;
                  </span>
                  <span className="font-mono text-2xl font-semibold text-zinc-900 sm:text-3xl">
                    {row.delivery_zip}
                  </span>
                  {computedMiles != null ? (
                    <span className="ml-1 font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase">
                      ~{computedMiles} mi
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 label-cap">
                  Pickup target:{" "}
                  <span className="text-zinc-800">
                    {row.pickup_date ?? "ASAP"}
                  </span>
                </p>
              </section>
            ) : null}

            <section>
              <h3 className="label-cap">Shipment</h3>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                <Field label="Commodity">
                  <span className="block text-xl text-zinc-900 sm:text-2xl">
                    {row.commodity}
                  </span>
                </Field>
                <Field label="Approximate weight">
                  <span className="block font-mono text-xl text-zinc-900 sm:text-2xl">
                    {row.weight}
                  </span>
                </Field>
              </dl>
            </section>

            {row.notes ? (
              <section>
                <h3 className="label-cap">Customer notes</h3>
                <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-zinc-900">
                  {row.notes}
                </p>
              </section>
            ) : null}
          </>
        )}
      </div>
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
    <h2 className="border-b border-zinc-200 pb-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-900">
      {children}
    </h2>
  );
}

/**
 * Phase UI-M2: subsection heading used inside MetadataTab to break the
 * merged metadata + activity surface into 3 conceptual zones (Request
 * record / Lifecycle / Activity timeline). Dimmer + smaller than
 * GroupHeading so Metadata reads as an admin/audit surface rather than
 * a primary workflow tab.
 */
function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="label-cap border-b border-zinc-200 pb-2 text-zinc-600">
      {children}
    </h3>
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
          (muted ? "text-zinc-600" : "text-zinc-600")
        }
      >
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}
