"use client";

import { useEffect, useRef, useState } from "react";
import { renderPdfFirstPageToDataUrl } from "@/lib/pdf/pdfThumb";
import { IconFile } from "./icons";

/**
 * The visual preview tile for a stored CRM document — one component, shared
 * by the Admin Documents grid and the Operations packet builder, so a
 * document looks the same wherever it's listed.
 *
 * THREE SOURCES, tried in order, first one that works wins:
 *
 *   1. `thumbUrl` — a signed URL for the `<storagePath>.thumb.v3.png`
 *      sibling rendered SERVER-side at upload time
 *      (lib/pdf/pdfPageThumbnail.ts). The cheap, primary path: one raster
 *      ever, a few KB per viewer.
 *   2. For an image, the ORIGINAL file (`previewUrl`) straight into an
 *      <img>. An image is already its own thumbnail; nothing to render.
 *   3. For a PDF with no stored thumbnail, a browser-side first-page raster
 *      of the original (lib/pdf/pdfThumb.ts). This is the heal-the-past
 *      path — every document uploaded while the upload action wasn't
 *      generating thumbnails has no sibling object, and Storage objects
 *      can't be backfilled with SQL. Gated behind an IntersectionObserver
 *      and a size cap so a long library doesn't pull megabytes of PDF for
 *      rows nobody scrolled to.
 *
 * Anything else (or any failure at any step) lands on a labeled file tile —
 * the glyph PLUS its type in words. That labeling is deliberate: a bare grey
 * page outline centered in an empty box is what a browser draws for a broken
 * image, and it was being read as exactly that.
 */

/** Skip the browser-side raster for anything this big — past a few MB the
 * download costs more than the preview is worth, and the labeled tile is a
 * perfectly honest answer. */
const CLIENT_RASTER_MAX_BYTES = 8 * 1024 * 1024;

/** CSS px width to raster a PDF page at. Small: these tiles are 56–260px
 * wide, and the helper multiplies by devicePixelRatio on top. */
const RASTER_WIDTH = 320;

export type DocThumbProps = {
  /** Signed URL of the server-rendered `.thumb.v3.png`, when one exists. */
  thumbUrl?: string | null;
  /** Signed URL of the ORIGINAL stored object. */
  previewUrl?: string | null;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  /** Sizing/shape comes from the caller — a 4:3 card face in the admin grid,
   * a small portrait chip in the packet list. */
  className?: string;
};

type Kind = "pdf" | "image" | "other";

/** mime_type first, extension as the backstop. `file.type` is normally set
 * by the browser at upload, but it CAN come through empty for an unusual
 * file, and a row saved with a null mime must not lose its preview over it. */
export function resolveDocKind(mimeType: string | null | undefined, fileName: string): Kind {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";

  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg"].includes(ext)) return "image";
  return "other";
}

/** Short type word for the fallback tile — "PDF", "IMAGE", or the file's own
 * extension ("DOCX") so even an unpreviewable file says what it is. */
function typeWord(kind: Kind, fileName: string): string {
  if (kind === "pdf") return "PDF";
  if (kind === "image") return "IMAGE";
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return ext && ext.length <= 5 ? ext.toUpperCase() : "FILE";
}

export function DocThumb({
  thumbUrl,
  previewUrl,
  fileName,
  mimeType,
  sizeBytes,
  className,
}: DocThumbProps) {
  const kind = resolveDocKind(mimeType, fileName);

  // Which of the three sources is currently in play. `thumbUrl` and the
  // direct image both start "ready"; an <img> onError demotes them.
  const [thumbFailed, setThumbFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [rastered, setRastered] = useState<string | null>(null);
  const [rasterFailed, setRasterFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  /** The previewUrl a raster has already been kicked off for. A ref, not
   * state, so starting one never costs a render — which is also what keeps
   * every setState in this component out of an effect BODY (they all happen
   * in an async callback instead). */
  const startedFor = useRef<string | null>(null);

  const useStoredThumb = Boolean(thumbUrl) && !thumbFailed;
  const useDirectImage = !useStoredThumb && kind === "image" && Boolean(previewUrl) && !imageFailed;
  const wantsClientRaster =
    !useStoredThumb &&
    !useDirectImage &&
    kind === "pdf" &&
    Boolean(previewUrl) &&
    (sizeBytes ?? 0) <= CLIENT_RASTER_MAX_BYTES;

  // Only fetch a PDF once its tile is actually on screen.
  useEffect(() => {
    if (!wantsClientRaster || visible) return;
    const node = hostRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      // Safety net for a non-browser/very old environment: fall straight
      // through to "visible". Deferred to a task rather than set inline, so
      // this stays out of the effect BODY — a synchronous setState there
      // would both trip react-hooks/set-state-in-effect and make the first
      // client render disagree with the server's.
      const id = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(id);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [wantsClientRaster, visible]);

  useEffect(() => {
    if (!wantsClientRaster || !visible || !previewUrl) return;
    // Guarded by a ref rather than a "pending" state flag, so nothing is set
    // synchronously here — the only setState calls are in the async
    // continuation below.
    if (startedFor.current === previewUrl) return;
    startedFor.current = previewUrl;

    let cancelled = false;
    void renderPdfFirstPageToDataUrl(previewUrl, RASTER_WIDTH).then((dataUrl) => {
      if (cancelled) return;
      if (dataUrl) setRastered(dataUrl);
      else setRasterFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [wantsClientRaster, visible, previewUrl]);

  /** Derived, not stored: a raster is in flight whenever we want one, its
   * tile is on screen, and neither an image nor a failure has come back. */
  const rasterPending = wantsClientRaster && visible && !rastered && !rasterFailed;

  const shell = `flex items-center justify-center overflow-hidden bg-inset ${className ?? ""}`;

  if (useStoredThumb) {
    return (
      <div ref={hostRef} className={shell}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl as string}
          alt={fileName}
          loading="lazy"
          onError={() => setThumbFailed(true)}
          className="h-full w-full object-cover object-top"
        />
      </div>
    );
  }

  if (useDirectImage) {
    return (
      <div ref={hostRef} className={shell}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl as string}
          alt={fileName}
          loading="lazy"
          onError={() => setImageFailed(true)}
          className="h-full w-full object-cover object-top"
        />
      </div>
    );
  }

  if (rastered) {
    return (
      <div ref={hostRef} className={shell}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={rastered} alt={fileName} className="h-full w-full object-cover object-top" />
      </div>
    );
  }

  if (rasterPending) {
    return (
      <div ref={hostRef} className={shell}>
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-fg-muted">
          Loading…
        </span>
      </div>
    );
  }

  return (
    <div ref={hostRef} className={`${shell} flex-col gap-1 text-fg-muted`}>
      <IconFile width={22} height={22} />
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-fg-muted">
        {typeWord(kind, fileName)}
      </span>
    </div>
  );
}
