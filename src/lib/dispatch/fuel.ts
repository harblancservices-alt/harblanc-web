/**
 * Dispatch fuel / mileage math.
 *
 * Pure functions (no DB, no zipcodes) so server pages and the Load Board can
 * all share one source of truth. Odometer readings are absolute truck
 * readings; segments are derived as deltas:
 *
 *   deadhead = odo_loaded   - odo_assigned   (assign → fully loaded)
 *   loaded   = odo_delivered - odo_loaded    (loaded → delivered)
 *   PC       = the gaps between loads (computed at the trip level)
 *
 * Diesel for any stretch = miles ÷ mpg × price-per-gallon.
 */

export type FuelSettings = { mpg: number; ppg: number; factoringPct: number };

export const FUEL_DEFAULTS: FuelSettings = { mpg: 13, ppg: 4.7, factoringPct: 3 };

/** Factoring fee = rate × factoring %. */
export function factoringFee(rate: number, s: FuelSettings): number {
  if (!Number.isFinite(rate) || rate <= 0 || !s.factoringPct) return 0;
  return (rate * s.factoringPct) / 100;
}

export function dieselCost(miles: number, s: FuelSettings): number {
  if (!Number.isFinite(miles) || miles <= 0 || !s.mpg) return 0;
  return (miles / s.mpg) * s.ppg;
}

/** Deadhead miles for a load, or null if the two readings aren't both in. */
export function deadheadMiles(
  odoAssigned: number | null,
  odoLoaded: number | null,
): number | null {
  if (odoAssigned == null || odoLoaded == null) return null;
  const d = odoLoaded - odoAssigned;
  return d >= 0 ? d : null;
}

/**
 * Loaded miles for a load: the odometer delta when both readings exist,
 * otherwise the ZIP-route estimate already stored on the load.
 */
export function loadedMiles(
  odoLoaded: number | null,
  odoDelivered: number | null,
  estimate: number | null,
): number | null {
  if (odoLoaded != null && odoDelivered != null) {
    const d = odoDelivered - odoLoaded;
    if (d >= 0) return d;
  }
  return estimate ?? null;
}

/** Business miles (deadhead + loaded) and the diesel they burned. */
export function loadDiesel(
  args: {
    odoAssigned: number | null;
    odoLoaded: number | null;
    odoDelivered: number | null;
    estimate: number | null;
  },
  s: FuelSettings,
): {
  deadhead: number | null;
  loaded: number | null;
  businessMiles: number;
  diesel: number;
} {
  const dh = deadheadMiles(args.odoAssigned, args.odoLoaded);
  const ld = loadedMiles(args.odoLoaded, args.odoDelivered, args.estimate);
  const businessMiles = (dh ?? 0) + (ld ?? 0);
  return { deadhead: dh, loaded: ld, businessMiles, diesel: dieselCost(businessMiles, s) };
}

/**
 * Full load net: rate minus diesel, factoring (auto % of rate), and the sum
 * of manually-entered expenses. The single source of truth for "true net"
 * across the load page, Load Board, trip rollup, and Accounting.
 */
export function loadNet(
  args: {
    rate: number;
    diesel: number;
    expensesTotal: number;
  },
  s: FuelSettings,
): { factoring: number; net: number } {
  const factoring = factoringFee(args.rate, s);
  const net = args.rate - args.diesel - factoring - args.expensesTotal;
  return { factoring, net };
}
