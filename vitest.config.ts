import { defineConfig } from "vitest/config";

// Minimal Vitest setup — unit tests for the pure money-math core only
// (no DOM, no Next runtime). Tests are co-located next to the source they
// cover and import it via relative paths, so no path-alias wiring is needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
