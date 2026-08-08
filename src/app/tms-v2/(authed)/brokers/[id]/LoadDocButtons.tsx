"use client";

import { useState } from "react";
import { DocumentPreviewModal, type PreviewDoc } from "@/components/tms-v2/ui/DocumentPreviewModal";
import type { LoadDocSummary } from "@/lib/data/broker-profile";

const DOC_BUTTONS: { kind: string; label: string }[] = [
  { kind: "bol", label: "BOL" },
  { kind: "rate_con", label: "Rate Con" },
  { kind: "pod", label: "POD" },
];

function isImageDoc(d: LoadDocSummary): boolean {
  return (d.mime ?? "").startsWith("image/");
}

/**
 * Per-document-type VIEW buttons on a Load History card (Brent's ask,
 * 2026-08-08) — BOL / Rate Con / POD, one button each, shown only when
 * that kind actually exists on the load (no dead buttons — a missing kind
 * is hidden entirely rather than rendered disabled). Tapping opens the
 * same document Load Detail's Documents section shows
 * (lib/data/broker-profile.ts's fetchDocumentsByLoadId reads the exact
 * same `load_documents` table getLoadDetail() does), in a popup viewer —
 * never downloads by itself; Download is a separate action inside that
 * popup.
 *
 * A standalone Client Component, not inline in the Server Component
 * BrokerHistoryCard — its onClick has to stopPropagation() out of the
 * card's own enclosing <Link>, and that file's own header comment
 * explicitly warns against attaching a raw event handler to a bare
 * element there (a prior bug did exactly that and crashed the RSC
 * render). MarkPaidCell (components/tms-v2/MarkPaidCell.tsx) is the
 * existing precedent for this same isolation.
 */
export function LoadDocButtons({ documents }: { documents: LoadDocSummary[] }) {
  const [previewDoc, setPreviewDoc] = useState<PreviewDoc | null>(null);

  const available = DOC_BUTTONS.map((b) => ({ ...b, doc: documents.find((d) => d.kind === b.kind) })).filter(
    (b): b is { kind: string; label: string; doc: LoadDocSummary } => !!b.doc,
  );
  if (available.length === 0) return null;

  return (
    <>
      <span className="flex flex-wrap items-center gap-1.5">
        {available.map((b) => (
          <button
            key={b.kind}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setPreviewDoc({ name: b.doc.name, url: b.doc.url, isImage: isImageDoc(b.doc) });
            }}
            className="h-7 shrink-0 rounded-md border border-line-strong bg-card px-2 text-[11px] font-medium text-fg hover:bg-elevated"
          >
            {b.label}
          </button>
        ))}
      </span>
      <DocumentPreviewModal open={previewDoc != null} onClose={() => setPreviewDoc(null)} doc={previewDoc} />
    </>
  );
}
