"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { loadPdfjs } from "@/lib/pdf/pdfjs";

/**
 * The ONE full-screen document viewer for the whole app.
 *
 * Every doc type opens here — rate cons, BOLs, PODs, maintenance receipts,
 * camera batch photos, customer intake uploads — so the chrome is identical no
 * matter where you tapped. A single TOP toolbar carries, left-to-right:
 *
 *   Back  ·  name  ‖  zoom out / zoom % / zoom in / fit  ·  Download  ·  Delete
 *
 * Nothing is docked at the bottom: on a phone the bottom edge is where the
 * browser chrome and the home indicator live, and a destructive Delete sitting
 * under your thumb is exactly the wrong place for it. The toolbar wraps to two
 * rows on narrow screens rather than shrinking the targets.
 *
 * PDFs are rasterized fit-to-width with pdf.js; images render natively. Zoom is
 * ONE mechanism for both — it scales the content wrapper, so a PDF page and a
 * photo zoom the same way and the scroll container handles panning.
 */

export type ViewerDoc = {
  name: string;
  /** Signed URL to the full-size original; null → preview unavailable. */
  url: string | null;
  isImage: boolean;
};

/** Fit-to-width is 1. Below that shrinks to see a whole page; above pans. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

export function DocViewer({
  doc,
  onClose,
  parentHref,
  parentLabel = "Open record",
  onDelete,
  deleteLabel = "Delete",
  downloadName,
  badge,
  actions,
}: {
  doc: ViewerDoc;
  onClose: () => void;
  parentHref?: string;
  parentLabel?: string;
  /**
   * Deletes THIS document at its source. Omit and the Delete button is hidden
   * (view-only surfaces). The viewer owns the confirm step and closes itself
   * on success — consumers just do the delete and refresh their list.
   */
  onDelete?: () => Promise<void>;
  deleteLabel?: string;
  /** Filename for the download; defaults to `doc.name`. */
  downloadName?: string;
  /** Optional status pill rendered next to the name (e.g. Signed). */
  badge?: React.ReactNode;
  /** Doc-type-specific extras (e.g. BOL sign buttons) — toolbar, never bottom. */
  actions?: React.ReactNode;
}) {
  const [zoom, setZoom] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Lock background scroll while the viewer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Esc backs out — of the delete confirm first, then the viewer itself.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirming) setConfirming(false);
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, onClose]);

  const zoomBy = useCallback((delta: number) => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
  }, []);

  /**
   * Force a real download with the original filename. A bare `download`
   * attribute is ignored on cross-origin signed URLs (the storage host is a
   * different origin), so fetch to a blob and hand the browser a same-origin
   * object URL. Falls back to a new tab if the fetch is blocked.
   */
  async function download() {
    if (!doc.url || downloading) return;
    setDownloading(true);
    try {
      const resp = await fetch(doc.url);
      if (!resp.ok) throw new Error("fetch");
      const blob = await resp.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = withExtension(downloadName ?? doc.name, doc.url, blob.type);
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

  async function confirmDelete() {
    if (!onDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`View ${doc.name}`}
      className="fixed inset-0 z-[55] flex flex-col bg-black"
    >
      {/* ── The one toolbar. Wraps to two rows on narrow screens. ───────── */}
      <div className="shrink-0 border-b border-white/10 bg-bar">
        {/* Row 1 — Back · name · (parent record) */}
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-white/20 bg-white/[0.08] px-2.5 text-[12px] font-semibold text-bar-fg transition-colors hover:bg-white/15"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-[12px] font-semibold text-bar-fg">
              {doc.name}
            </span>
            {badge}
          </span>
          {parentHref ? (
            <Link
              href={parentHref}
              prefetch={false}
              onClick={onClose}
              className="hidden shrink-0 items-center rounded-md border border-white/20 px-2.5 py-1.5 text-[11px] font-semibold text-bar-fg transition-colors hover:bg-white/10 sm:inline-flex"
            >
              {parentLabel}
            </Link>
          ) : null}
        </div>

        {/* Row 2 — zoom cluster · doc-type actions · Download · Delete */}
        <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
          <div className="flex items-center gap-0.5 rounded-md border border-white/15 bg-white/[0.06] p-0.5">
            <ToolBtn
              label="Zoom out"
              onClick={() => zoomBy(-ZOOM_STEP)}
              disabled={zoom <= ZOOM_MIN}
            >
              <path d="M5 12h14" />
            </ToolBtn>
            <button
              type="button"
              onClick={() => setZoom(1)}
              aria-label="Reset zoom to fit"
              className="h-8 min-w-[3.25rem] rounded px-1 font-mono text-[11px] font-bold tabular-nums text-bar-fg transition-colors hover:bg-white/10"
            >
              {zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}
            </button>
            <ToolBtn
              label="Zoom in"
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={zoom >= ZOOM_MAX}
            >
              <path d="M12 5v14M5 12h14" />
            </ToolBtn>
          </div>

          {actions}

          <span className="flex-1" />

          {confirming ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-white/80">
                Delete permanently?
              </span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="h-9 rounded-md border border-white/20 px-2.5 text-[12px] font-semibold text-bar-fg transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                aria-busy={deleting}
                className="h-9 rounded-md bg-red-600 px-3 text-[12px] font-bold text-white transition-colors hover:bg-red-500 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          ) : (
            <>
              {doc.url ? (
                <button
                  type="button"
                  onClick={download}
                  disabled={downloading}
                  aria-busy={downloading}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/20 bg-white/[0.08] px-2.5 text-[12px] font-semibold text-bar-fg transition-colors hover:bg-white/15 disabled:opacity-60"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
                  </svg>
                  {downloading ? "Saving…" : "Download"}
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/15 px-2.5 text-[12px] font-semibold text-red-200 transition-colors hover:bg-red-500/25"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                  </svg>
                  {deleteLabel}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* ── Document. Zoom scales the wrapper; the scroller pans. ───────── */}
      <div className="min-h-0 flex-1 overflow-auto bg-neutral-900">
        <div
          className="mx-auto"
          style={{
            width: `${zoom * 100}%`,
            maxWidth: zoom <= 1 ? "56rem" : "none",
          }}
        >
          {doc.url ? (
            doc.isImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={doc.url}
                alt={doc.name}
                className="block h-auto w-full"
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
      </div>
    </div>
  );
}

/** Square icon button used by the zoom cluster. Children are SVG paths. */
function ToolBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded text-bar-fg transition-colors hover:bg-white/10 disabled:opacity-35"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  );
}

/**
 * Best-effort filename for the download. Viewer names are auto-derived and
 * usually extension-less ("Rate con — Jul 9"), which would land in Downloads as
 * a file the OS can't open. Recover the extension from the storage path, or
 * fall back to the blob's MIME type.
 */
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

/**
 * Renders a PDF fit-to-WIDTH with pdf.js — each page rasterized to the
 * container width so the whole page shows with no horizontal panning. Pages are
 * emitted at a fixed raster width and displayed at `w-full`, so the viewer's
 * zoom scales them without re-rendering.
 *
 * Exported so a smaller, non-fullscreen presentation (e.g. tms-v2's
 * DocumentPreviewModal, which wraps the same rendering logic in the shared
 * Modal component instead of this file's own fixed-inset-0 shell) can reuse
 * the exact same PDF rendering — one PDF renderer, not two.
 */
export function PdfViewerPages({ url, name }: { url: string; name: string }) {
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
        // Raster a little wider than the viewport so zooming in stays sharp
        // instead of resampling an already-fit-to-width bitmap.
        const targetW = Math.min(
          Math.max(window.innerWidth || 400, 900) * 1.5,
          2400,
        );
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
    <div className="flex flex-col gap-2 p-2">
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
