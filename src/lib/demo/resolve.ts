/**
 * Resolves the current request's DataSource (v2-architecture.md §10).
 * Demo mode has been removed from /tms-v2 — this always returns the live
 * Supabase-backed source. Wrapped in React's `cache()` so every
 * `lib/data/*` call within the same request tree resolves the identical
 * instance without prop-drilling it through every component or route
 * handler.
 */

import { cache } from "react";
import { liveDataSource } from "./live-data-source";
import type { DataSource } from "./data-source";

export const resolveDataSource = cache(async (): Promise<DataSource> => {
  return liveDataSource;
});
