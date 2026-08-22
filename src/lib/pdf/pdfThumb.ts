"use client";

import { loadPdfjs } from "./pdfjs";

/**
 * Browser-side: rasterize a PDF's FIRST PAGE only, small, to a PNG data URL —
 * the thumbnail counterpart to DocViewer's `PdfViewerPages`, which rasterizes
 * EVERY page at 900–2400px for a full-screen reader. Rendering a grid of
 * thumbnails through that would download and raster every page of every
 * document; this stops at page 1 and at a few hundred pixels.
 *
 * It goes through the SAME `loadPdfjs()` loader `PdfViewerPages` uses, so
 * there is still exactly one pdf.js instance and one worker configuration in
 * the browser — the expensive, easy-to-get-wrong part stays shared even
 * though the two callers want different output sizes.
 *
 * Not to be confused with ./pdfPageThumbnail.ts's `renderPdfFirstPageToPng`,
 * which does the same job SERVER-side (Node "legacy" build + @napi-rs/canvas)
 * when an upload is stored. That one is the primary path — a thumbnail
 * rendered once at upload beats one rendered in every viewer's browser. This
 * is the fallback for documents that have no stored thumbnail: everything
 * uploaded while the upload action was (accidentally) not generating one, and
 * anything whose server-side render failed. See admin/documents-data.ts.
 *
 * Never throws: a thumbnail is decoration, and a malformed or huge PDF must
 * degrade to a labeled file tile, never take the page down. Returns null on
 * any failure.
 */
export async function renderPdfFirstPageToDataUrl(
  url: string,
  targetWidthCssPx = 320,
): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());

    const pdfjs = await loadPdfjs();
    // pdf.js may transfer (detach) the buffer to its worker — pass a copy,
    // same reason PdfViewerPages does.
    // Keep the LOADING TASK, not just the document: destroy() lives on
    // PDFDocumentLoadingTask (PDFDocumentProxy only has cleanup()), and it's
    // the loading task's destroy() that actually tears down the worker-side
    // document.
    const loadingTask = pdfjs.getDocument({ data: buf.slice() });
    const pdfDoc = await loadingTask.promise;
    try {
      const page = await pdfDoc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({
        scale: (targetWidthCssPx / base.width) * dpr,
      });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      return canvas.toDataURL("image/png");
    } finally {
      // A grid renders many of these; releasing the worker-side document
      // matters more here than it does for a single full-screen viewer.
      void loadingTask.destroy();
    }
  } catch {
    return null;
  }
}
