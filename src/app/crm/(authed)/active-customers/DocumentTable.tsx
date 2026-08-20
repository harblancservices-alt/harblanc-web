"use client";

import Link from "next/link";
import { ClickableRow } from "../_shell/ClickableRow";
import { LIST_HEAD_ROW, ZEBRA_ROWS, Badge, BTN_EDIT, BTN_DANGER } from "../_shell/ui";
import { IconRateConfirmation, IconBillOfLading } from "../_shell/icons";
import { titleCaseWords, upperCaseState, formatDate } from "../_shell/format";
import { docStatusLabel, docStatusBadgeTone } from "../shipments/docStatusMeta";
import type { AllDocumentSummary } from "../shipments/types";

export function lane(doc: AllDocumentSummary): string {
  const from =
    [titleCaseWords(doc.shipperCity), upperCaseState(doc.shipperState)].filter(Boolean).join(", ") ||
    (doc.shipperName ? titleCaseWords(doc.shipperName) : "");
  const to =
    [titleCaseWords(doc.consigneeCity), upperCaseState(doc.consigneeState)].filter(Boolean).join(", ") ||
    (doc.consigneeName ? titleCaseWords(doc.consigneeName) : "");
  if (from && to) return `${from} → ${to}`;
  return from || to || "—";
}

export function editorHref(doc: AllDocumentSummary): string {
  return doc.docType === "rate_confirmation"
    ? `/crm/shipments/${doc.shipmentId}/rc/${doc.id}`
    : `/crm/shipments/${doc.shipmentId}/bol/${doc.id}`;
}

/**
 * Desktop (lg+) table rendering of the org-wide RC/BOL library.
 *
 * 2026-08-20: rebuilt from the Excel/spreadsheet-style ruled grid
 * (GRID_TABLE/GRID_HEAD_CELL/GRID_CELL — a border on every cell) to the same
 * clean, borderless zebra-striped table every other CRM list now uses,
 * matching crm-design exactly. Status renders through the shared Badge
 * component (rounded-full pill) instead of a hand-rolled rounded-md chip.
 * A trailing actions cell (Open/Download/Delete) stays — real, working
 * functionality a plain navigate-on-click row doesn't have.
 */
export function DocumentTable({
  documents,
  downloadingId,
  deletingId,
  onDownload,
  onDelete,
}: {
  documents: AllDocumentSummary[];
  downloadingId: string | null;
  deletingId: string | null;
  onDownload: (doc: AllDocumentSummary) => void;
  onDelete: (doc: AllDocumentSummary) => void;
}) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className={LIST_HEAD_ROW}>
          <th className="px-4 py-2.5 text-left">Doc #</th>
          <th className="px-4 py-2.5 text-left">Status</th>
          <th className="px-4 py-2.5 text-left">Customer</th>
          <th className="px-4 py-2.5 text-left">Carrier</th>
          <th className="px-4 py-2.5 text-left">Lane</th>
          <th className="px-4 py-2.5 text-left">Job #</th>
          <th className="px-4 py-2.5 text-left">Date</th>
          <th className="px-4 py-2.5 text-right">Actions</th>
        </tr>
      </thead>
      <tbody className={ZEBRA_ROWS}>
        {documents.map((doc) => (
          <DocumentTableRow
            key={`${doc.docType}-${doc.id}`}
            doc={doc}
            downloading={downloadingId === doc.id}
            deleting={deletingId === doc.id}
            onDownload={onDownload}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </table>
  );
}

function DocumentTableRow({
  doc,
  downloading,
  deleting,
  onDownload,
  onDelete,
}: {
  doc: AllDocumentSummary;
  downloading: boolean;
  deleting: boolean;
  onDownload: (doc: AllDocumentSummary) => void;
  onDelete: (doc: AllDocumentSummary) => void;
}) {
  return (
    <ClickableRow href={editorHref(doc)}>
      <td className="px-4 py-3 truncate">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-accent">
            {doc.docType === "rate_confirmation" ? (
              <IconRateConfirmation width={13} height={13} />
            ) : (
              <IconBillOfLading width={13} height={13} />
            )}
          </span>
          <span className="shrink-0 rounded-full bg-inset px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
            {doc.docType === "rate_confirmation" ? "RC" : "BOL"}
          </span>
          <span className="truncate font-semibold text-fg">{doc.number}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge tone={docStatusBadgeTone(doc.status)}>{docStatusLabel(doc.status)}</Badge>
      </td>
      <td className="px-4 py-3 truncate text-fg-muted">
        {doc.customerName ? titleCaseWords(doc.customerName) : "—"}
      </td>
      <td className="px-4 py-3 truncate text-fg-muted">
        {doc.carrierName ? titleCaseWords(doc.carrierName) : "—"}
      </td>
      <td className="px-4 py-3 truncate text-fg-muted">{lane(doc)}</td>
      <td className="px-4 py-3 truncate text-fg-muted">{doc.shipmentNumber ?? "—"}</td>
      <td className="px-4 py-3 truncate text-fg-muted">{formatDate(doc.createdAt)}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <Link href={editorHref(doc)} className={`rounded-md px-2 py-1 text-[11.5px] font-semibold transition-colors ${BTN_EDIT}`}>
            Open
          </Link>
          {doc.pdfStoragePath && (
            <button
              type="button"
              onClick={() => onDownload(doc)}
              disabled={downloading}
              className={`rounded-md px-2 py-1 text-[11.5px] font-semibold transition-colors disabled:opacity-60 ${BTN_EDIT}`}
            >
              {downloading ? "…" : "PDF"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(doc)}
            disabled={deleting}
            className={`rounded-md px-2 py-1 text-[11.5px] font-semibold transition-colors disabled:opacity-60 ${BTN_DANGER}`}
          >
            {deleting ? "…" : "Delete"}
          </button>
        </div>
      </td>
    </ClickableRow>
  );
}
