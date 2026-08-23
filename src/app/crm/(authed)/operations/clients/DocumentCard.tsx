"use client";

import Link from "next/link";
import { BTN_EDIT, BTN_DANGER } from "../../_shell/ui";
import { IconRateConfirmation, IconBillOfLading } from "../../_shell/icons";
import { titleCaseWords, formatDate } from "../../_shell/format";
import { docStatusLabel, docStatusTone } from "../../shipments/docStatusMeta";
import type { AllDocumentSummary } from "../../shipments/types";
import { lane, editorHref } from "./DocumentTable";

/** One document card in the mobile grid — compact card mirroring
 * ShipmentCard's shape, with an actions row (Open/Download/Delete) since
 * library rows carry those affordances a plain navigate-on-tap card doesn't. */
export function DocumentCard({
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
    <div className="flex h-full flex-col justify-between gap-2 rounded-lg border border-line-strong bg-card p-3 shadow-e1">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-accent">
              {doc.docType === "rate_confirmation" ? (
                <IconRateConfirmation width={14} height={14} />
              ) : (
                <IconBillOfLading width={14} height={14} />
              )}
            </span>
            <span className="shrink-0 rounded-full bg-inset px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
              {doc.docType === "rate_confirmation" ? "RC" : "BOL"}
            </span>
            <p className="min-w-0 truncate text-[13.5px] font-bold text-fg">{doc.number}</p>
          </div>
          <span
            className={`shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${docStatusTone(doc.status)}`}
          >
            {docStatusLabel(doc.status)}
          </span>
        </div>

        <p className="truncate text-[12.5px] font-semibold text-fg">
          {doc.customerName ? titleCaseWords(doc.customerName) : "No customer"}
        </p>
        <p className="text-[12px] text-fg-muted">{lane(doc)}</p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-subtle">
          <span>{doc.carrierName ? titleCaseWords(doc.carrierName) : "No carrier"}</span>
          {doc.shipmentNumber && <span>{doc.shipmentNumber}</span>}
          <span>{formatDate(doc.createdAt)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link href={editorHref(doc)} className={`flex-1 rounded-md py-1.5 text-center text-[12px] font-semibold transition-colors ${BTN_EDIT}`}>
          Open
        </Link>
        {doc.pdfStoragePath && (
          <button
            type="button"
            onClick={() => onDownload(doc)}
            disabled={downloading}
            className={`flex-1 rounded-md py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${BTN_EDIT}`}
          >
            {downloading ? "…" : "Download"}
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(doc)}
          disabled={deleting}
          className={`min-h-[36px] flex-1 rounded-md py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${BTN_DANGER}`}
        >
          {deleting ? "…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
