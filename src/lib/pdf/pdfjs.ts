"use client";

/**
 * Lazy pdf.js loader, configured with a bundled ESM module worker.
 *
 * pdf.js is ~300 KB, so it is dynamic-imported the first time the BOL signer
 * opens and never pulled into the initial admin bundle. The worker URL is
 * resolved through `new URL(..., import.meta.url)` so the bundler (webpack /
 * Turbopack) emits the worker as a first-party asset — no CDN, works offline
 * and under the app's CSP.
 */
type PdfjsModule = typeof import("pdfjs-dist");

let modPromise: Promise<PdfjsModule> | null = null;

export function loadPdfjs(): Promise<PdfjsModule> {
  if (!modPromise) {
    modPromise = import("pdfjs-dist").then((pdfjs) => {
      // Hand pdf.js an explicit ES-module worker. Creating the Worker ourselves
      // (rather than a workerSrc string) is the reliable bundler pattern —
      // webpack 5 and Turbopack both rewrite `new Worker(new URL(...))` and we
      // control `{ type: "module" }` for the .mjs worker.
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(
        new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
        { type: "module" },
      );
      return pdfjs;
    });
  }
  return modPromise;
}
