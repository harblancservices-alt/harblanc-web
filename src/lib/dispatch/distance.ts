import zipcodes from "zipcodes";

/**
 * ZIP-to-ZIP distance + RPM helpers for the dispatch estimate composer.
 *
 * The `zipcodes` package gives us:
 *   - lookup(zip) → { latitude, longitude, city, state } | null
 *   - distance(z1, z2) → great-circle miles | null
 *
 * For freight purposes, driving miles are typically ~1.18× great-circle
 * for US lanes (terrain, interstate routing, river crossings). We apply
 * a 1.18 multiplier to convert great-circle to a driving-miles estimate.
 *
 * If either ZIP doesn't resolve (PO-box-only, recently-issued ZIP,
 * Canadian postal code mistakenly entered, etc.), the helper returns
 * { ok: false, reason } and the UI shows "Enter miles manually".
 *
 * This is server-side only — `zipcodes` ships its dataset as a JSON
 * module; don't import this file from a "use client" component.
 */

const DRIVING_MILES_MULTIPLIER = 1.18;

export type LaneMilesResult =
  | { ok: true; miles: number; greatCircle: number; origin: ZipLookup; destination: ZipLookup }
  | { ok: false; reason: string };

export type ZipLookup = {
  zip: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
};

export function lookupZip(zip: string): ZipLookup | null {
  // zipcodes accepts 5-digit ZIPs; strip ZIP+4 if present.
  const five = zip.split("-")[0];
  const r = zipcodes.lookup(five);
  if (!r || typeof r.latitude !== "number" || typeof r.longitude !== "number") {
    return null;
  }
  return {
    zip: r.zip,
    city: r.city ?? "",
    state: r.state ?? "",
    lat: r.latitude,
    lon: r.longitude,
  };
}

export function estimateLaneMiles(originZip: string, destZip: string): LaneMilesResult {
  const origin = lookupZip(originZip);
  const destination = lookupZip(destZip);
  if (!origin) return { ok: false, reason: `Unknown ZIP: ${originZip}` };
  if (!destination) return { ok: false, reason: `Unknown ZIP: ${destZip}` };

  const o5 = originZip.split("-")[0];
  const d5 = destZip.split("-")[0];
  const gc = zipcodes.distance(o5, d5);
  if (gc == null) {
    return { ok: false, reason: "Could not compute distance" };
  }
  // Round driving-miles estimate to nearest whole mile.
  const miles = Math.round(gc * DRIVING_MILES_MULTIPLIER);
  return {
    ok: true,
    miles,
    greatCircle: Math.round(gc),
    origin,
    destination,
  };
}

/** Compute RPM = rate / miles. Returns null if miles is 0 / undefined. */
export function computeRpm(rate: number | null, miles: number | null): number | null {
  if (!rate || !miles || miles <= 0) return null;
  return Math.round((rate / miles) * 100) / 100;
}
