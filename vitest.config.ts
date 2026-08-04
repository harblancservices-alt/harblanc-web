import { defineConfig } from "vitest/config";
import path from "node:path";

// Minimal Vitest setup — unit tests for the pure money-math core only
// (no DOM, no Next runtime). The "@/*" alias mirrors tsconfig.json's paths
// so domain/data modules under test can use the same "@/lib/..." imports
// they use everywhere else in the app, instead of a test-only relative-path
// convention.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
