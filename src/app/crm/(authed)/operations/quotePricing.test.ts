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
    expect(QUOTE_DEFAULTS.hourlyRate).toBe(125);
    expect(QUOTE_DEFAULTS.brokeragePct).toBe(25);
  });

  it("has no load/unload assumption — billable time is drive time only", () => {
    expect(QUOTE_DEFAULTS).not.toHaveProperty("loadUnloadHours");
  });
});

describe("computeQuote", () => {
  it("walks a 620-mile job end to end", () => {
    const q = computeQuote(inputs());
    // 620 / 62 = 10 drive hours. No dock time is priced.
    expect(q.driveHours).toBe(10);
    // 10 h x $125
    expect(q.timeCost).toBe(1250);
    // 620 / 13 mpg x $4.70
    expect(q.fuelCost).toBeCloseTo(224.154, 3);
    expect(q.subtotal).toBeCloseTo(1474.154, 3);
    // 25% ON TOP of the subtotal (a markup, not a margin)
    expect(q.brokerageFee).toBeCloseTo(368.538, 3);
    expect(q.total).toBeCloseTo(1842.692, 3);
  });

  it("bills drive hours only — no dock time anywhere in the total", () => {
    const q = computeQuote(inputs({ miles: 620, avgMph: 62, hourlyRate: 125 }));
    expect(q.timeCost).toBe(q.driveHours * 125);
  });

  it("treats brokeragePct as a markup: total = subtotal x 1.25", () => {
    const q = computeQuote(inputs());
    expect(q.total).toBeCloseTo(q.subtotal * 1.25, 6);
  });

  it("matches dieselCost's own formula for the fuel leg", () => {
    const q = computeQuote(inputs({ miles: 650, mpg: 10, pricePerGallon: 5 }));
    expect(q.fuelCost).toBeCloseTo((650 / 10) * 5, 6);
  });

  it("prices fewer hours at 62 mph than the old 50 mph assumption did", () => {
    const fast = computeQuote(inputs({ avgMph: 62 }));
    const slow = computeQuote(inputs({ avgMph: 50 }));
    expect(fast.driveHours).toBeLessThan(slow.driveHours);
    expect(fast.total).toBeLessThan(slow.total);
    // Fuel is a function of miles, not speed — it must NOT move.
    expect(fast.fuelCost).toBeCloseTo(slow.fuelCost, 6);
  });

  describe("the three per-mile rates", () => {
    it("derives each off its own leg of the same total", () => {
      const q = computeQuote(inputs());
      expect(q.shipperPerMile).toBeCloseTo(q.total / 620, 6);
      expect(q.carrierPerMile).toBeCloseTo(q.subtotal / 620, 6);
      expect(q.brokerPerMile).toBeCloseTo(q.brokerageFee / 620, 6);
    });

    it("adds up: carrier + broker = shipper", () => {
      const q = computeQuote(inputs());
      expect((q.carrierPerMile as number) + (q.brokerPerMile as number)).toBeCloseTo(
        q.shipperPerMile as number,
        6,
      );
    });

    it("still adds up on a lane with awkward numbers", () => {
      const q = computeQuote(inputs({ miles: 437, avgMph: 58, mpg: 7.4, pricePerGallon: 5.13, brokeragePct: 18 }));
      expect((q.carrierPerMile as number) + (q.brokerPerMile as number)).toBeCloseTo(
        q.shipperPerMile as number,
        6,
      );
    });

    it("all three go null when there are no miles to divide by", () => {
      const q = computeQuote(inputs({ miles: 0 }));
      expect(q.shipperPerMile).toBeNull();
      expect(q.carrierPerMile).toBeNull();
      expect(q.brokerPerMile).toBeNull();
    });
  });

  describe("divide-by-zero and half-typed input guards", () => {
    it("returns zero drive hours when speed is blank, never Infinity", () => {
      const q = computeQuote(inputs({ avgMph: 0 }));
      expect(q.driveHours).toBe(0);
      expect(q.timeCost).toBe(0);
      expect(Number.isFinite(q.total)).toBe(true);
    });

    it("returns zero fuel when mpg is blank", () => {
      const q = computeQuote(inputs({ mpg: 0 }));
      expect(q.fuelCost).toBe(0);
      expect(Number.isFinite(q.total)).toBe(true);
    });

    it("never leaks NaN from a non-finite or negative field", () => {
      const q = computeQuote(
        inputs({ miles: Number.NaN, avgMph: -50, hourlyRate: Number.POSITIVE_INFINITY }),
      );
      for (const value of [q.driveHours, q.timeCost, q.fuelCost, q.subtotal, q.brokerageFee, q.total]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    });

    it("charges nothing extra when the brokerage percentage is zeroed out", () => {
      const q = computeQuote(inputs({ brokeragePct: 0 }));
      expect(q.brokerageFee).toBe(0);
      expect(q.total).toBeCloseTo(q.subtotal, 6);
      expect(q.brokerPerMile).toBe(0);
      expect(q.carrierPerMile).toBeCloseTo(q.shipperPerMile as number, 6);
    });
  });
});
