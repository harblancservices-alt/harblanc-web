"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHead, BTN_ACTION, BTN_EDIT, ZEBRA_ROWS } from "../../_shell/ui";
import { FormError } from "../../_shell/form";
import { formatDateTime, formatMoney, titleCaseWords } from "../../_shell/format";
import { IconRateConfirmation, IconBillOfLading } from "../../_shell/icons";
import { docStatusLabel, docStatusTone } from "../docStatusMeta";
import { openStoredPdf } from "../pdfClient";
import { createRateConfirmationFromShipment } from "../rate-confirmation-actions";
import { createBolFromShipment } from "../bol-actions";
import type { ShipmentDocumentSummary } from "../types";

/**
 * Every Rate Confirmation + Bill of Lading ever generated for this shipment
 * (via listShipmentDocuments), newest first — the shipment's document
 * history, distinct from the "Create Rate Confirmation"/"Create BOL" buttons
 * in the workspace header above (which start a brand new document; these
 * duplicate buttons do the same thing from the history list itself, per the
 * build brief). Each row opens its editor or reprints its stored PDF —
 * reprinting never regenerates, it just reopens whatever was last saved to
 * Storage (see pdfClient.ts::openStoredPdf).
 */
export function DocumentsSection({
  shipmentId,
  documents,
}: {
  shipmentId: string;
  documents: ShipmentDocumentSummary[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState<"rc" | "bol" | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  function onCreateRc() {
    setError(null);
    setCreating("rc");
    startTransition(async () => {
      const result = await createRateConfirmationFromShipment(shipmentId);
      setCreating(null);
      if (result.ok) router.push(`/crm/shipments/${shipmentId}/rc/${result.id}`);
      else setError(result.error);
    });
  }

  function onCreateBol() {
    setError(null);
    setCreating("bol");
    startTransition(async () => {
      const result = await createBolFromShipment(shipmentId);
      setCreating(null);
      if (result.ok) router.push(`/crm/shipments/${shipmentId}/bol/${result.id}`);
      else setError(result.error);
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

  return (
    <Card>
      <CardHead
        title="Documents"
        hint={documents.length ? `${documents.length} on file` : undefined}
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCreateRc}
              disabled={pending}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${BTN_ACTION}`}
            >
              <IconRateConfirmation width={14} height={14} />
              {creating === "rc" ? "Creating…" : "New RC"}
            </button>
            <button
              type="button"
              onClick={onCreateBol}
              disabled={pending}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${BTN_ACTION}`}
            >
              <IconBillOfLading width={14} height={14} />
              {creating === "bol" ? "Creating…" : "New BOL"}
            </button>
          </div>
        }
      />

      {error && (
        <div className="border-b border-line-strong px-5 py-2.5">
          <FormError message={error} />
        </div>
      )}

      {documents.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-fg-muted">
          No documents yet. Generate a Rate Confirmation or Bill of Lading above.
        </p>
      ) : (
        <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
          {documents.map((doc) => {
            const editorHref =
              doc.docType === "rate_confirmation"
                ? `/crm/shipments/${shipmentId}/rc/${doc.id}`
                : `/crm/shipments/${shipmentId}/bol/${doc.id}`;
            return (
              <li key={`${doc.docType}-${doc.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                    {doc.docType === "rate_confirmation" ? (
                      <IconRateConfirmation width={16} height={16} />
                    ) : (
                      <IconBillOfLading width={16} height={16} />
                    )}
                  </span>
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
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link href={editorHref} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}>
                    Open
                  </Link>
                  {doc.pdfStoragePath && (
                    <button
                      type="button"
                      onClick={() => download(doc)}
                      disabled={downloadingId === doc.id}
                      className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${BTN_EDIT}`}
                    >
                      {downloadingId === doc.id ? "…" : "Download"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
