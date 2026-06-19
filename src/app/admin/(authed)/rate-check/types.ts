/**
 * Shared types for the Rate Check tool.
 *
 * Lives in its own no-directive module so both the server action
 * (`actions.ts`, "use server") and the client panel (`RateCheckPanel.tsx`,
 * "use client") can import the same shapes without dragging a server-only
 * boundary into the browser bundle.
 */

/**
 * Structured load data extracted from a posting screenshot by Claude
 * vision. Every field is nullable — a posting may omit any of them, and
 * "call for rate" postings legitimately have no rate. Money fields are
 * plain numbers (no $ / commas); dates are free-text as shown.
 */
export type ExtractedLoad = {
  origin: string | null;
  destination: string | null;
  origin_zip: string | null;
  dest_zip: string | null;
  trip_miles: number | null;
  rate_total: number | null;
  rate_per_mile: number | null;
  equipment: string | null;
  weight: string | null;
  broker: string | null;
  contact: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
  notes: string | null;
};

/** Result of the vision extraction server action. */
export type AnalyzeResult =
  | {
      ok: true;
      load: ExtractedLoad;
      /** Server-computed driving miles from the ZIPs (null if unavailable). */
      computedMiles: number | null;
      /** True when computedMiles came from the distance lib (no trip_miles in posting). */
      milesWereComputed: boolean;
    }
  | {
      ok: false;
      reason: string;
      /** False specifically when ANTHROPIC_API_KEY is unset — drives a friendly setup hint. */
      configured: boolean;
    };

/** Persisted cost basis, read from / written to public.app_settings. */
export type CostSettings = {
  /** All-in operating cost per mile. Null until Brent sets it. */
  costPerMile: number | null;
  /** Desired margin over break-even, in percent. Defaults to 15 when unset. */
  targetMarginPct: number | null;
};

export type VerdictTier = "take" | "marginal" | "pass";
