"use client";

import Link from "next/link";
import { ClickableRow } from "../_shell/ClickableRow";
import { LIST_HEAD_ROW, ZEBRA_ROWS, GRID_TABLE, GRID_HEAD_CELL, GRID_CELL, BTN_EDIT, BTN_DANGER } from "../_shell/ui";
import { IconRateConfirmation, IconBillOfLading } from "../_shell/icons";
import { titleCaseWords, upperCaseState, formatDate } from "../_shell/format";
import { docStatusLabel, docStatusTone } from "../shipments/docStatusMeta";
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

/** Desktop (md+) table rendering of the org-wide RC/BOL library — same
 * GRID_TABLE/ClickableRow treatment as ShipmentTable, with a trailing
 * actions cell (Open/Download/Delete) since library rows need those extra
 * affordances a plain navigate-on-click row doesn't. */
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
    <table className={GRID_TABLE}>
      <colgroup>
        <col className="w-[13%]" />
        <col className="w-[9%]" />
        <col className="w-[15%]" />
        <col className="w-[13%]" />
        <col className="w-[19%]" />
        <col className="w-[9%]" />
        <col className="w-[8%]" />
        <col className="w-[14%]" />
      </colgroup>
      <thead>
        <tr className={LIST_HEAD_ROW}>
          <th className={GRID_HEAD_CELL}>Doc #</th>
          <th className={GRID_HEAD_CELL}>Status</th>
          <th className={GRID_HEAD_CELL}>Customer</th>
          <th className={GRID_HEAD_CELL}>Carrier</th>
          <th className={GRID_HEAD_CELL}>Lane</th>
          <th className={GRID_HEAD_CELL}>Job #</th>
          <th className={GRID_HEAD_CELL}>Date</th>
          <th className={`${GRID_HEAD_CELL} text-right`}>Actions</th>
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
      <td className={`${GRID_CELL} truncate`}>
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
      <td className={GRID_CELL}>
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${docStatusTone(doc.status)}`}
        >
          {docStatusLabel(doc.status)}
        </span>
      </td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>
        {doc.customerName ? titleCaseWords(doc.customerName) : "—"}
      </td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>
        {doc.carrierName ? titleCaseWords(doc.carrierName) : "—"}
      </td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>{lane(doc)}</td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>{doc.shipmentNumber ?? "—"}</td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>{formatDate(doc.createdAt)}</td>
      <td className={`${GRID_CELL} text-right`}>
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
