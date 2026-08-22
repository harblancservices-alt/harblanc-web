import { describe, expect, it } from "vitest";
import { computeQuote, QUOTE_DEFAULTS, type QuoteInputs } from "./quotePricing";

/** 620 miles at the default 62 mph is exactly 10 drive hours, so the hour
 * and time-cost figures stay whole and a regression in them is unmissable. */
function inputs(over: Partial<QuoteInputs> = {}): QuoteInputs {
  return { miles: 620, ...QUOTE_DEFAULTS, ...over };
}

describe("QUOTE_DEFAULTS", () => {
  it("starts from the shared truck (FUEL_DEFAULTS), not its own numbers", () => {
    expect(QUOTE_DEFAULTS.mpg).toBe(13);
    expect(QUOTE_DEFAULTS.pricePerGallon).toBe(4.7);
  });

  it("carries the house assumptions", () => {
    expect(QUOTE_DEFAULTS.avgMph).toBe(62);
    expect(QUOTE_DEFAULTS.loadUnloadHours).toBe(2);
    expect(QUOTE_DEFAULTS.hourlyRate).toBe(125);
    expect(QUOTE_DEFAULTS.brokeragePct).toBe(25);
  });
});

describe("computeQuote", () => {
  it("walks a 620-mile job end to end", () => {
    const q = computeQuote(inputs());
    // 620 / 62 = 10 drive hours, + 2 on the dock = 12
    expect(q.driveHours).toBe(10);
    expect(q.totalHours).toBe(12);
    // 12 h x $125
    expect(q.timeCost).toBe(1500);
    // 620 / 13 mpg x $4.70
    expect(q.fuelCost).toBeCloseTo(224.154, 3);
    expect(q.subtotal).toBeCloseTo(1724.154, 3);
    // 25% ON TOP of the subtotal (a markup, not a margin)
    expect(q.brokerageFee).toBeCloseTo(431.038, 3);
    expect(q.total).toBeCloseTo(2155.192, 3);
  });

  it("treats brokeragePct as a markup: total = subtotal x 1.25", () => {
    const q = computeQuote(inputs());
    expect(q.total).toBeCloseTo(q.subtotal * 1.25, 6);
  });

  it("derives the two per-unit rates off the total", () => {
    const q = computeQuote(inputs());
    expect(q.perMile).toBeCloseTo(q.total / 620, 6);
    expect(q.perHour).toBeCloseTo(q.total / 12, 6);
  });

  it("matches dieselCost's own formula for the fuel leg", () => {
    const q = computeQuote(inputs({ miles: 650, mpg: 10, pricePerGallon: 5 }));
    expect(q.fuelCost).toBeCloseTo((650 / 10) * 5, 6);
  });

  it("prices fewer hours at 62 mph than the old 50 mph assumption did", () => {
    const fast = computeQuote(inputs({ avgMph: 62 }));
    const slow = computeQuote(inputs({ avgMph: 50 }));
    expect(fast.totalHours).toBeLessThan(slow.totalHours);
    expect(fast.total).toBeLessThan(slow.total);
    // Fuel is a function of miles, not speed — it must NOT move.
    expect(fast.fuelCost).toBeCloseTo(slow.fuelCost, 6);
  });

  describe("divide-by-zero and half-typed input guards", () => {
    it("returns zero drive hours when speed is blank, never Infinity", () => {
      const q = computeQuote(inputs({ avgMph: 0 }));
      expect(q.driveHours).toBe(0);
      expect(q.totalHours).toBe(2);
      expect(Number.isFinite(q.total)).toBe(true);
    });

    it("returns zero fuel when mpg is blank", () => {
      const q = computeQuote(inputs({ mpg: 0 }));
      expect(q.fuelCost).toBe(0);
      expect(Number.isFinite(q.total)).toBe(true);
    });

    it("nulls the per-unit rates rather than dividing by zero", () => {
      const noMiles = computeQuote(inputs({ miles: 0 }));
      expect(noMiles.perMile).toBeNull();

      const noHours = computeQuote(inputs({ miles: 0, loadUnloadHours: 0 }));
      expect(noHours.totalHours).toBe(0);
      expect(noHours.perHour).toBeNull();
      expect(noHours.total).toBe(0);
    });

    it("never leaks NaN from a non-finite or negative field", () => {
      const q = computeQuote(
        inputs({ miles: Number.NaN, avgMph: -50, hourlyRate: Number.POSITIVE_INFINITY }),
      );
      for (const value of [q.driveHours, q.totalHours, q.timeCost, q.fuelCost, q.subtotal, q.brokerageFee, q.total]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    });

    it("charges nothing extra when the brokerage percentage is zeroed out", () => {
      const q = computeQuote(inputs({ brokeragePct: 0 }));
      expect(q.brokerageFee).toBe(0);
      expect(q.total).toBeCloseTo(q.subtotal, 6);
    });
  });
});
