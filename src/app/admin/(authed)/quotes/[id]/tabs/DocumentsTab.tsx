import { BolWorkspace, type BolState } from "../BolWorkspace";
import { DocumentViewButton } from "../DocumentViewButton";
import { quoteAgo, quoteClock, quoteDate } from "../quoteTime";
import { resendEstimate } from "../../actions";
import { resendFinalizedQuote } from "../../finalized-quote-actions";
import { resendBol } from "../../bol-actions";

/**
 * Documents tab (V4.8).
 *
 * Two sections, top to bottom:
 *   1. Sent documents - every Range proposal, Finalized Quote, and BOL
 *      that has been sent out, newest first. Duplicates allowed (resends
 *      surface as separate rows). Each row exposes View / Download /
 *      Resend actions.
 *   2. Bill of Lading workspace - existing BolWorkspace mounted as-is
 *      for creating / sending new BOLs.
 *
 * SENT DOCUMENTS section.
 *   - Source rows: dispatch_estimates / finalized_quotes /
 *     bills_of_lading filtered by sent_at IS NOT NULL.
 *   - "Allow duplicates" semantics: no deduplication. Every sent row is
 *     its own list entry. Resends insert NEW rows in those tables, so
 *     a resent doc appears alongside the original.
 *   - View opens the PDF in a new tab; Download uses the HTML `download`
 *     attribute on the same URL.
 *   - All three doc types have PDF routes wired through page.tsx's
 *     loadSentDocuments helper. If pdfHref ever comes back null the row
 *     falls back to an "Email" placeholder; today that path is unused.
 *   - Resend submits an empty FormData to the existing server action,
 *     which falls back to the original recipient (preview_to). Email
 *     override could be wired through here later.
 *
 * BOL workspace mounted UNCHANGED. PreviewModal, fingerprint, send path,
 * PDF route - none of it is touched here.
 *
 * Risk: LOW (read-only list plus server-action button forms; the resend
 * actions are pre-existing and battle-tested).
 */

export type SentDocumentType = "estimate" | "finalized_quote" | "bol";

export type SentDocumentRow = {
  /** Discriminator drives which resend action and which PDF route. */
  type: SentDocumentType;
  /** DB row id of the SENT row (dispatch_estimates / finalized_quotes /
   *  bills_of_lading). Used for both PDF href and resend action. */
  id: string;
  /** Display label, e.g. "Range proposal", "Finalized Quote #1234",
   *  "BOL #5678". */
  label: string;
  /** ISO timestamp from sent_at. */
  sentAt: string;
  /** preview_to on the source row. */
  recipient: string;
  /** PDF route href when applicable; null for estimates. */
  pdfHref: string | null;
  /** Sent email HTML (preview_html). Used for range proposals, which are
   *  email-only — View renders this instead of a PDF so the customer-facing
   *  email is shown and the internal fuel-surcharge PDF is never exposed. */
  emailHtml?: string | null;
  /** Display amount shown next to the label, e.g. "$1,200" or
   *  "$750–$1,000". Null for documents without a price (BOLs). */
  amount?: string | null;
  /** True for the most recent estimate and the most recent finalized quote
   *  — those rows get a highlight so the operator spots the live ones. */
  highlight?: boolean;
};

export type DocumentsTabProps = {
  quoteRequestId: string;
  bolState: BolState;
  sentDocuments: SentDocumentRow[];
  /** Level 8.1: next active lead id from page.tsx for the BOL workspace's
   *  "Save & open next" CTA on the Sent state. */
  nextLeadId: string | null;
};

export function DocumentsTab({
  quoteRequestId,
  bolState,
  sentDocuments,
  nextLeadId,
}: DocumentsTabProps) {
  return (
    <div className="space-y-4 px-4 pt-4 pb-6 sm:px-6 lg:px-8">
      {/* Level 8.1: BOL workspace surfaced above the Sent Documents
          audit list. Operator now lands on the action surface first;
          historical sent docs sit below as audit trail. */}
      <BolWorkspace
        quoteRequestId={quoteRequestId}
        state={bolState}
        nextLeadId={nextLeadId}
      />
      <SentDocumentsSection documents={sentDocuments} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sent documents section
// ---------------------------------------------------------------------------

function SentDocumentsSection({
  documents,
}: {
  documents: SentDocumentRow[];
}) {
  return (
    <section
      aria-label="Sent documents"
      className="rounded-md border border-line bg-card"
    >
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-2 sm:px-5">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-fg">
          Sent documents
        </h2>
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-fg/60">
          {documents.length} {documents.length === 1 ? "doc" : "docs"}
        </span>
      </div>

      {documents.length === 0 ? (
        <p className="px-4 pb-5 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-fg/60 sm:px-5">
          No documents sent yet
        </p>
      ) : (
        <ul className="border-t border-line/80">
          {documents.map((doc, idx) => (
            <SentDocumentRowItem
              key={`${doc.type}-${doc.id}`}
              doc={doc}
              isLast={idx === documents.length - 1}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SentDocumentRowItem({
  doc,
  isLast,
}: {
  doc: SentDocumentRow;
  isLast: boolean;
}) {
  const timeStr = quoteClock(doc.sentAt);
  const dateStr = quoteDate(doc.sentAt);
  const agoStr = quoteAgo(doc.sentAt);
  const resendAction =
    doc.type === "estimate"
      ? resendEstimate.bind(null, doc.id)
      : doc.type === "finalized_quote"
        ? resendFinalizedQuote.bind(null, doc.id)
        : resendBol.bind(null, doc.id);

  return (
    <li
      className={
        "grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-center sm:px-5 " +
        (doc.highlight ? "bg-amber-50 " : "") +
        (isLast ? "" : "border-b border-line/80")
      }
    >
      {/* Date · time · days-ago — same format as the Activity tab. */}
      <div className="font-mono text-[11px] tabular-nums leading-snug text-fg-subtle">
        <span>{dateStr}</span>
        <span aria-hidden className="px-1 text-fg-subtle/60">
          ·
        </span>
        <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-fg">
          {timeStr}
        </span>
        <span aria-hidden className="px-1 text-fg-subtle/60">
          ·
        </span>
        <span>{agoStr}</span>
      </div>

      {/* Label + amount + recipient */}
      <div className="min-w-0">
        <p className="truncate text-[14px] font-bold text-fg">
          {doc.label}
          {doc.amount ? (
            <span className="ml-1.5 font-mono font-bold text-green-700">
              — {doc.amount}
            </span>
          ) : null}
          {doc.highlight ? (
            <span className="ml-2 rounded bg-amber-500 px-1.5 py-[1px] align-middle font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-white">
              Latest
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-fg-subtle">
          {doc.recipient}
        </p>
      </div>

      {/* Action — single View button; download / resend / recipient email
          live inside its popup. */}
      <div className="flex items-center justify-end sm:justify-start">
        <DocumentViewButton doc={doc} resendAction={resendAction} />
      </div>
    </li>
  );
}


