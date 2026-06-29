"use client";

import { useEffect, useState } from "react";
import {
  computeStageStates,
  DispatchLifecycle,
  headlineFromStates,
  STAGES,
  type DispatchStageInput,
} from "../DispatchLifecycle";
import {
  type IntakeUploadAdminRow,
  type LoadDetailsInitial,
} from "../LoadDetailsCard";
import { LaneSummaryCard } from "./DetailsTab";
import {
  describeEvent,
  type TimelineEventRow,
} from "./TimelineTab";
import type { SentArtifactIndex } from "../page";
import { resendEstimate } from "../../actions";
import { resendFinalizedQuote } from "../../finalized-quote-actions";
import { resendBol } from "../../bol-actions";
import { Button } from "@/components/ui/Button";

/**
 * Level 6.4 — V5 Overview tab.
 *
 * Vertical spine (top → bottom):
 *   1. Metadata strip          (single line: $range · stage · freight · received)
 *   2. Alert banner            (conditional; red; surfaces "Awaiting…" headlines)
 *   3. Lane + Customer cards   (2-up on desktop, stacked on mobile)
 *   4. Lifecycle line          (single-line dots + caption — slim variant)
 *   5. Context block           (Notes + Files merged, no per-row chrome)
 *   6. Activity                (top-3 events with View all toggle)
 *
 * Three primary cards only — Alert (conditional), Lane, Customer. Everything
 * else is inline metadata or a thin section rule. No new queries, no schema
 * changes, no business logic. Pure presentational restructure.
 *
 * Data reuse:
 *   - Lane card is the same `LaneSummaryCard` Details tab already mounts.
 *   - Lifecycle line derives from `computeStageStates` + `STAGES` exported by
 *     DispatchLifecycle.tsx — same source of truth as the full strip.
 *   - Alert headline reuses `headlineFromStates` so Overview and the Timeline
 *     subtitle never drift.
 *
 * Risk: LOW for plumbing. The pre-existing helpers gained additive `export`
 * keywords but their bodies are unchanged.
 */

type Accessorial = { label: string; amount: number };

export type OverviewTabProps = {
  /**
   * Latest quote range source values. Null when no draft/sent estimate
   * exists - hero renders its empty state.
   */
  quoteRange: {
    linehaulLow: number | null;
    linehaulHigh: number | null;
    fuelSurcharge: number | null;
    accessorials: Accessorial[] | null;
  } | null;
  /** Lifecycle artifact state - shared with Details / Pricing tabs. */
  lifecycle: DispatchStageInput;
  /** Customer identity. Email is needed for the Draft email action button. */
  customer: { name: string; phone: string; email: string };
  freight: { commodity: string; weight: string };
  /** Full lane snapshot. Same shape Details tab consumes — passed straight
   *  through to the shared `LaneSummaryCard`. */
  lane: LoadDetailsInitial;
  /** Server-computed lane distance. Passed straight through to LaneSummaryCard. */
  miles: number | null;
  /** quote_requests.notes - Quick Quote "Anything else?" textarea. */
  customerNotes: string | null;
  /** Customer-uploaded intake documents. */
  uploads: IntakeUploadAdminRow[];
  /** Newest-first dispatch_events feed. Activity block slices the top 3. */
  events: TimelineEventRow[];
  /** Lead-received timestamps already computed at page.tsx. */
  received: { relative: string; full: string };
  /** quote_requests.id — drives the per-event PDF view link URLs. */
  quoteRequestId: string;
  /** Newest-first sent-artifact indexes. Activity feed uses these to:
   *  (a) render a "View" link on sent/resent rows that opens the actual
   *  PDF, and (b) replace dispatch_events.created_at with the artifact's
   *  sent_at as the displayed timestamp — the source of truth for "when
   *  it was sent". */
  sentArtifacts: SentArtifactIndex;
};

type DerivedRange = { low: number; high: number | null } | null;

function deriveRange(range: OverviewTabProps["quoteRange"]): DerivedRange {
  if (!range) return null;
  if (range.linehaulLow == null || range.linehaulLow <= 0) return null;
  const fuel = range.fuelSurcharge ?? 0;
  const accessorialsSum = (range.accessorials ?? []).reduce(
    (sum, a) => sum + (Number.isFinite(a.amount) ? a.amount : 0),
    0,
  );
  const low = range.linehaulLow + fuel + accessorialsSum;
  const hasHigh =
    range.linehaulHigh != null && range.linehaulHigh > range.linehaulLow;
  const high = hasHigh
    ? (range.linehaulHigh as number) + fuel + accessorialsSum
    : null;
  return { low, high };
}

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function toTitleCase(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\s+/)
    .map((w) =>
      w.length === 0 ? "" : w[0].toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}

function formatFreightWeight(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withoutSuffix = trimmed.replace(/\s*lbs?\.?\s*$/i, "").trim();
  const numClean = withoutSuffix.replace(/,/g, "");
  if (/^\d+(\.\d+)?$/.test(numClean)) {
    const num = Number(numClean);
    if (Number.isFinite(num)) {
      const formatted = Math.round(num).toLocaleString();
      return `${formatted} lbs`;
    }
  }
  return trimmed;
}

// Range as a single token for the metadata strip ("$598" or "$598 – $720").
function formatRangeToken(derived: DerivedRange): string | null {
  if (!derived) return null;
  if (derived.high == null) return formatUsd(derived.low);
  return `${formatUsd(derived.low)} – ${formatUsd(derived.high)}`;
}

// "02 / 05" position based on the active stage in STAGES.
function stagePosition(
  states: Record<string, "done" | "active" | "pending">,
): { position: string; label: string } {
  const idx = STAGES.findIndex((s) => states[s.id] === "active");
  const safeIdx = idx >= 0 ? idx : STAGES.length - 1;
  const stage = STAGES[safeIdx];
  return {
    position: `${stage.ordinal} / ${STAGES[STAGES.length - 1].ordinal}`,
    label: stage.label,
  };
}

// Alert eligibility: any state that starts with "Awaiting" or "Ready" or
// "Send" qualifies. The terminal "complete" states never raise an alert.
function isAlertHeadline(headline: string): boolean {
  return (
    headline.startsWith("Awaiting") ||
    headline.startsWith("Ready") ||
    headline.startsWith("Send")
  );
}

export function OverviewTab({
  quoteRange,
  lifecycle,
  customer,
  freight,
  lane,
  miles,
  customerNotes,
  uploads,
  events,
  received,
  quoteRequestId,
  sentArtifacts,
}: OverviewTabProps) {
  const derived = deriveRange(quoteRange);
  const stageStates = computeStageStates(lifecycle);
  const headline = headlineFromStates(stageStates);
  const stage = stagePosition(stageStates);

  const rangeToken = formatRangeToken(derived);
  const commodityToken = toTitleCase(freight.commodity);
  const weightToken = formatFreightWeight(freight.weight);
  const freightToken = [commodityToken, weightToken]
    .filter((s) => s.length > 0)
    .join(" · ");

  const phoneHref = `tel:${customer.phone.replace(/[^\d+]/g, "")}`;
  const emailHref = `mailto:${customer.email}`;

  return (
    <div className="space-y-4 px-4 pt-1 pb-6 sm:space-y-5 sm:px-6 sm:pt-1.5 lg:px-8">
      {/* Lifecycle — full 5-cell strip */}
      <DispatchLifecycle state={lifecycle} />

      {/* Context block — Notes + Files merged */}
      <ContextBlock notes={customerNotes} uploads={uploads} />

      {/* Activity — top 3 with View all */}
      <ActivityBlock
        events={events}
        quoteRequestId={quoteRequestId}
        sentArtifacts={sentArtifacts}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Metadata strip
// ---------------------------------------------------------------------------

function MetadataStrip({
  rangeToken,
  stagePosition,
  stageLabel,
  freightToken,
  receivedFull,
}: {
  rangeToken: string | null;
  stagePosition: string;
  stageLabel: string;
  freightToken: string;
  receivedFull: string;
}) {
  const tokens: string[] = [];
  if (rangeToken) tokens.push(`${rangeToken} RANGE`);
  tokens.push(`${stagePosition} ${stageLabel.toUpperCase()}`);
  if (freightToken) tokens.push(freightToken.toUpperCase());
  if (receivedFull) tokens.push(receivedFull.toUpperCase());

  return (
    <p
      aria-label="Quote summary"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-fg sm:text-[12px]"
    >
      {tokens.map((t, i) => (
        <span key={i} className="flex items-center gap-x-2">
          {i > 0 ? (
            <span aria-hidden className="text-fg/40">
              ·
            </span>
          ) : null}
          <span>{t}</span>
        </span>
      ))}
    </p>
  );
}

// ---------------------------------------------------------------------------
// 2. Alert banner
// ---------------------------------------------------------------------------

function AlertBanner({
  headline,
  receivedRelative,
}: {
  headline: string;
  receivedRelative: string;
}) {
  return (
    <section
      aria-label="Action required"
      className="flex items-center gap-3 border-2 border-line border-l-4 border-l-black bg-red-700 px-4 py-3 text-white sm:gap-4 sm:px-5"
    >
      <span
        aria-hidden
        className="inline-block h-[14px] w-1 shrink-0 bg-card"
      />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-fg sm:text-[12px]">
          Action required
        </p>
        <p className="mt-0.5 text-[13px] font-bold text-fg sm:text-[14px]">
          {headline}
        </p>
        <p className="mt-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-fg/80">
          Received {receivedRelative}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3. Customer card
// ---------------------------------------------------------------------------

function CustomerCard({
  name,
  phone,
  email,
  phoneHref,
  emailHref,
}: {
  name: string;
  phone: string;
  email: string;
  phoneHref: string;
  emailHref: string;
}) {
  const hasName = name.trim().length > 0;
  const hasPhone = phone.trim().length > 0;
  const hasEmail = email.trim().length > 0;

  return (
    <section
      aria-label="Customer"
      className="border-2 border-line border-l-4 border-l-black bg-[#fafaf6] px-5 py-5 sm:px-6 sm:py-6"
    >
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-fg">
        Customer
      </p>
      <p className="mt-1.5 text-[22px] font-bold leading-tight text-fg sm:text-[24px]">
        {hasName ? name : "—"}
      </p>

      <div className="mt-4 space-y-2">
        {hasPhone ? (
          <a
            href={phoneHref}
            aria-label={`Call ${name || "customer"}`}
            className="flex w-full items-center justify-center border-2 border-line bg-card px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.16em] text-fg transition-colors hover:bg-[#f3f1e9]"
          >
            <span aria-hidden className="mr-2">
              &#9742;
            </span>
            {phone}
          </a>
        ) : null}
        {hasEmail ? (
          <a
            href={emailHref}
            aria-label={`Draft email to ${name || "customer"}`}
            className="flex w-full items-center justify-center border-2 border-line bg-card px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.16em] text-fg transition-colors hover:bg-[#f3f1e9]"
          >
            <span aria-hidden className="mr-2">
              &#9993;
            </span>
            Draft email
          </a>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 5. Context block (Notes + Files merged)
// ---------------------------------------------------------------------------

function ContextBlock({
  notes,
  uploads,
}: {
  notes: string | null;
  uploads: IntakeUploadAdminRow[];
}) {
  const hasNotes = notes != null && notes.trim().length > 0;

  return (
    <section aria-label="Context" className="border-t border-line pt-3">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-fg">
        Context
      </p>

      {/* Notes row */}
      <div className="mt-2 grid grid-cols-[60px_minmax(0,1fr)] items-baseline gap-x-3">
        <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
          Notes
        </p>
        {hasNotes ? (
          <p className="whitespace-pre-wrap text-[13px] leading-snug text-fg">
            {notes}
          </p>
        ) : (
          <p className="text-[13px] leading-snug text-fg-subtle">
            No customer notes
          </p>
        )}
      </div>

      {/* Files row */}
      <div className="mt-1.5 grid grid-cols-[60px_minmax(0,1fr)] items-baseline gap-x-3">
        <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
          Files
        </p>
        {uploads.length === 0 ? (
          <p className="text-[13px] leading-snug text-fg-subtle">
            No customer documents uploaded
          </p>
        ) : (
          <ul className="space-y-0.5">
            {uploads.map((u) => {
              const isImg = u.mimeType.startsWith("image/");
              const typeBadge = isImg ? "IMG" : "PDF";
              return (
                <li key={u.id} className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
                    {typeBadge}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                    {u.originalFilename}
                  </span>
                  {u.signedUrl ? (
                    <a
                      href={u.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${u.originalFilename} in a new tab`}
                      className="shrink-0 font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-fg-muted hover:text-fg hover:underline"
                    >
                      Open &nearr;
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 6. Activity (top-3 collapsed; expandable via View all)
// ---------------------------------------------------------------------------

function ActivityBlock({
  events,
  quoteRequestId,
  sentArtifacts,
}: {
  events: TimelineEventRow[];
  quoteRequestId: string;
  sentArtifacts: SentArtifactIndex;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? events : events.slice(0, 3);
  const hasMore = events.length > 3;

  return (
    <section
      aria-label="Recent activity"
      className="border-t border-line pt-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-fg">
          Recent activity
        </p>
        {hasMore && !showAll ? (
          <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
            Top 3 of {events.length}
          </p>
        ) : null}
      </div>

      {events.length === 0 ? (
        <p className="mt-2 text-[13px] leading-snug text-fg-subtle">
          No events yet
        </p>
      ) : (
        <>
          <ol className="mt-2">
            {visible.map((row) => {
              const { label, description } = describeEvent(
                row.kind,
                row.payload,
              );
              // Resolve doc link + sent-time from the source-of-truth
              // artifact row when this event is a sent/resent kind.
              const link = resolveEventDocLink(
                row,
                quoteRequestId,
                sentArtifacts,
              );
              const ts = formatShortEventTime(link?.sentAt ?? row.createdAt);
              return (
                <li
                  key={row.id}
                  className="grid grid-cols-[60px_minmax(0,1fr)_auto] items-start gap-x-3 py-1.5 sm:grid-cols-[72px_minmax(0,1fr)_auto_auto] sm:gap-x-4"
                >
                  <span
                    className="flex flex-col font-mono text-[11px] tabular-nums leading-tight text-fg-muted"
                    aria-label="Event timestamp"
                  >
                    {ts.date ? (
                      <span className="font-bold uppercase tracking-[0.08em] text-fg">
                        {ts.date}
                      </span>
                    ) : null}
                    {ts.time ? (
                      <span className="text-fg-subtle">{ts.time}</span>
                    ) : null}
                    {!ts.date && !ts.time ? <span>—</span> : null}
                  </span>
                  <div className="min-w-0">
                    <span className="block truncate text-[13px] font-bold text-fg">
                      {label}
                    </span>
                    {description ? (
                      <span className="block truncate font-mono text-[11px] text-fg-subtle sm:hidden">
                        {description}
                      </span>
                    ) : null}
                  </div>
                  {description ? (
                    <span className="hidden truncate font-mono text-[11px] text-fg-subtle sm:inline sm:max-w-[260px] lg:max-w-[360px]">
                      {description}
                    </span>
                  ) : null}
                  {link ? (
                    <ViewEmailButton
                      href={link.href}
                      docType={link.resend.docType}
                      sourceId={link.resend.sourceId}
                      label={label}
                    />
                  ) : (
                    <span className="hidden sm:inline" aria-hidden />
                  )}
                </li>
              );
            })}
          </ol>

          {hasMore ? (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-fg-muted hover:text-fg hover:underline"
              >
                {showAll ? "Show top 3 ↑" : "View all →"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

type ResendDocType = "estimate" | "finalized_quote" | "bol";
type ResolvedDocLink = {
  /** Opens the rendered HTML email (preview_html + From/To/Subject strip). */
  href: string;
  /** Source-of-truth send time pulled off the artifact row. */
  sentAt: string;
  /** Per-row Resend wiring. Always populated when href is — every sent
   *  doc can be re-delivered via its `resend*` server action. */
  resend: { docType: ResendDocType; sourceId: string };
};

/**
 * Resolve a sent/resent dispatch_events row to:
 *   1. An EMAIL view link (preview_html wrapped in a header strip) — the
 *      operator's "what did the recipient see" audit view.
 *   2. The artifact's own sent_at (displayed timestamp).
 *   3. Resend metadata: docType + sourceId for the inline Resend button.
 *
 *   estimate_resent       → payload.newEstimateId (carried explicitly)
 *   estimate_sent         → match by sent_at proximity to event.createdAt
 *   finalized_quote_*     → same pattern via sentArtifacts.fqs
 *   bol_*                 → same pattern via sentArtifacts.bols
 *
 * Returns null if no doc id can be resolved (payload drift / row deleted).
 */
function resolveEventDocLink(
  row: TimelineEventRow,
  quoteRequestId: string,
  index: SentArtifactIndex,
): ResolvedDocLink | null {
  const base = `/admin/quotes/${quoteRequestId}`;
  // Resent kinds — id is on the payload.
  if (row.kind === "estimate_resent") {
    const p = row.payload as { newEstimateId?: string } | null;
    const id = p?.newEstimateId;
    if (!id) return null;
    const match = index.estimates.find((a) => a.id === id);
    return {
      href: `${base}/estimate-email/${id}`,
      sentAt: match?.sentAt ?? row.createdAt,
      resend: { docType: "estimate", sourceId: id },
    };
  }
  if (row.kind === "finalized_quote_resent") {
    const p = row.payload as { newFinalizedQuoteId?: string } | null;
    const id = p?.newFinalizedQuoteId;
    if (!id) return null;
    const match = index.fqs.find((a) => a.id === id);
    return {
      href: `${base}/finalized-quote-email/${id}`,
      sentAt: match?.sentAt ?? row.createdAt,
      resend: { docType: "finalized_quote", sourceId: id },
    };
  }
  if (row.kind === "bol_resent") {
    const p = row.payload as { newBolId?: string } | null;
    const id = p?.newBolId;
    if (!id) return null;
    const match = index.bols.find((a) => a.id === id);
    return {
      href: `${base}/bol-email/${id}`,
      sentAt: match?.sentAt ?? row.createdAt,
      resend: { docType: "bol", sourceId: id },
    };
  }
  // Sent kinds — match by sent_at proximity.
  if (row.kind === "estimate_sent") {
    const match = findClosestArtifact(index.estimates, row.createdAt);
    if (!match) return null;
    return {
      href: `${base}/estimate-email/${match.id}`,
      sentAt: match.sentAt,
      resend: { docType: "estimate", sourceId: match.id },
    };
  }
  if (row.kind === "finalized_quote_sent") {
    const match = findClosestArtifact(index.fqs, row.createdAt);
    if (!match) return null;
    return {
      href: `${base}/finalized-quote-email/${match.id}`,
      sentAt: match.sentAt,
      resend: { docType: "finalized_quote", sourceId: match.id },
    };
  }
  if (row.kind === "bol_sent") {
    const match = findClosestArtifact(index.bols, row.createdAt);
    if (!match) return null;
    return {
      href: `${base}/bol-email/${match.id}`,
      sentAt: match.sentAt,
      resend: { docType: "bol", sourceId: match.id },
    };
  }
  return null;
}

/**
 * Activity row "View" button — opens an in-page modal containing an
 * iframe to the matching email-view route (preview_html bytes wrapped
 * in a From/To/Subject header strip). The modal also hosts the Resend
 * control: scoped to the email viewer (not the activity feed) so
 * operators see what's about to go out *before* they re-deliver it.
 *
 * Why a modal instead of a new tab: dispatch is mid-workflow when they
 * click View. A new tab steals focus and forces a context switch. The
 * modal keeps them on the same page; Esc / backdrop close returns them
 * to the activity feed without losing scroll position.
 */
function ViewEmailButton({
  href,
  docType,
  sourceId,
  label,
}: {
  href: string;
  docType: ResendDocType;
  sourceId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="navigate"
        size="sm"
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${label} email`}
        className="shrink-0 self-baseline"
      >
        View
      </Button>
      {open ? (
        <EmailViewerModal
          href={href}
          docType={docType}
          sourceId={sourceId}
          label={label}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * Modal email viewer.
 *
 * Layout:
 *   - Fixed-position backdrop (semi-opaque), click to close.
 *   - Centered panel: header strip with title + Close, iframe body, and
 *     a footer action row with the Resend button.
 *   - Iframe src is the email-view route — preview_html bytes rendered
 *     server-side and returned as text/html.
 *
 * Esc closes. Backdrop click closes. Resend submits the matching
 * `resend*` server action; on success the parent page revalidates and a
 * new activity row appears in the feed (the modal stays open so the
 * operator gets a visual confirmation).
 */
function EmailViewerModal({
  href,
  docType,
  sourceId,
  label,
  onClose,
}: {
  href: string;
  docType: ResendDocType;
  sourceId: string;
  label: string;
  onClose: () => void;
}) {
  const action =
    docType === "estimate"
      ? resendEstimate.bind(null, sourceId)
      : docType === "finalized_quote"
        ? resendFinalizedQuote.bind(null, sourceId)
        : resendBol.bind(null, sourceId);

  // Esc-to-close + body scroll lock while the modal is mounted. The lock
  // keeps the page underneath fixed so the only thing that can move is
  // the iframe's own content. Restored on unmount.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label} email viewer`}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#fafaf6]"
    >
        {/* Header strip */}
        <div className="flex items-center justify-between gap-3 border-b-2 border-line bg-[#fafaf6] px-4 py-3 sm:px-5">
          <p className="truncate font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-fg">
            {label} — Email
          </p>
          <Button
            variant="cancel"
            size="sm"
            type="button"
            onClick={onClose}
            aria-label="Close email viewer"
          >
            Close
          </Button>
        </div>

        {/* Iframe body — loads the email-view route. */}
        <iframe
          src={href}
          title={`${label} email`}
          className="min-h-0 flex-1 bg-card"
        />

        {/* Footer action row: Resend. Empty FormData → resend action
            falls back to the original preview_to recipient. */}
        <div className="flex items-center justify-end gap-3 border-t-2 border-line bg-[#fafaf6] px-4 py-3 sm:px-5">
          <form action={action}>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              aria-label={`Resend ${label}`}
            >
              Resend
            </Button>
          </form>
        </div>
    </div>
  );
}

function findClosestArtifact(
  artifacts: { id: string; sentAt: string }[],
  eventIso: string,
): { id: string; sentAt: string } | null {
  if (artifacts.length === 0) return null;
  const target = new Date(eventIso).getTime();
  if (Number.isNaN(target)) return artifacts[artifacts.length - 1]!;
  let best = artifacts[0]!;
  let bestDelta = Math.abs(new Date(best.sentAt).getTime() - target);
  for (let i = 1; i < artifacts.length; i++) {
    const a = artifacts[i]!;
    const delta = Math.abs(new Date(a.sentAt).getTime() - target);
    if (delta < bestDelta) {
      best = a;
      bestDelta = delta;
    }
  }
  return best;
}

// Local compact timestamp formatter — returns the date label and the
// time-of-day as separate strings so the activity row can stack them
// (date on top, time underneath). Rules:
//   - Same day → date "Today", time HH:MM:SS (seconds disambiguate
//     two same-minute resends).
//   - Yesterday → date "Yest", time HH:MM.
//   - This-year → date "MMM D" (e.g. "Jun 5"), time HH:MM.
//   - Older → date "YYYY-MM-DD", time HH:MM.
function formatShortEventTime(iso: string): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: "" };
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return { date: "Today", time: `${hh}:${mm}:${ss}` };
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const isYest =
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate();
  if (isYest) return { date: "Yest", time: `${hh}:${mm}` };
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    const month = d.toLocaleString("en-US", { month: "short" });
    return { date: `${month} ${d.getDate()}`, time: `${hh}:${mm}` };
  }
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    time: `${hh}:${mm}`,
  };
}
