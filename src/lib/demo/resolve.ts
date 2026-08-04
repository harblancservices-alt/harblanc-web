/**
 * Resolves the current request's DataSource ONCE (v2-architecture.md §10)
 * — `isDemoMode() ? demoDataSource : liveDataSource`. Wrapped in React's
 * `cache()` so every `lib/data/*` call within the same request tree
 * resolves the identical instance without prop-drilling it through every
 * component or route handler.
 *
 * `isDemoMode()` is /admin's existing demo-mode cookie flag
 * (`src/lib/admin/demo.ts`), reused as-is — /tms-v2 shares the same
 * session as /admin (v2-architecture.md §7), so it shares the same demo
 * toggle rather than inventing a second one.
 */

import { cache } from "react";
import { isDemoMode } from "@/lib/admin/demo";
import { liveDataSource } from "./live-data-source";
import { demoDataSource } from "./demo-data-source";
import type { DataSource } from "./data-source";

export const resolveDataSource = cache(async (): Promise<DataSource> => {
  return (await isDemoMode()) ? demoDataSource : liveDataSource;
});
