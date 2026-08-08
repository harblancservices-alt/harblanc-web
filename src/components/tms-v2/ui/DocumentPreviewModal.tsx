"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { PdfViewerPages } from "@/components/ui/DocViewer";

export type PreviewDoc = { name: string; url: string | null; isImage: boolean };

/**
 * A document open for VIEWING inside the shared Modal shell — not
 * DocViewer's own full-screen presentation (src/components/ui/DocViewer.tsx),
 * which is /admin's chrome. Same rendering underneath (PdfViewerPages,
 * imported from DocViewer.tsx — one PDF renderer, not two) and the same
 * "fetch to a blob, force a real download" technique for the Download
 * button (a bare `download` attribute is ignored on the storage host's
 * cross-origin signed URL), just proportioned by Modal's max-h-90dvh/
 * fixed-header/scrollable-body shape so it fits a phone screen correctly
 * instead of taking over the whole viewport. Tapping the trigger only
 * opens/views — Download is a separate, explicit action inside.
 */
export function DocumentPreviewModal({ open, onClose, doc }: { open: boolean; onClose: () => void; doc: PreviewDoc | null }) {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    if (!doc?.url || downloading) return;
    setDownloading(true);
    try {
      const resp = await fetch(doc.url);
      if (!resp.ok) throw new Error("fetch");
      const blob = await resp.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = withExtension(doc.name, doc.url, blob.type);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch {
      window.open(doc.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
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

/** Best-effort filename for the download — mirrors DocViewer.tsx's own
 * withExtension() (not exported there; this is the one other place that
 * needs it, so a short duplicate is cheaper than widening that file's
 * public surface for a single reuse). */
function withExtension(name: string, url: string, mime: string): string {
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  let ext = "";
  try {
    const path = new URL(url).pathname;
    ext = path.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? "";
  } catch {
    /* signed URLs are absolute, but never let this break the download */
  }
  if (!ext) {
    if (mime === "application/pdf") ext = "pdf";
    else if (mime.startsWith("image/")) ext = mime.slice(6).split("+")[0];
  }
  return ext ? `${name}.${ext}` : name;
}
