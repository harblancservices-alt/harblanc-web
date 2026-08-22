import { FUEL_DEFAULTS, dieselCost } from "@/lib/dispatch/fuel";

/**
 * Operations → Quote Calculator: the pricing math, on its own.
 *
 * A PLAIN, pure module — no React, no DB, no server client, no "use server".
 * That's deliberate on two counts:
 *
 *  1. The formula is a working assumption, not gospel. Brent's brief was
 *     "average $125/hr with fuel and mph, plus the 25% brokerage on top" —
 *     a sensible house rule to quote from, not an audited rate model.
 *     Keeping it in one pure function means revising it is a one-file edit
 *     with tests around it, never a UI rewrite.
 *  2. It is unit-testable without a browser (see quotePricing.test.ts),
 *     which matters for money the reps will actually quote.
 *
 * The fuel leg REUSES dieselCost() from src/lib/dispatch/fuel.ts rather than
 * re-deriving `miles / mpg * ppg` a second time — that module is pure
 * (its own header: "no DB, no zipcodes"), is already the audited source of
 * truth for diesel spend elsewhere in the codebase, and is already imported
 * by client components. Its FuelSettings type carries a `factoringPct` that
 * dieselCost() does not read; we pass 0 for it, because carrier-side
 * factoring is a different concept from a brokerage fee and must never be
 * conflated with the percentage below.
 *
 * NOT wired to any settings table. dispatch_settings (where mpg/diesel price
 * live for the TMS) is a dispatch table the CRM's RLS-scoped client cannot
 * read, so the defaults below are constants the rep can override per quote.
 *
 * 2026-08-22: load/unload hours REMOVED (Brent). Billable time is drive time
 * only — miles ÷ avg speed — so there is no longer a separate "total hours"
 * distinct from drive hours, and dock time is not priced. If it ever comes
 * back it belongs here as an input, not as a fudge inside the hourly rate.
 */

export type QuoteInputs = {
  /** Loaded miles for the job. */
  miles: number;
  /** Average speed used to turn miles into drive hours. */
  avgMph: number;
  /** Truck fuel economy. */
  mpg: number;
  /** Diesel price per gallon. */
  pricePerGallon: number;
  /** Blended hourly rate for the truck + driver's time. */
  hourlyRate: number;
  /** Brokerage fee as a percentage ON TOP of the subtotal (a markup, not a
   * margin: 25 here means total = subtotal × 1.25). */
  brokeragePct: number;
};

export type QuoteBreakdown = {
  /** Miles ÷ avg speed. The ONLY billable hours — see the module note. */
  driveHours: number;
  timeCost: number;
  fuelCost: number;
  /** Time + fuel: what the carrier is paid, before the brokerage fee. */
  subtotal: number;
  brokerageFee: number;
  /** Subtotal + brokerage fee: the all-in price the shipper pays. */
  total: number;
  /** total ÷ miles — the all-in rate the shipper pays per mile. */
  shipperPerMile: number | null;
  /** subtotal ÷ miles — the carrier's base pay per mile. */
  carrierPerMile: number | null;
  /** brokerageFee ÷ miles — the broker's margin per mile. */
  brokerPerMile: number | null;
};

/**
 * Starting values. mpg/pricePerGallon come from FUEL_DEFAULTS so the
 * calculator and every other diesel figure in the codebase start from the
 * same truck; hourlyRate/brokeragePct/avgMph are this calculator's own
 * house assumptions.
 */
export const QUOTE_DEFAULTS: Omit<QuoteInputs, "miles"> = {
  // 62 mph (Brent, 2026-08-22 — was 50). A door-to-door blended average for
  // the lanes this outfit actually runs, not a legal limit: mostly interstate
  // miles, so 50 was pricing in more hours than a real run takes.
  avgMph: 62,
  mpg: FUEL_DEFAULTS.mpg,
  pricePerGallon: FUEL_DEFAULTS.ppg,
  hourlyRate: 125,
  brokeragePct: 25,
};

/** Anything non-finite or negative is treated as zero — a half-typed field
 * ("4.", "-", "") must produce a calm zero, never NaN leaking into a dollar
 * figure the rep might read as real. */
function clean(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** total ÷ miles, guarded — null (rendered "—") rather than a division by
 * zero when there are no miles yet. */
function perMile(amount: number, miles: number): number | null {
  return miles > 0 ? amount / miles : null;
}

/**
 * The whole quote, in one pass. Every division is guarded: a zero (or
 * blank) speed yields zero drive hours rather than Infinity, zero mpg
 * yields zero fuel (dieselCost's own guard), and the three per-mile rates
 * come back null rather than dividing by zero.
 *
 * The three per-mile figures are a decomposition of the SAME total, not
 * three independent calculations — carrierPerMile + brokerPerMile always
 * equals shipperPerMile, because subtotal + brokerageFee always equals
 * total. There's a test pinning that.
 */
export function computeQuote(input: QuoteInputs): QuoteBreakdown {
  const miles = clean(input.miles);
  const avgMph = clean(input.avgMph);
  const mpg = clean(input.mpg);
  const pricePerGallon = clean(input.pricePerGallon);
  const hourlyRate = clean(input.hourlyRate);
  const brokeragePct = clean(input.brokeragePct);

  const driveHours = avgMph > 0 ? miles / avgMph : 0;

  const timeCost = driveHours * hourlyRate;
  const fuelCost = dieselCost(miles, { mpg, ppg: pricePerGallon, factoringPct: 0 });

  const subtotal = timeCost + fuelCost;
  const brokerageFee = subtotal * (brokeragePct / 100);
  const total = subtotal + brokerageFee;

  return {
    driveHours,
    timeCost,
    fuelCost,
    subtotal,
    brokerageFee,
    total,
    shipperPerMile: perMile(total, miles),
    carrierPerMile: perMile(subtotal, miles),
    brokerPerMile: perMile(brokerageFee, miles),
  };
}
