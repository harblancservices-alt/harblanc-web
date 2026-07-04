import "server-only";

/**
 * Backhaul Reach — pure geo helpers (server-side; no DB, no zipcodes import so
 * it stays cheap to unit-test). Distances are great-circle miles; direction is
 * an 8-point compass bearing FROM a market center TO a town, which together
 * build the "(Kingwood, 22 mi NE)" precision parenthetical.
 */

const EARTH_RADIUS_MI = 3958.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in miles between two lat/long points. */
export function haversineMiles(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Compass8 =
  | "N"
  | "NE"
  | "E"
  | "SE"
  | "S"
  | "SW"
  | "W"
  | "NW";

const COMPASS: Compass8[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
 * 8-point compass direction FROM (aLat,aLon) TO (bLat,bLon). Uses initial
 * bearing; good enough for the short intra-market distances we label.
 */
export function compass8(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): Compass8 {
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const dLon = toRad(bLon - aLon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  let brng = (Math.atan2(y, x) * 180) / Math.PI; // -180..180, 0 = North
  brng = (brng + 360) % 360;
  // 8 sectors of 45°, offset by 22.5° so N spans 337.5..22.5.
  const idx = Math.round(brng / 45) % 8;
  return COMPASS[idx];
}

/**
 * Build the compact precision parenthetical, e.g. "(39 mi W of Indianapolis,
 * IN)": distance as a number + "mi", the UPPERCASE compass abbreviation, the
 * city in normal case, and the 2-letter UPPERCASE state. At the reference point
 * itself (< 1 mi) it collapses to "(Indianapolis, IN)". Empty string when
 * there's no city — callers embed it in the sentence and collapse whitespace.
 */
export function townParen(
  city: string,
  miles: number,
  dir: Compass8,
  stateAbbrev = "",
): string {
  const c = city.trim();
  if (!c) return "";
  const st = stateAbbrev.trim().toUpperCase();
  const place = st ? `${c}, ${st}` : c;
  if (miles < 1) return `(${place})`;
  return `(${miles} mi ${dir} of ${place})`;
}
