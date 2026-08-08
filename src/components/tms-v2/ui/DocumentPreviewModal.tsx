"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { PdfViewerPages } from "@/components/ui/DocViewer";
import { downloadFromUrl } from "@/lib/storage/client-download";

export type PreviewDoc = { name: string; url: string | null; isImage: boolean };

/**
 * A document open for VIEWING inside the shared Modal shell — not
 * DocViewer's own full-screen presentation (src/components/ui/DocViewer.tsx),
 * which is /admin's chrome. Same rendering underneath (PdfViewerPages,
 * imported from DocViewer.tsx — one PDF renderer, not two) and the same
 * "fetch to a blob, force a real download" technique for the Download
 * button (lib/storage/client-download.ts — shared with the Files page's
 * own download button), just proportioned by Modal's max-h-90dvh/
 * fixed-header/scrollable-body shape so it fits a phone screen correctly
 * instead of taking over the whole viewport. Tapping the trigger only
 * opens/views — Download is a separate, explicit action inside.
 */
export function DocumentPreviewModal({ open, onClose, doc }: { open: boolean; onClose: () => void; doc: PreviewDoc | null }) {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    if (!doc?.url || downloading) return;
    setDownloading(true);
    await downloadFromUrl(doc.url, doc.name);
    setDownloading(false);
  }

  return (
    <Modal
      open={open && !!doc}
      onClose={onClose}
      title={doc?.name ?? "Document"}
      maxWidthClassName="max-w-2xl"
      footer={
        doc?.url ? (
          <div className="flex items-center justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => void download()} disabled={downloading} aria-busy={downloading}>
              {downloading ? "Saving…" : "Download"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {!doc?.url ? (
        <p className="py-8 text-center text-[13px] text-fg-muted">Preview unavailable.</p>
      ) : doc.isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={doc.url} alt={doc.name} className="block h-auto w-full rounded-md" />
      ) : (
        <PdfViewerPages url={doc.url} name={doc.name} />
      )}
    </Modal>
  );
}
