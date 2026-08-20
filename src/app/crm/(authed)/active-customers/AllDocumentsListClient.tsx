"use client";

import { useMemo, useState } from "react";
import { Card, CardHead, EmptyState } from "../_shell/ui";
import { CONTROL } from "../_shell/form";
import { IconSearch, IconRateConfirmation } from "../_shell/icons";
import { openStoredPdf } from "../shipments/pdfClient";
import { softDeleteRateConfirmation } from "../shipments/rate-confirmation-actions";
import { softDeleteBol } from "../shipments/bol-actions";
import type { AllDocumentSummary } from "../shipments/types";
import { DocumentTable } from "./DocumentTable";
import { DocumentCard } from "./DocumentCard";

function matches(doc: AllDocumentSummary, q: string): boolean {
  const haystack = [
    doc.number,
    doc.customerName,
    doc.shipmentNumber,
    doc.carrierName,
    doc.shipperName,
    doc.shipperCity,
    doc.shipperState,
    doc.consigneeName,
    doc.consigneeCity,
    doc.consigneeState,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * The org-wide RC/BOL library — every Rate Confirmation + Bill of Lading
 * ever generated or drafted, across every shipment (listAllDocuments),
 * newest first. Same "load once, filter client-side" contract as
 * ShipmentsListClient — the org's full document set is small enough that a
 * second server round trip per keystroke isn't worth it. Mobile renders
 * DocumentCard's grid, desktop (md+) renders DocumentTable — same split as
 * ShipmentsListClient. Each row opens the document's editor (same
 * shipment-scoped route the Shipments tab already uses) or re-downloads its
 * last generated PDF via the same signed-URL pattern DocumentsSection uses
 * on the shipment workspace.
 */
export function AllDocumentsListClient({ documents }: { documents: AllDocumentSummary[] }) {
  const [docs, setDocs] = useState(documents);
  const [q, setQ] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) return docs;
    return docs.filter((d) => matches(d, trimmed));
  }, [docs, q]);

  async function download(doc: AllDocumentSummary) {
    if (!doc.pdfStoragePath) return;
    setError(null);
    setDownloadingId(doc.id);
    const ok = await openStoredPdf(doc.pdfStoragePath, `${doc.number} v${doc.version}.pdf`);
    setDownloadingId(null);
    if (!ok) setError("Could not open this PDF. Please try again.");
  }

  async function remove(doc: AllDocumentSummary) {
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
    <div className="space-y-4">
      <Card className="p-3">
        <label className="relative flex items-center">
          <IconSearch width={16} height={16} className="pointer-events-none absolute left-3 text-fg-subtle" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search RC/BOL #, customer, carrier, shipper, consignee, job #…"
            className={`h-10 w-full pl-9 ${CONTROL}`}
          />
        </label>
      </Card>

      {error && (
        <Card className="border-bad/30 bg-bad-bg px-4 py-2.5 text-[13px] text-bad">{error}</Card>
      )}

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconRateConfirmation />}
            title={docs.length === 0 ? "No documents yet" : "No documents match"}
            body={
              docs.length === 0
                ? "Rate confirmations and BOLs generated from any shipment will show up here."
                : "Try a different search."
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 [grid-auto-rows:1fr] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:hidden">
            {filtered.map((doc) => (
              <DocumentCard
                key={`${doc.docType}-${doc.id}`}
                doc={doc}
                downloading={downloadingId === doc.id}
                deleting={deletingId === doc.id}
                onDownload={download}
                onDelete={remove}
              />
            ))}
          </div>

          <Card className="hidden md:block">
            <CardHead
              title="BOL / RC Library"
              hint={`${filtered.length} ${filtered.length === 1 ? "document" : "documents"} · every Rate Confirmation and Bill of Lading generated from any shipment, org-wide`}
            />
            <div className="overflow-x-auto">
              <DocumentTable
                documents={filtered}
                downloadingId={downloadingId}
                deletingId={deletingId}
                onDownload={download}
                onDelete={remove}
              />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
