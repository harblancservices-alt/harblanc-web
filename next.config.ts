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
