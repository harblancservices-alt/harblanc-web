"use client";

import { useState, useTransition } from "react";
import { Card, CardHead, BTN_ACTION, BTN_EDIT, BTN_SUCCESS, BTN_DANGER, ZEBRA_ROWS } from "../../_shell/ui";
import { FormError } from "../../_shell/form";
import { formatDateTime, formatMoney, titleCaseWords } from "../../_shell/format";
import { IconRateConfirmation, IconBillOfLading } from "../../_shell/icons";
import { docStatusLabel, docStatusTone } from "../docStatusMeta";
import { getSignedPdfUrl, openStoredPdf } from "../pdfClient";
import { DocViewer } from "@/components/ui/DocViewer";
import { createRateConfirmationFromShipment, softDeleteRateConfirmation } from "../rate-confirmation-actions";
import { createBolFromShipment, softDeleteBol } from "../bol-actions";
import { listShipmentDocuments } from "../document-history-actions";
import { DocumentEditorModal, type DocModalTarget } from "./DocumentEditorModal";
import type { CrmShipmentDetail, ShipmentDocumentSummary } from "../types";

/**
 * Every Rate Confirmation + Bill of Lading ever generated for this shipment
 * (via listShipmentDocuments), split into two columns — RC left, BOL right
 * (2026-08-09 relayout; mobile stacks to one column) — each with its own
 * "New RC"/"New BOL" button. Opening a doc (new or existing) renders its
 * editor in DocumentEditorModal over this page instead of navigating to the
 * old /rc/[rcId]//bol/[bolId] routes, so there's no more back-button trip
 * through browser history. The doc list itself only refreshes when the
 * modal closes (lifecycle actions taken inside the modal — generate/send/
 * status changes — don't need to reflect here live while it's open).
 */
export function DocumentsSection({
  shipment,
  documents,
}: {
  shipment: CrmShipmentDetail;
  documents: ShipmentDocumentSummary[];
}) {
  const [docs, setDocs] = useState(documents);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState<"rc" | "bol" | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ShipmentDocumentSummary | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [target, setTarget] = useState<DocModalTarget | null>(null);

  const rcDocs = docs.filter((d) => d.docType === "rate_confirmation");
  const bolDocs = docs.filter((d) => d.docType === "bill_of_lading");

  async function refreshDocs() {
    const fresh = await listShipmentDocuments(shipment.id);
    setDocs(fresh);
  }

  function closeModal() {
    setTarget(null);
    void refreshDocs();
  }

  function onCreateRc() {
    setError(null);
    setCreating("rc");
    startTransition(async () => {
      const result = await createRateConfirmationFromShipment(shipment.id);
      setCreating(null);
      if (result.ok) {
        setTarget({ type: "rc", id: result.id });
        void refreshDocs();
      } else setError(result.error);
    });
  }

  function onCreateBol() {
    setError(null);
    setCreating("bol");
    startTransition(async () => {
      const result = await createBolFromShipment(shipment.id);
      setCreating(null);
      if (result.ok) {
        setTarget({ type: "bol", id: result.id });
        void refreshDocs();
      } else setError(result.error);
    });
  }

  async function download(doc: ShipmentDocumentSummary) {
    if (!doc.pdfStoragePath) return;
    setError(null);
    setDownloadingId(doc.id);
    const ok = await openStoredPdf(doc.pdfStoragePath, `${doc.number} v${doc.version}.pdf`);
    setDownloadingId(null);
    if (!ok) setError("Could not open this PDF. Please try again.");
  }

  /** Opens the same full-screen DocViewer the RC/BOL editors use, instead of
   * `window.open()`-ing a signed URL after an await — browsers (Safari in
   * particular) silently block a popup opened asynchronously like that, so
   * the button just did nothing with no error surfaced. */
  async function view(doc: ShipmentDocumentSummary) {
    if (!doc.pdfStoragePath) return;
    setError(null);
    setPreviewDoc(doc);
    setPreviewUrl(null);
    const url = await getSignedPdfUrl(doc.pdfStoragePath);
    setPreviewUrl(url);
    if (!url) setError("Could not open this PDF. Please try again.");
  }

  async function remove(doc: ShipmentDocumentSummary) {
    const label = doc.docType === "rate_confirmation" ? "Rate Confirmation" : "Bill of Lading";
    if (!window.confirm(`Delete this ${label}?`)) return;
    setError(null);
    setDeletingId(doc.id);
    const result =
      doc.docType === "rate_confirmation"
        ? await softDeleteRateConfirmation(doc.id)
        : await softDeleteBol(doc.id);
    setDeletingId(null);
    if (result.ok) setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    else setError(result.error);
  }

  return (
    <>
      {error && (
        <Card className="p-0">
          <div className="px-5 py-2.5">
            <FormError message={error} />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DocColumn
          title="Rate Confirmations"
          icon={<IconRateConfirmation width={14} height={14} />}
          docs={rcDocs}
          newLabel={creating === "rc" ? "Creating…" : "New RC"}
          onNew={onCreateRc}
          newDisabled={pending}
          onOpen={(doc) => setTarget({ type: "rc", id: doc.id })}
          onView={view}
          onDownload={download}
          onRemove={remove}
          previewingId={previewDoc && !previewUrl ? previewDoc.id : null}
          downloadingId={downloadingId}
          deletingId={deletingId}
          emptyLabel="No rate confirmations yet."
        />
        <DocColumn
          title="Bills of Lading"
          icon={<IconBillOfLading width={14} height={14} />}
          docs={bolDocs}
          newLabel={creating === "bol" ? "Creating…" : "New BOL"}
          onNew={onCreateBol}
          newDisabled={pending}
          onOpen={(doc) => setTarget({ type: "bol", id: doc.id })}
          onView={view}
          onDownload={download}
          onRemove={remove}
          previewingId={previewDoc && !previewUrl ? previewDoc.id : null}
          downloadingId={downloadingId}
          deletingId={deletingId}
          emptyLabel="No bills of lading yet."
        />
      </div>

      {target && (
        <DocumentEditorModal shipment={shipment} target={target} onClose={closeModal} onNavigate={setTarget} />
      )}

      {previewDoc && (
        <DocViewer
          doc={{ name: `${previewDoc.number} v${previewDoc.version}.pdf`, url: previewUrl, isImage: false }}
          onClose={() => {
            setPreviewDoc(null);
            setPreviewUrl(null);
          }}
        />
      )}
    </>
  );
}

function DocColumn({
  title,
  icon,
  docs,
  newLabel,
  onNew,
  newDisabled,
  onOpen,
  onView,
  onDownload,
  onRemove,
  previewingId,
  downloadingId,
  deletingId,
  emptyLabel,
}: {
  title: string;
  icon: React.ReactNode;
  docs: ShipmentDocumentSummary[];
  newLabel: string;
  onNew: () => void;
  newDisabled: boolean;
  onOpen: (doc: ShipmentDocumentSummary) => void;
  onView: (doc: ShipmentDocumentSummary) => void;
  onDownload: (doc: ShipmentDocumentSummary) => void;
  onRemove: (doc: ShipmentDocumentSummary) => void;
  previewingId: string | null;
  downloadingId: string | null;
  deletingId: string | null;
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHead
        title={title}
        hint={docs.length ? `${docs.length} on file` : undefined}
        right={
          <button
            type="button"
            onClick={onNew}
            disabled={newDisabled}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${BTN_ACTION}`}
          >
            {icon}
            {newLabel}
          </button>
        }
      />

      {docs.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-fg-muted">{emptyLabel}</p>
      ) : (
        <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
          {docs.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[13.5px] font-semibold text-fg">{doc.number}</p>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${docStatusTone(doc.status)}`}>
                    {docStatusLabel(doc.status)}
                  </span>
                  <span className="text-[11px] text-fg-subtle">v{doc.version}</span>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-fg-subtle">
                  {[
                    doc.carrierName ? titleCaseWords(doc.carrierName) : null,
                    doc.totalCarrierPay !== null ? formatMoney(doc.totalCarrierPay) : null,
                    formatDateTime(doc.createdAt),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpen(doc)}
                  className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
                >
                  Open
                </button>
                {doc.pdfStoragePath && (
                  <button
                    type="button"
                    onClick={() => onView(doc)}
                    disabled={previewingId === doc.id}
                    className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${BTN_SUCCESS}`}
                  >
                    {previewingId === doc.id ? "…" : "View"}
                  </button>
                )}
                {doc.pdfStoragePath && (
                  <button
                    type="button"
                    onClick={() => onDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${BTN_EDIT}`}
                  >
                    {downloadingId === doc.id ? "…" : "Download"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(doc)}
                  disabled={deletingId === doc.id}
                  className={`min-h-[44px] rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 sm:min-h-0 ${BTN_DANGER}`}
                >
                  {deletingId === doc.id ? "…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
