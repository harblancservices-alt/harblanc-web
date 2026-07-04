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

export type CityHit = {
  city: string;
  state: string;
  /** Representative (lowest) ZIP for this city+state — regional accuracy is
   *  fine for backhaul radius matching. */
  zip: string;
  lat: number;
  lon: number;
};

type RawZip = {
  zip: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  country?: string;
};

// Built once per server process from the bundled zipcodes dataset: one entry
// per (city, state), keyed to its lowest ZIP, sorted by city name. Stays
// server-side (the dataset never reaches the client bundle).
let CITY_INDEX:
  | {
      city: string;
      state: string;
      zip: string;
      lat: number;
      lon: number;
      lc: string;
      norm: string;
    }[]
  | null = null;

/** Lowercase, alphanumeric-only — so "green castle" matches "Greencastle". */
function normalizeCity(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cityIndex() {
  if (CITY_INDEX) return CITY_INDEX;
  const codes =
    (zipcodes as unknown as { codes?: Record<string, RawZip> }).codes ?? {};
  const best = new Map<
    string,
    { city: string; state: string; zip: string; lat: number; lon: number }
  >();
  for (const zip in codes) {
    const r = codes[zip];
    if (!r || !r.city || !r.state) continue;
    if (typeof r.latitude !== "number" || typeof r.longitude !== "number") continue;
    if ((r.country ?? "US") !== "US") continue;
    const key = r.city.toLowerCase() + "|" + r.state;
    const prev = best.get(key);
    // Lowest ZIP string = deterministic representative (same-length numeric).
    if (!prev || zip < prev.zip) {
      best.set(key, {
        city: r.city,
        state: r.state,
        zip,
        lat: r.latitude,
        lon: r.longitude,
      });
    }
  }
  CITY_INDEX = [...best.values()]
    .map((v) => ({
      ...v,
      lc: v.city.toLowerCase(),
      norm: normalizeCity(v.city),
    }))
    .sort((a, b) =>
      a.lc < b.lc ? -1 : a.lc > b.lc ? 1 : a.state < b.state ? -1 : 1,
    );
  return CITY_INDEX;
}

/**
 * Typeahead city search over the bundled US ZIP dataset. Prefix matches first
 * (sorted), then substring matches, capped at `limit`. Server-side only.
 */
export function searchCities(query: string, limit = 12): CityHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  // Space/punctuation-insensitive form so "green castle" finds "Greencastle".
  const qn = normalizeCity(q);
  const idx = cityIndex();
  const starts: CityHit[] = [];
  const contains: CityHit[] = [];
  for (const c of idx) {
    const hit: CityHit = {
      city: c.city,
      state: c.state,
      zip: c.zip,
      lat: c.lat,
      lon: c.lon,
    };
    if (c.lc.startsWith(q) || (qn.length >= 2 && c.norm.startsWith(qn))) {
      starts.push(hit);
      if (starts.length >= limit) break;
    } else if (
      contains.length < limit &&
      (c.lc.includes(q) || (qn.length >= 2 && c.norm.includes(qn)))
    ) {
      contains.push(hit);
    }
  }
  return [...starts, ...contains].slice(0, limit);
}

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

/**
 * Reverse lookup: the nearest ZIP record to a GPS coordinate. Backs the
 * "Use my location" button on Backhaul, turning the browser's lat/lon into
 * a ZIP we can resolve to a state.
 */
export function lookupCoords(lat: number, lon: number): ZipLookup | null {
  const r = zipcodes.lookupByCoords(lat, lon);
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

/**
 * Great-circle miles between two ZIPs (rounded). Null if either ZIP is
 * unknown. Backs Backhaul's "outbound freight within N miles" radius.
 */
export function zipDistanceMiles(zipA: string, zipB: string): number | null {
  const a = zipA.split("-")[0];
  const b = zipB.split("-")[0];
  const gc = zipcodes.distance(a, b);
  return gc == null ? null : Math.round(gc);
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

// computeRpm lives in ./rpm so client components can import it without
// pulling the zipcodes dataset into the browser bundle. Server callers
// can keep importing it from this module via the re-export below.
export { computeRpm } from "./rpm";
