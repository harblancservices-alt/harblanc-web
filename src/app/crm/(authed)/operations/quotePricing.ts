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
 */

export type QuoteInputs = {
  /** Loaded miles for the job. */
  miles: number;
  /** Average speed used to turn miles into drive hours. */
  avgMph: number;
  /** Hours on the dock, both ends, that aren't driving. */
  loadUnloadHours: number;
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
  driveHours: number;
  totalHours: number;
  timeCost: number;
  fuelCost: number;
  subtotal: number;
  brokerageFee: number;
  total: number;
  /** total ÷ miles — null when there are no miles to divide by. */
  perMile: number | null;
  /** total ÷ totalHours — null when there are no hours to divide by. */
  perHour: number | null;
};

/**
 * Starting values. mpg/pricePerGallon come from FUEL_DEFAULTS so the
 * calculator and every other diesel figure in the codebase start from the
 * same truck; hourlyRate/brokeragePct/avgMph/loadUnloadHours are this
 * calculator's own house assumptions.
 */
export const QUOTE_DEFAULTS: Omit<QuoteInputs, "miles"> = {
  // 62 mph (Brent, 2026-08-22 — was 50). A door-to-door blended average for
  // the lanes this outfit actually runs, not a legal limit: mostly interstate
  // miles, so 50 was pricing in more hours than a real run takes.
  avgMph: 62,
  loadUnloadHours: 2,
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

/**
 * The whole quote, in one pass. Every division is guarded: a zero (or
 * blank) speed yields zero drive hours rather than Infinity, zero mpg
 * yields zero fuel (dieselCost's own guard), and the two derived per-unit
 * rates come back null rather than dividing by zero.
 */
export function computeQuote(input: QuoteInputs): QuoteBreakdown {
  const miles = clean(input.miles);
  const avgMph = clean(input.avgMph);
  const loadUnloadHours = clean(input.loadUnloadHours);
  const mpg = clean(input.mpg);
  const pricePerGallon = clean(input.pricePerGallon);
  const hourlyRate = clean(input.hourlyRate);
  const brokeragePct = clean(input.brokeragePct);

  const driveHours = avgMph > 0 ? miles / avgMph : 0;
  const totalHours = driveHours + loadUnloadHours;

  const timeCost = totalHours * hourlyRate;
  const fuelCost = dieselCost(miles, { mpg, ppg: pricePerGallon, factoringPct: 0 });

  const subtotal = timeCost + fuelCost;
  const brokerageFee = subtotal * (brokeragePct / 100);
  const total = subtotal + brokerageFee;

  return {
    driveHours,
    totalHours,
    timeCost,
    fuelCost,
    subtotal,
    brokerageFee,
    total,
    perMile: miles > 0 ? total / miles : null,
    perHour: totalHours > 0 ? total / totalHours : null,
  };
}
