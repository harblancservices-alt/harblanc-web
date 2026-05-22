/**
 * Pure RPM math. Lives in its own module so client components can import
 * it without dragging in the `zipcodes` Node-only dataset that lives next
 * to it in distance.ts.
 *
 * Distance.ts is server-only because `zipcodes` ships ~40k rows of ZIP
 * lookup data as a JSON module — pulling that into the browser bundle
 * was the source of the typing lag in the dispatch composer.
 */

/** Compute RPM = rate / miles. Returns null if miles is 0 / undefined. */
export function computeRpm(
  rate: number | null,
  miles: number | null,
): number | null {
  if (!rate || !miles || miles <= 0) return null;
  return Math.round((rate / miles) * 100) / 100;
}
