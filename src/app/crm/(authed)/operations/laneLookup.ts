/**
 * Shared contract for the Quote Calculator's ZIP → miles lookup.
 *
 * A PLAIN module — no "use server" here, deliberately. The lookup itself is
 * a Server Action (./lane-actions.ts) because it runs over the `zipcodes`
 * dataset, which is ~40k rows of JSON that must never reach the browser
 * bundle (importing lib/dispatch/distance.ts from a client component is the
 * documented cause of the dispatch composer's old typing lag). But a
 * "use server" file may only export async functions, so the TYPE and the
 * pure normalizer live here, where both the action and the client component
 * can import them. Same split as Phase 1's packetContract.ts / packet route.
 */

export type LaneMilesLookup =
  | {
      ok: true;
      /** Driving-miles ESTIMATE (great-circle × 1.18), already rounded. */
      miles: number;
      originCity: string;
      originState: string;
      destinationCity: string;
      destinationState: string;
    }
  | { ok: false; error: string };

/** ZIP+4, spaces, stray punctuation — reduce to the 5 digits `zipcodes`
 * actually indexes. Returns "" for anything with no digits at all. */
export function normalizeZip(value: string): string {
  return (value ?? "").replace(/\D/g, "").slice(0, 5);
}

/** True once a field holds a full 5-digit ZIP worth looking up. Drives the
 * on-blur auto-lookup, so a half-typed ZIP never fires a request. */
export function isCompleteZip(value: string): boolean {
  return normalizeZip(value).length === 5;
}
