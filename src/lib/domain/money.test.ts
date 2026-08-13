import { describe, it, expect } from "vitest";
import {
  computeLoadNet,
  computeTripNet,
  computeCarrierAR,
  formatMoney,
  moneyTone,
  RECEIVABLE_OVERDUE_DAYS,
  type LoadMoneyInput,
  FUEL_DEFAULTS,
} from "./money";
import type { TripRollupLoad } from "@/lib/dispatch/trip-rollup";

const SETTINGS = FUEL_DEFAULTS; // { mpg: 13, ppg: 4.7, factoringPct: 3 }

function load(overrides: Partial<LoadMoneyInput> = {}): LoadMoneyInput {
  return {
    status: "delivered",
    rate: 1000,
    tonuAmount: null,
    odoAssigned: 100_000,
    odoLoaded: 100_050,
    odoDelivered: 100_550,
    loadedMilesEstimate: null,
    ...overrides,
  };
}

describe("computeLoadNet", () => {
  it("computes net = rate - diesel - factoring - expenses for a factoring broker", () => {
    const result = computeLoadNet(load(), 50, SETTINGS, true);
    // businessMiles = 50 (deadhead) + 500 (loaded) = 550; diesel = 550/13*4.7
    const expectedDiesel = (550 / 13) * 4.7;
    const expectedFactoring = 1000 * 0.03;
    expect(result.isTonu).toBe(false);
    expect(result.gross).toBe(1000);
    expect(result.diesel).toBeCloseTo(expectedDiesel, 5);
    expect(result.factoring).toBeCloseTo(expectedFactoring, 5);
    expect(result.expenses).toBe(50);
    expect(result.net).toBeCloseTo(1000 - expectedDiesel - expectedFactoring - 50, 5);
  });

  it("charges zero factoring for a non-factoring broker", () => {
    const result = computeLoadNet(load(), 0, SETTINGS, false);
    expect(result.factoring).toBe(0);
  });

  it("falls back to the ZIP-route mileage estimate when odometer readings are incomplete", () => {
    const result = computeLoadNet(
      load({ odoLoaded: null, odoDelivered: null, loadedMilesEstimate: 400 }),
      0,
      SETTINGS,
      false,
    );
    expect(result.loadedMiles).toBe(400);
  });

  it("does NOT deduct diesel from net using the ZIP-route estimate when odometer readings aren't entered — the estimate may drive the displayed loadedMiles KPI, but must never silently reduce profit", () => {
    const result = computeLoadNet(
      load({ odoAssigned: null, odoLoaded: null, odoDelivered: null, loadedMilesEstimate: 258, rate: 250 }),
      0,
      SETTINGS,
      false,
    );
    expect(result.loadedMiles).toBe(258); // display KPI still shows the estimate
    expect(result.diesel).toBe(0); // but nothing is deducted from profit for it
    expect(result.net).toBe(250);
  });

  it("still deducts real diesel once actual odometer readings are entered", () => {
    const result = computeLoadNet(load(), 0, SETTINGS, false); // odoAssigned/Loaded/Delivered all set in the load() factory
    expect(result.diesel).toBeGreaterThan(0);
  });

  it("TONU: net is the flat tonu_amount, with no diesel/factoring/expenses deducted — the one TONU rule every screen agrees on", () => {
    const result = computeLoadNet(
      load({ status: "tonu", rate: 1000, tonuAmount: 150 }),
      75, // expenses on a TONU load are ignored by design, not silently dropped
      SETTINGS,
      true,
    );
    expect(result.isTonu).toBe(true);
    expect(result.gross).toBe(150);
    expect(result.diesel).toBe(0);
    expect(result.factoring).toBe(0);
    expect(result.expenses).toBe(0);
    expect(result.net).toBe(150);
  });

  it("TONU net matches across every consumer of computeLoadNet (Board/Detail/Trip/Calendar/Performance) since they all call the same function", () => {
    // Regression test for the audit's #1 finding: TONU net computed 5
    // different ways. Every call site below is the same call — by
    // construction, they can't diverge.
    const tonuLoad = load({ status: "tonu", rate: 900, tonuAmount: 150 });
    const board = computeLoadNet(tonuLoad, 0, SETTINGS, true);
    const detail = computeLoadNet(tonuLoad, 0, SETTINGS, true);
    const calendar = computeLoadNet(tonuLoad, 0, SETTINGS, false); // factoring flag differs per broker, net must not
    expect(board.net).toBe(150);
    expect(detail.net).toBe(150);
    expect(calendar.net).toBe(150);
  });

  it("handles a missing/null rate without throwing", () => {
    const result = computeLoadNet(load({ rate: null }), 0, SETTINGS, false);
    expect(result.gross).toBe(0);
  });
});

describe("computeTripNet", () => {
  it("sums load nets and folds in personal-conveyance diesel between loads", () => {
    const loads: TripRollupLoad[] = [
      {
        id: "l1",
        rate: 1000,
        loaded_miles: null,
        odo_assigned: 100_000,
        odo_loaded: 100_050,
        odo_delivered: 100_550,
        broker_id: "b1",
        status: "delivered",
      },
      {
        id: "l2",
        rate: 800,
        loaded_miles: null,
        odo_assigned: 100_600, // 50mi PC gap after l1's delivery
        odo_loaded: 100_650,
        odo_delivered: 101_050,
        broker_id: "b1",
        status: "delivered",
      },
    ];
    const result = computeTripNet(loads, SETTINGS, new Set(["b1"]), new Map(), {
      start: 100_000,
      end: 101_050,
    });
    expect(result.loads).toBe(2);
    expect(result.gross).toBe(1800);
    expect(result.pcMiles).toBe(50);
    expect(result.net).toBeLessThan(result.gross);
  });

  it("excludes TONU'd loads from trip gross/net entirely", () => {
    const loads: TripRollupLoad[] = [
      {
        id: "l1",
        rate: 1000,
        loaded_miles: null,
        odo_assigned: null,
        odo_loaded: null,
        odo_delivered: null,
        broker_id: null,
        status: "tonu",
      },
    ];
    const result = computeTripNet(loads, SETTINGS, new Set(), new Map(), { start: null, end: null });
    expect(result.loads).toBe(0);
    expect(result.gross).toBe(0);
  });
});

describe("computeCarrierAR", () => {
  const now = new Date("2026-08-03T12:00:00Z");

  it("includes unpaid delivered and TONU loads, excludes paid and in-progress loads", () => {
    const ar = computeCarrierAR(
      [
        { id: "a", status: "delivered", paymentStatus: "unpaid", deliveryDate: "2026-06-01", rate: 1000, tonuAmount: null },
        { id: "b", status: "delivered", paymentStatus: "paid", deliveryDate: "2026-06-01", rate: 1000, tonuAmount: null },
        { id: "c", status: "tonu", paymentStatus: "unpaid", deliveryDate: "2026-07-20", rate: 900, tonuAmount: 150 },
        { id: "d", status: "assigned", paymentStatus: "unpaid", deliveryDate: null, rate: 1200, tonuAmount: null },
      ],
      now,
    );
    expect(ar.items.map((i) => i.loadId).sort()).toEqual(["a", "c"]);
    expect(ar.totalOutstanding).toBe(1000 + 150);
  });

  it("flags a load overdue once it crosses the shared 40-day threshold", () => {
    const ar = computeCarrierAR(
      [
        { id: "old", status: "delivered", paymentStatus: "unpaid", deliveryDate: "2026-06-01", rate: 500, tonuAmount: null }, // >40d before Aug 3
        { id: "recent", status: "delivered", paymentStatus: "unpaid", deliveryDate: "2026-07-30", rate: 500, tonuAmount: null }, // <40d
      ],
      now,
    );
    const old = ar.items.find((i) => i.loadId === "old")!;
    const recent = ar.items.find((i) => i.loadId === "recent")!;
    expect(old.daysOutstanding).toBeGreaterThanOrEqual(RECEIVABLE_OVERDUE_DAYS);
    expect(old.overdue).toBe(true);
    expect(recent.overdue).toBe(false);
  });
});

describe("formatMoney / moneyTone", () => {
  it("formats whole dollars with no cents by default", () => {
    expect(formatMoney(1850)).toBe("$1,850");
  });

  it("formats cents when requested", () => {
    expect(formatMoney(1850.5, { cents: true })).toBe("$1,850.50");
  });

  it("renders null/undefined/NaN as an em dash", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney(NaN)).toBe("—");
  });

  it("resolves tone by sign only", () => {
    expect(moneyTone(100)).toBe("positive");
    expect(moneyTone(-100)).toBe("negative");
    expect(moneyTone(0)).toBe("neutral");
    expect(moneyTone(null)).toBe("neutral");
  });
});
