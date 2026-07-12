"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadPdfjs } from "@/lib/pdf/pdfjs";
import { Button } from "@/components/ui/Button";

/**
 * Full-screen, read-only document viewer.
 *
 * The interactive load-detail DocViewer (dispatch/loads/[id]/DocumentsCard)
 * carries Sign / Delete for BOLs; this is the same full-screen experience with
 * the write actions removed — a shared viewer for anywhere docs are only ever
 * VIEWED (the Files timeline). Fills the whole screen, renders the doc large,
 * and offers Close · Open-in-new-tab · an optional link to the parent record.
 *
 * PDFs are rasterized fit-to-width with pdf.js (identical approach to the
 * load-detail viewer) so the whole page shows with no horizontal panning.
 */

export type ViewerDoc = {
  name: string;
  /** Signed URL to the full-size original; null → preview unavailable. */
  url: string | null;
  isImage: boolean;
};

export function DocViewer({
  doc,
  onClose,
  parentHref,
  parentLabel = "Open record",
}: {
  doc: ViewerDoc;
  onClose: () => void;
  parentHref?: string;
  parentLabel?: string;
}) {
  // Lock background scroll while the viewer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`View ${doc.name}`}
      className="fixed inset-0 z-[55] flex flex-col bg-black"
    >
      {/* Top bar: ✕ (close) · name */}
      <div className="flex items-center gap-2 bg-bar px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-bar-fg transition-colors hover:bg-white/10"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-bar-fg">
          {doc.name}
        </span>
      </div>

      {/* Document — fit-to-width by default; pinch / double-tap to zoom in */}
      <div className="min-h-0 flex-1 overflow-auto bg-neutral-900">
        {doc.url ? (
          doc.isImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={doc.url}
              alt={doc.name}
              className="mx-auto block h-auto w-full max-w-4xl"
            />
          ) : (
            <PdfViewerPages url={doc.url} name={doc.name} />
          )
        ) : (
          <p className="p-8 text-center text-[13px] text-white/60">
            Preview unavailable.
          </p>
        )}
      </div>

      {/* Bottom action bar: parent link + Open (download / new tab). */}
      <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-bar px-3 py-3">
        {parentHref ? (
          <Link
            href={parentHref}
            prefetch={false}
            onClick={onClose}
            className="inline-flex items-center rounded-md border border-white/20 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-bar-fg transition-colors hover:bg-white/10"
          >
            {parentLabel}
          </Link>
        ) : (
          <span />
        )}
        {doc.url ? (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex"
          >
            <Button type="button" variant="primary" size="sm">
              Open
            </Button>
          </a>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Renders a PDF fit-to-WIDTH with pdf.js — each page rasterized to the
 * container width so the whole page shows with no horizontal panning. Mirrors
 * the load-detail viewer's proven approach.
 */
function PdfViewerPages({ url, name }: { url: string; name: string }) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("fetch");
        const buf = new Uint8Array(await resp.arrayBuffer());
        const pdfjs = await loadPdfjs();
        // pdf.js may transfer (detach) the buffer to its worker — pass a copy.
        const pdfDoc = await pdfjs.getDocument({ data: buf.slice() }).promise;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const targetW = Math.min(window.innerWidth || 400, 1200);
        const out: string[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const p = await pdfDoc.getPage(i);
          const base = p.getViewport({ scale: 1 });
          const vp = p.getViewport({ scale: (targetW / base.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(vp.width);
          canvas.height = Math.ceil(vp.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("ctx");
          await p.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
          out.push(canvas.toDataURL("image/png"));
        }
        if (!cancelled) setPages(out);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) {
    return (
      <p className="p-8 text-center text-[13px] text-white/60">
        Couldn’t render this PDF.
      </p>
    );
  }
  if (!pages) {
    return <p className="p-8 text-center text-[13px] text-white/60">Loading…</p>;
  }
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-2 p-2">
      {pages.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={src}
          alt={`${name} — page ${i + 1}`}
          className="block w-full rounded-sm bg-white"
        />
      ))}
    </div>
  );
}
