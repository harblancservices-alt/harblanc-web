// Ambient declarations for `zipcodes` (no @types package published).
// Covers only the surface we actually use in src/lib/dispatch/distance.ts.
// Extend here if a new method becomes load-bearing.

declare module "zipcodes" {
  export interface ZipResult {
    zip: string;
    latitude: number;
    longitude: number;
    city: string;
    state: string;
    country: string;
  }

  /** Look up a 5-digit ZIP. Returns undefined for unknown ZIPs. */
  export function lookup(zip: string): ZipResult | undefined;

  /**
   * Great-circle distance between two ZIPs in miles. Returns null if
   * either ZIP can't be resolved.
   */
  export function distance(zip1: string, zip2: string): number | null;

  const zipcodes: {
    lookup: typeof lookup;
    distance: typeof distance;
  };

  export default zipcodes;
}
