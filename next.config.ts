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
  serverExternalPackages: ["@napi-rs/canvas"],
  // serverExternalPackages only stops Next from BUNDLING the package — the
  // native .node binary (and pdfjs-dist's legacy-build data files) still
  // have to be physically copied into the deployed serverless function.
  // Vercel's automatic output-file-tracing can miss files that are only
  // ever reached via `require()` inside an optional-dependency subpackage
  // (@napi-rs/canvas-<platform>-<abi>), which is exactly how napi-rs
  // resolves its platform binary — this makes the include explicit instead
  // of relying on the tracer to find it.
  outputFileTracingIncludes: {
    "/crm/settings": [
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-*/**/*",
      "./node_modules/pdfjs-dist/legacy/**/*",
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
