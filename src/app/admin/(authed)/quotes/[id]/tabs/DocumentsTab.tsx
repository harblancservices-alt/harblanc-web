import { BolWorkspace, type BolState } from "../BolWorkspace";
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
      className="border-2 border-black border-l-4 border-l-black bg-[#fafaf6]"
    >
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-2 sm:px-5">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-black">
          Sent documents
        </h2>
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-black/60">
          {documents.length} {documents.length === 1 ? "doc" : "docs"}
        </span>
      </div>

      {documents.length === 0 ? (
        <p className="px-4 pb-5 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-black/60 sm:px-5">
          No documents sent yet
        </p>
      ) : (
        <ul className="border-t border-black/15">
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
  const ts = formatDocTimestamp(doc.sentAt);
  const typeBadge =
    doc.type === "estimate"
      ? "RANGE"
      : doc.type === "finalized_quote"
        ? "FQ"
        : "BOL";

  return (
    <li
      className={
        "grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-center sm:px-5 " +
        (isLast ? "" : "border-b border-black/15")
      }
    >
      {/* Timestamp + type badge stack */}
      <div className="flex items-center gap-3 sm:block">
        <span className="font-mono text-[12px] font-bold uppercase tabular-nums tracking-[0.12em] text-black">
          {ts}
        </span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-black sm:mt-1 sm:block">
          {typeBadge}
        </span>
      </div>

      {/* Label + recipient */}
      <div className="min-w-0">
        <p className="truncate text-[14px] font-bold text-black">
          {doc.label}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-black">
          {doc.recipient}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:flex-nowrap sm:gap-x-4">
        {doc.pdfHref ? (
          <>
            <a
              href={doc.pdfHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center border-2 border-black bg-white px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-black transition-colors hover:bg-black hover:text-white"
              aria-label={`View ${doc.label}`}
            >
              View
            </a>
            <a
              href={doc.pdfHref}
              download
              className="inline-flex items-center border-2 border-black bg-white px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-black transition-colors hover:bg-black hover:text-white"
              aria-label={`Download ${doc.label}`}
            >
              Download
            </a>
          </>
        ) : (
          <span
            className="inline-flex items-center border border-black/30 bg-white px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-black/40"
            title="No PDF available for this document"
          >
            Email
          </span>
        )}
        <ResendForm doc={doc} />
      </div>
    </li>
  );
}

/**
 * Tiny server-action form per row. Submits empty FormData so the
 * resend action falls back to the original preview_to recipient.
 *
 * Server actions can be bound with .bind(null, id); Next.js handles
 * the form-action wiring. No client-side JS required here, which keeps
 * this rendering path a pure server component.
 */
function ResendForm({ doc }: { doc: SentDocumentRow }) {
  const action =
    doc.type === "estimate"
      ? resendEstimate.bind(null, doc.id)
      : doc.type === "finalized_quote"
        ? resendFinalizedQuote.bind(null, doc.id)
        : resendBol.bind(null, doc.id);

  return (
    <form action={action}>
      <button
        type="submit"
        className="inline-flex items-center border-2 border-black bg-white px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-black transition-colors hover:bg-black hover:text-white"
        aria-label={`Resend ${doc.label}`}
      >
        Resend
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compact timestamp like:
 *   today:        "11:14"
 *   this year:    "Jun 5 10:23"
 *   prior years:  "2025-12-31 14:00"
 */
function formatDocTimestamp(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const sameYear = d.getFullYear() === now.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  if (sameYear) {
    const month = d.toLocaleString("en-US", { month: "short" });
    return `${month} ${d.getDate()} ${hh}:${mm}`;
  }
  const yyyy = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mo}-${da} ${hh}:${mm}`;
}
