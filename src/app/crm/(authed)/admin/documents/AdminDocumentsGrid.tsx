"use client";

import { useMemo, useState } from "react";
import { Card, CardHead, EmptyState, BTN_PRIMARY, BTN_NEUTRAL } from "../../_shell/ui";
import { CONTROL } from "../../_shell/form";
import { titleCaseWords, formatDate } from "../../_shell/format";
import { IconSearch, IconRateConfirmation, IconBillOfLading } from "../../_shell/icons";
import { docStatusLabel, docStatusTone } from "../../shipments/docStatusMeta";
import { getSignedPdfUrl } from "../../shipments/pdfClient";
import { DocViewer, type ViewerDoc } from "@/components/ui/DocViewer";
import type { AdminDocumentCard, AdminDocumentType } from "../types";

const TYPE_TABS: { key: AdminDocumentType | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "rate_confirmation", label: "RateCon" },
  { key: "bill_of_lading", label: "BOL" },
  { key: "pod", label: "POD" },
];

function typeLabel(t: AdminDocumentType): string {
  return t === "rate_confirmation" ? "RateCon" : t === "bill_of_lading" ? "BOL" : "POD";
}

function typeIcon(t: AdminDocumentType) {
  return t === "bill_of_lading" ? <IconBillOfLading width={13} height={13} /> : <IconRateConfirmation width={13} height={13} />;
}

function initials(name: string | null): string {
  const source = (name || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  return source.charAt(0).toUpperCase();
}

/** Fetches the doc's real bytes and triggers a same-origin blob download —
 * same mechanism DocViewer's own download() uses, chosen deliberately over
 * window.open()/a signed-URL navigation so triggering many of these in a
 * tight loop ("Export all"/"Export to PC" below) never trips a popup
 * blocker (a blob download isn't a new window/tab at all). */
async function downloadBlob(url: string, filename: string): Promise<boolean> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("fetch");
    const blob = await resp.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Operational Documents grid — preview cards (thumbnail rendered server-side
 * in ../documents-data.ts, same convention as OrgDocumentsSection's old
 * Settings cards) with type/owner/company filters + search, and two bulk-
 * download actions: "Export all" downloads every document in the library
 * regardless of the current filters, "Export to PC" downloads exactly the
 * filtered/visible set — two useful, distinct behaviors sharing one
 * mechanism (downloadBlob above) rather than two buttons that do the exact
 * same thing under different names.
 */
export function AdminDocumentsGrid({ documents }: { documents: AdminDocumentCard[] }) {
  const [type, setType] = useState<AdminDocumentType | "all">("all");
  const [owner, setOwner] = useState("");
  const [company, setCompany] = useState("");
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<AdminDocumentCard | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"all" | "filtered" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const owners = useMemo(() => {
    const names = new Set<string>();
    for (const d of documents) if (d.uploadedByName) names.add(d.uploadedByName);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [documents]);

  const companies = useMemo(() => {
    const names = new Set<string>();
    for (const d of documents) if (d.companyName) names.add(d.companyName);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [documents]);

  const filtered = useMemo(() => {
    const trimmed = q.trim().toLowerCase();
    return documents.filter((d) => {
      if (type !== "all" && d.docType !== type) return false;
      if (owner && d.uploadedByName !== owner) return false;
      if (company && d.companyName !== company) return false;
      if (!trimmed) return true;
      const haystack = [d.number, d.companyName, d.shipmentNumber, d.uploadedByName].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [documents, type, owner, company, q]);

  async function openPreview(doc: AdminDocumentCard) {
    if (!doc.pdfStoragePath) return;
    setError(null);
    setPreview(doc);
    setPreviewUrl(null);
    const url = await getSignedPdfUrl(doc.pdfStoragePath);
    setPreviewUrl(url);
    if (!url) setError("Could not open this document. Please try again.");
  }

  async function exportDocs(scope: "all" | "filtered") {
    const set = (scope === "all" ? documents : filtered).filter((d) => d.pdfStoragePath);
    if (set.length === 0) return;
    setError(null);
    setExporting(scope);
    const urls = await Promise.all(set.map((d) => getSignedPdfUrl(d.pdfStoragePath as string, `${d.number}.pdf`)));
    let failed = 0;
    for (let i = 0; i < set.length; i++) {
      const url = urls[i];
      if (!url) {
        failed++;
        continue;
      }
      const ok = await downloadBlob(url, `${set[i].number}.pdf`);
      if (!ok) failed++;
    }
    setExporting(null);
    if (failed) setError(`${failed} of ${set.length} document${set.length === 1 ? "" : "s"} failed to export.`);
  }

  const previewDoc: ViewerDoc | null = preview
    ? { name: `${preview.number}.pdf`, url: previewUrl, isImage: false }
    : null;

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex flex-1 items-center">
            <IconSearch width={16} height={16} className="pointer-events-none absolute left-3 text-fg-subtle" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search doc #, company, job #…"
              className={`h-10 w-full min-w-[200px] pl-9 ${CONTROL}`}
            />
          </label>
          <button
            type="button"
            onClick={() => exportDocs("filtered")}
            disabled={exporting !== null || filtered.length === 0}
            className={`shrink-0 rounded-md px-3.5 py-2 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${BTN_NEUTRAL}`}
          >
            {exporting === "filtered" ? "Exporting…" : "Export to PC"}
          </button>
          <button
            type="button"
            onClick={() => exportDocs("all")}
            disabled={exporting !== null || documents.length === 0}
            className={`shrink-0 rounded-md px-3.5 py-2 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
          >
            {exporting === "all" ? "Exporting…" : "Export all"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Document type" className="flex gap-1 rounded-lg border border-line-strong bg-inset p-1">
            {TYPE_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={type === t.key}
                onClick={() => setType(t.key)}
                className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  type === t.key ? "bg-card text-[#9333ea] shadow-e1 ring-1 ring-line-strong" : "text-fg-muted hover:text-fg"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className={`h-9 ${CONTROL}`}>
            <option value="">All owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select value={company} onChange={(e) => setCompany(e.target.value)} className={`h-9 ${CONTROL}`}>
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {error && <Card className="border-bad/30 bg-bad-bg px-4 py-2.5 text-[13px] text-bad">{error}</Card>}

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconRateConfirmation />}
            title={documents.length === 0 ? "No documents yet" : "No documents match"}
            body={
              documents.length === 0
                ? "Rate confirmations and BOLs generated from any shipment will show up here."
                : "Try different filters."
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHead title="Operational Documents" hint={`${filtered.length} ${filtered.length === 1 ? "document" : "documents"}`} />
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((doc) => (
              <button
                key={`${doc.docType}-${doc.id}`}
                type="button"
                onClick={() => openPreview(doc)}
                disabled={!doc.pdfStoragePath}
                className="flex flex-col overflow-hidden rounded-lg border border-line-strong bg-card text-left shadow-e1 transition-shadow hover:shadow-e2 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-inset">
                  {doc.thumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={doc.thumbUrl} alt={doc.number} className="h-full w-full object-cover object-top" />
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 text-accent">{typeIcon(doc.docType)}</span>
                    <span className="shrink-0 rounded-full bg-inset px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                      {typeLabel(doc.docType)}
                    </span>
                    <span className="min-w-0 truncate text-[13px] font-bold text-fg">{doc.number}</span>
                    <span className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${docStatusTone(doc.status)}`}>
                      {docStatusLabel(doc.status)}
                    </span>
                  </div>
                  <p className="truncate text-[12.5px] font-semibold text-fg">
                    {doc.companyName ? titleCaseWords(doc.companyName) : "No company"}
                  </p>
                  {doc.shipmentNumber && <p className="truncate text-[11.5px] text-fg-subtle">{doc.shipmentNumber}</p>}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-accent text-[9px] font-semibold text-white">
                        {initials(doc.uploadedByName)}
                      </span>
                      <span className="truncate text-[11px] text-fg-subtle">{doc.uploadedByName || "Unknown"}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-fg-subtle">{formatDate(doc.createdAt)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {previewDoc && (
        <DocViewer
          doc={previewDoc}
          onClose={() => {
            setPreview(null);
            setPreviewUrl(null);
          }}
        />
      )}
    </div>
  );
}
