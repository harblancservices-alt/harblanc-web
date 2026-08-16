import type { NextConfig } from "next";

// Resolve the workspace root for Turbopack. `import.meta.dirname` works
// when Node loads this file as a true ESM module (local `next dev` and
// `next build`), but Vercel's modifyConfig hook re-loads the config in
// a context where `import.meta.dirname` is undefined — which then gets
// passed to a path function and crashes the build with:
//   TypeError: The "path" argument must be of type string. Received undefined
// Fall back to process.cwd() in that case. `next build` runs from the
// project root on Vercel, so the fallback resolves to the same place.
const workspaceRoot = import.meta.dirname ?? process.cwd();

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root to this project so it stops
  // warning about lockfiles elsewhere on the machine.
  turbopack: {
    root: workspaceRoot,
  },
  // @napi-rs/canvas ships a native .node binary (js-binding.js requires it
  // directly) — Turbopack can't bundle that as an ESM chunk asset ("asset
  // is not placeable in ESM chunks") even though it's only ever dynamically
  // imported inside one function (src/lib/pdf/pdfPageThumbnail.ts). Marking
  // it external tells Next to leave it as a plain runtime `require()`
  // instead of trying to bundle it, which is how native addons are meant to
  // be loaded in a Node server runtime.
  //
  // pdfjs-dist is ALSO external, for a related but distinct reason, root-
  // caused from a live production stack trace (not guessed): with pdfjs-dist
  // left to Turbopack's normal bundling, its Node ("legacy") build got
  // transformed into a single synthetic chunk file
  // (.next/server/chunks/ssr/node_modules_pdfjs-dist_legacy_build_pdf_mjs_*),
  // and pdfjs-dist's own "fake worker" setup (used when no real Worker
  // thread is available, i.e. every Node/serverless call) does a RELATIVE
  // dynamic import of "./pdf.worker.mjs" from its own module's location —
  // which after bundling resolves to that same synthetic chunks/ssr/
  // directory, where pdf.worker.mjs was never copied. Every call failed with
  // `Cannot find module '/var/task/.next/server/chunks/ssr/pdf.worker.mjs'`.
  // Externalizing it stops Turbopack from rewriting its location at all —
  // it runs from its real node_modules/pdfjs-dist/legacy/build/ path, where
  // the relative worker import already resolves correctly. Only affects the
  // SERVER build; DocumentSigner.tsx/BolScanner.tsx's client-side pdfjs-dist
  // usage goes through a completely separate (client) bundle, untouched.
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  // serverExternalPackages stops Next from BUNDLING these packages, but the
  // native .node binary and pdfjs-dist's legacy-build files still have to be
  // physically copied into the deployed serverless function — Vercel's
  // automatic output-file-tracing can miss files only ever reached via
  // require() inside an optional-dependency subpackage (how napi-rs resolves
  // its platform binary) or a runtime-computed relative path (pdfjs-dist's
  // fake-worker setup). Explicit include as a safety net either way.
  outputFileTracingIncludes: {
    "/crm/settings": [
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-*/**/*",
      "./node_modules/pdfjs-dist/legacy/**/*",
      // Glyph data for the 14 standard PDF fonts (Helvetica, etc.) — without
      // this, text draws nothing on Vercel (no system fonts to fall back to
      // there, unlike a local desktop) even though the layout/logo render
      // fine. See pdfPageThumbnail.ts's standardFontDataUrl for the runtime
      // path resolution this include has to match.
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
    ],
  },
  experimental: {
    serverActions: {
      // Quick Quote + customer intake forms allow file uploads up to
      // 15 MB per file (see UPLOAD_MAX_BYTES in QuoteForm.tsx +
      // src/app/quote/upload-actions.ts). Next.js defaults Server
      // Action body size to 1 MB, which throws at the framework level
      // for any larger upload BEFORE our action code runs — meaning the
      // error never surfaces as the expected {ok:false, reason}
      // response and customers can re-submit the form, creating
      // duplicate quote_requests rows. Bump to 20 MB so a single
      // 15 MB file plus FormData overhead clears comfortably.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
