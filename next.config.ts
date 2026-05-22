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
};

export default nextConfig;
