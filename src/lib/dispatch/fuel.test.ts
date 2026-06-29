import { describe, it, expect } from "vitest";
import {
  dieselCost,
  deadheadMiles,
  loadedMiles,
  factoringFee,
  loadDiesel,
  loadNet,
  FUEL_DEFAULTS,
  type FuelSettings,
} from "./fuel";

// Handcrafted constants (NOT the live DB) — these mirror today's defaults.
const FUEL: FuelSettings = { mpg: 13, ppg: 4.7, factoringPct: 3 };

describe("FUEL_DEFAULTS", () => {
  it("locks in today's default constants", () => {
    expect(FUEL_DEFAULTS).toEqual({ mpg: 13, ppg: 4.7, factoringPct: 3 });
  });
});

describe("dieselCost", () => {
  it("= miles ÷ mpg × ppg", () => {
    // 130 / 13 * 4.7 = 47 exactly
    expect(dieselCost(130, FUEL)).toBeCloseTo(47, 9);
    expect(dieselCost(500, FUEL)).toBeCloseTo((500 / 13) * 4.7, 9);
  });

  it("returns 0 when miles ≤ 0", () => {
    expect(dieselCost(0, FUEL)).toBe(0);
    expect(dieselCost(-100, FUEL)).toBe(0);
  });

  it("returns 0 when miles is not finite", () => {
    expect(dieselCost(Number.NaN, FUEL)).toBe(0);
    expect(dieselCost(Number.POSITIVE_INFINITY, FUEL)).toBe(0);
  });

  it("returns 0 when mpg is 0/falsy", () => {
    expect(dieselCost(130, { ...FUEL, mpg: 0 })).toBe(0);
  });

  it("returns 0 when ppg is 0", () => {
    expect(dieselCost(130, { ...FUEL, ppg: 0 })).toBe(0);
  });
});

describe("deadheadMiles", () => {
  it("= odo_loaded − odo_assigned", () => {
    expect(deadheadMiles(1000, 1080)).toBe(80);
    expect(deadheadMiles(1000, 1000)).toBe(0);
  });

  it("is null when either reading is missing", () => {
    expect(deadheadMiles(null, 1080)).toBeNull();
    expect(deadheadMiles(1000, null)).toBeNull();
    expect(deadheadMiles(null, null)).toBeNull();
  });

  it("is null when the delta would be negative (readings out of order)", () => {
    expect(deadheadMiles(1080, 1000)).toBeNull();
  });
});

describe("loadedMiles", () => {
  it("= odo_delivered − odo_loaded when both readings exist", () => {
    expect(loadedMiles(1080, 1500, 400)).toBe(420);
  });

  it("falls back to the stored estimate when readings are missing", () => {
    expect(loadedMiles(null, 1500, 400)).toBe(400);
    expect(loadedMiles(1080, null, 400)).toBe(400);
  });

  it("falls back to the estimate when the odometer delta is negative", () => {
    expect(loadedMiles(1500, 1080, 400)).toBe(400);
  });

  it("is null when there is no delta and no estimate", () => {
    expect(loadedMiles(null, null, null)).toBeNull();
  });
});

describe("factoringFee", () => {
  it("= rate × pct ÷ 100 when the broker factors", () => {
    expect(factoringFee(2000, FUEL, true)).toBeCloseTo(60, 9);
  });

  it("is 0 when the broker does NOT factor", () => {
    expect(factoringFee(2000, FUEL, false)).toBe(0);
  });

  it("is 0 for non-positive rate or zero factoring %", () => {
    expect(factoringFee(0, FUEL, true)).toBe(0);
    expect(factoringFee(-100, FUEL, true)).toBe(0);
    expect(factoringFee(2000, { ...FUEL, factoringPct: 0 }, true)).toBe(0);
  });
});

describe("loadDiesel", () => {
  it("derives deadhead + loaded + business miles + diesel from odometer readings", () => {
    const r = loadDiesel(
      { odoAssigned: 1000, odoLoaded: 1080, odoDelivered: 1500, estimate: 400 },
      FUEL,
    );
    expect(r.deadhead).toBe(80);
    expect(r.loaded).toBe(420); // odometer delta wins over the 400 estimate
    expect(r.businessMiles).toBe(500);
    expect(r.diesel).toBeCloseTo((500 / 13) * 4.7, 9);
  });

  it("uses the estimate for loaded miles when readings are missing", () => {
    const r = loadDiesel(
      { odoAssigned: null, odoLoaded: null, odoDelivered: null, estimate: 400 },
      FUEL,
    );
    expect(r.deadhead).toBeNull();
    expect(r.loaded).toBe(400);
    expect(r.businessMiles).toBe(400);
    expect(r.diesel).toBeCloseTo((400 / 13) * 4.7, 9);
  });
});

describe("loadNet", () => {
  it("= rate − diesel − factoring − expenses (factoring broker)", () => {
    const { factoring, net } = loadNet(
      { rate: 2000, diesel: 200, expensesTotal: 50 },
      FUEL,
      true,
    );
    expect(factoring).toBeCloseTo(60, 9);
    expect(net).toBeCloseTo(2000 - 200 - 60 - 50, 9); // 1690
  });

  it("charges no factoring for a non-factoring broker", () => {
    const { factoring, net } = loadNet(
      { rate: 2000, diesel: 200, expensesTotal: 50 },
      FUEL,
      false,
    );
    expect(factoring).toBe(0);
    expect(net).toBeCloseTo(2000 - 200 - 0 - 50, 9); // 1750
  });
});
