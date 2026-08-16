/**
 * Server-only: rasterize a PDF's first page to a PNG buffer — used for the
 * CRM Documents-tab card thumbnails (blankTemplates.ts's generated RC/BOL
 * templates, and any admin-uploaded PDF via settings/documents-actions.ts).
 *
 * pdfjs-dist's ordinary BROWSER build (the one shipments/[id]/DocumentSigner.tsx
 * already uses client-side to preview a doc before signing) was tried here
 * first and reproducibly hung forever mid-render — confirmed via a standalone
 * repro against the exact installed pdfjs-dist version, independent of
 * whether the PDF had an embedded image, which worker build was used, or
 * whether standardFontDataUrl/wasmUrl/iccUrl were supplied. This function
 * uses pdfjs-dist's NODE ("legacy") build instead, which renders
 * synchronously in-process — no Worker, no OffscreenCanvas transfer, none of
 * the machinery the browser build's hang lives in — paired with
 * @napi-rs/canvas for the actual 2D canvas implementation Node lacks
 * natively.
 *
 * Both are loaded LAZILY inside this function, never at module top-level:
 * @napi-rs/canvas ships a native (napi-rs, prebuilt-binary) module, and an
 * eval/load failure for a native dependency imported at module scope can
 * poison every export of whatever "use server" file transitively imports it
 * — the exact Vercel regression `sharp` caused once before in this codebase
 * (see dispatch/loads/actions.ts's sharp import, fixed in 8c74925). A
 * thumbnail is a nice-to-have, never worth taking down the upload/generate
 * action it's attached to, so every failure here is caught and reported as
 * `ok: false` rather than thrown.
 *
 * Deliberately does NOT set `standardFontDataUrl` — pointing it at
 * node_modules/pdfjs-dist/standard_fonts (a file read by path string, not a
 * JS import) risks that directory being tree-shaken out of the Vercel
 * function bundle, turning a cosmetic font-substitution warning into a hard
 * failure. Text still renders (via a fallback substitute), just not with
 * pdf.js's own bundled metrics — an acceptable trade for a card thumbnail.
 *
 * Also explicitly wires up pdf.js's "fake worker" (used whenever no real
 * Worker thread exists, i.e. every Node/serverless call) instead of letting
 * it set itself up. Root-caused from a live production stack trace: pdf.mjs's
 * own fake-worker setup does `await import(this.workerSrc)` where workerSrc
 * defaults to the RELATIVE string "./pdf.worker.mjs" — a specifier computed
 * at runtime from a variable, which Vercel's build-time file tracer can't
 * follow, so pdf.worker.mjs never made it into the deployed function even
 * after externalizing pdfjs-dist (see next.config.ts). pdf.mjs's own source
 * checks `globalThis.pdfjsWorker?.WorkerMessageHandler` FIRST and skips its
 * broken dynamic import entirely if that's already set — so this imports the
 * worker module directly, with a literal (traceable) specifier the file
 * tracer DOES follow, and sets that global before calling getDocument().
 */
export type RenderPdfThumbnailResult =
  | { ok: true; png: Buffer }
  | { ok: false; error: string };

const TARGET_WIDTH_PX = 500;

export async function renderPdfFirstPageToPng(
  bytes: Uint8Array | Buffer,
): Promise<RenderPdfThumbnailResult> {
  try {
    const [{ createCanvas }, pdfjsLib, pdfjsWorker] = await Promise.all([
      import("@napi-rs/canvas"),
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      // @ts-expect-error — pdfjs-dist ships no .d.ts for this worker entry
      // point (it's never meant to be imported for its exports directly,
      // only for the side effect of registering WorkerMessageHandler).
      import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ]);
    // See the file header — this is what makes pdf.js's fake-worker setup
    // skip its own broken dynamic import of "./pdf.worker.mjs".
    (globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

    // pdf.js explicitly rejects a Node Buffer even though Buffer extends
    // Uint8Array (its own strict-constructor check, not just an instanceof)
    // — always copy into a plain Uint8Array regardless of what was passed in.
    const data = new Uint8Array(bytes);
    const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
    const page = await pdfDoc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: TARGET_WIDTH_PX / baseViewport.width });

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    await page.render({
      canvas: null,
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;

    return { ok: true, png: canvas.toBuffer("image/png") };
  } catch (e) {
    // Never silent — a thumbnail failure isn't fatal to the caller, but a
    // SILENT one is undebuggable in a serverless environment nobody can
    // attach a debugger to. `vercel logs` surfaces this.
    console.error("renderPdfFirstPageToPng failed:", e instanceof Error ? e.stack ?? e.message : e);
    return { ok: false, error: "Could not render a preview for this PDF." };
  }
}
