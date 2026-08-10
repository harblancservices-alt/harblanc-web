"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHead, EmptyState, ZEBRA_ROWS, BTN_EDIT, BTN_DANGER } from "../_shell/ui";
import { CONTROL } from "../_shell/form";
import { IconSearch, IconRateConfirmation, IconBillOfLading } from "../_shell/icons";
import { formatDateTime, titleCaseWords } from "../_shell/format";
import { docStatusLabel, docStatusTone } from "../shipments/docStatusMeta";
import { openStoredPdf } from "../shipments/pdfClient";
import { softDeleteRateConfirmation } from "../shipments/rate-confirmation-actions";
import { softDeleteBol } from "../shipments/bol-actions";
import type { AllDocumentSummary } from "../shipments/types";

function matches(doc: AllDocumentSummary, q: string): boolean {
  const haystack = [doc.number, doc.customerName, doc.shipmentNumber, doc.carrierName]
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
 * second server round trip per keystroke isn't worth it. Each row opens the
 * document's editor (same shipment-scoped route the Shipments tab already
 * uses) or re-downloads its last generated PDF via the same signed-URL
 * pattern DocumentsSection uses on the shipment workspace.
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
            placeholder="Search RC/BOL #, customer, shipment, carrier…"
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
        <Card>
          <CardHead
            title="BOL / RC Library"
            hint={`${filtered.length} ${filtered.length === 1 ? "document" : "documents"}`}
          />
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {filtered.map((doc) => {
              const editorHref =
                doc.docType === "rate_confirmation"
                  ? `/crm/shipments/${doc.shipmentId}/rc/${doc.id}`
                  : `/crm/shipments/${doc.shipmentId}/bol/${doc.id}`;
              return (
                <li
                  key={`${doc.docType}-${doc.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                >
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
                        <span className="rounded-full bg-inset px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                          {doc.docType === "rate_confirmation" ? "RC" : "BOL"}
                        </span>
                        <p className="truncate text-[13.5px] font-semibold text-fg">{doc.number}</p>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${docStatusTone(doc.status)}`}>
                          {docStatusLabel(doc.status)}
                        </span>
                        <span className="text-[11px] text-fg-subtle">v{doc.version}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-fg-subtle">
                        {[
                          doc.customerName,
                          doc.shipmentNumber,
                          doc.carrierName ? titleCaseWords(doc.carrierName) : null,
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
                    <button
                      type="button"
                      onClick={() => remove(doc)}
                      disabled={deletingId === doc.id}
                      className={`min-h-[44px] rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 sm:min-h-0 ${BTN_DANGER}`}
                    >
                      {deletingId === doc.id ? "…" : "Delete"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
