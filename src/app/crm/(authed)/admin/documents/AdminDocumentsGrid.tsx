"use client";

import { useState } from "react";
import { Card, CardHead } from "../../_shell/ui";
import { IconRateConfirmation, IconBillOfLading } from "../../_shell/icons";
import { getSignedPdfUrl } from "../../shipments/pdfClient";
import { DocViewer, type ViewerDoc } from "@/components/ui/DocViewer";
import type { AdminBlankTemplate } from "../types";

function typeIcon(t: AdminBlankTemplate["docType"]) {
  return t === "bill_of_lading" ? <IconBillOfLading width={14} height={14} /> : <IconRateConfirmation width={14} height={14} />;
}

/**
 * The blank master template library — one card per template
 * (Rate Confirmation, Bill of Lading), each clearly labeled by type. No
 * filters, search, or export controls (Brent's explicit call: this tab is a
 * small, fixed reference library, not a searchable document store — that
 * top bar belonged to the tab's earlier "operational documents" design,
 * which this replaces entirely). Clicking a card with a template on file
 * opens it in the same full-screen DocViewer every other CRM doc preview
 * uses; a card with no template on file (empty org, or the row was deleted)
 * renders as a plain labeled placeholder, not a button.
 */
export function AdminDocumentsGrid({ templates }: { templates: AdminBlankTemplate[] }) {
  const [preview, setPreview] = useState<AdminBlankTemplate | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openPreview(t: AdminBlankTemplate) {
    if (!t.storagePath) return;
    setError(null);
    setPreview(t);
    setPreviewUrl(null);
    const url = await getSignedPdfUrl(t.storagePath);
    setPreviewUrl(url);
    if (!url) setError("Could not open this template. Please try again.");
  }

  const previewDoc: ViewerDoc | null = preview
    ? { name: preview.fileName ?? `${preview.label} Template.pdf`, url: previewUrl, isImage: false }
    : null;

  return (
    <div className="space-y-4">
      {error && <Card className="border-bad/30 bg-bad-bg px-4 py-2.5 text-[13px] text-bad">{error}</Card>}

      <Card>
        <CardHead title="Blank Templates" hint="The default master template for each generated document type" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          {templates.map((t) => {
            const hasFile = Boolean(t.storagePath);
            return (
              <div
                key={t.docType}
                role={hasFile ? "button" : undefined}
                tabIndex={hasFile ? 0 : undefined}
                onClick={hasFile ? () => openPreview(t) : undefined}
                onKeyDown={
                  hasFile
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") openPreview(t);
                      }
                    : undefined
                }
                className={`flex flex-col overflow-hidden rounded-lg border border-line-strong bg-card text-left shadow-e1 ${
                  hasFile ? "cursor-pointer transition-shadow hover:shadow-e2" : "opacity-80"
                }`}
              >
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-inset">
                  {t.thumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumbUrl} alt={t.label} className="h-full w-full object-cover object-top" />
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 text-accent">{typeIcon(t.docType)}</span>
                    <span className="text-[13.5px] font-bold text-fg">{t.label}</span>
                  </div>
                  <p className="text-[12px] text-fg-subtle">
                    {hasFile ? "Blank master template" : "No template on file yet"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

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
