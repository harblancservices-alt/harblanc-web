import { describe, it, expect } from "vitest";
import { computeTripFinancials, type TripRollupLoad } from "./trip-rollup";
import { loadDiesel, loadNet, dieselCost, type FuelSettings } from "./fuel";

const FUEL: FuelSettings = { mpg: 13, ppg: 4.7, factoringPct: 3 };

// ── Small handcrafted fixture (NOT the live DB) ───────────────────────────────
// B1 factors, B2 does not.
const B1 = "broker-factoring";
const B2 = "broker-plain";
const factoringIds = new Set<string>([B1]);

// L1: factoring broker, full odometer chain, $50 of expenses, DELIVERED
// L2: non-factoring broker, full odometer chain, no expenses, DELIVERED
// L3: TONU (cancelled) — must be excluded from every dollar figure
const LOADS: TripRollupLoad[] = [
  {
    id: "L1",
    rate: 2000,
    loaded_miles: 400,
    odo_assigned: 1000,
    odo_loaded: 1080,
    odo_delivered: 1500,
    broker_id: B1,
    status: "delivered",
  },
  {
    id: "L2",
    rate: 1500,
    loaded_miles: 380,
    odo_assigned: 1500,
    odo_loaded: 1520,
    odo_delivered: 1900,
    broker_id: B2,
    status: "delivered",
  },
  {
    id: "L3",
    rate: 999,
    loaded_miles: null,
    odo_assigned: null,
    odo_loaded: null,
    odo_delivered: null,
    broker_id: B1,
    status: "tonu",
  },
];

const expByLoad = new Map<string, number>([["L1", 50]]);
const tripOdo = { start: 900, end: 2000 };

describe("computeTripFinancials", () => {
  const fin = computeTripFinancials(LOADS, FUEL, factoringIds, expByLoad, tripOdo);

  it("counts only non-TONU loads", () => {
    expect(fin.loads).toBe(2);
  });

  it("gross = Σ rate of non-TONU loads (TONU L3 excluded)", () => {
    expect(fin.gross).toBe(3500); // 2000 + 1500, not 999
  });

  it("computes PC miles from the odometer gaps (start→first, between, last→end)", () => {
    // start→first assigned: 1000−900 = 100
    // between L1.delivered(1500)→L2.assigned(1500) = 0
    // last delivered(1900)→end(2000) = 100
    expect(fin.pcMiles).toBe(200);
    expect(fin.pcDiesel).toBeCloseTo(dieselCost(200, FUEL), 9);
  });

  it("net = Σ per-load net − PC diesel", () => {
    const l1 = loadDiesel(
      { odoAssigned: 1000, odoLoaded: 1080, odoDelivered: 1500, estimate: 400 },
      FUEL,
    );
    const l2 = loadDiesel(
      { odoAssigned: 1500, odoLoaded: 1520, odoDelivered: 1900, estimate: 380 },
      FUEL,
    );
    const n1 = loadNet({ rate: 2000, diesel: l1.diesel, expensesTotal: 50 }, FUEL, true).net;
    const n2 = loadNet({ rate: 1500, diesel: l2.diesel, expensesTotal: 0 }, FUEL, false).net;
    const expectedNet = n1 + n2 - dieselCost(200, FUEL);
    expect(fin.net).toBeCloseTo(expectedNet, 9);
  });

  it("spent = gross − net, to the cent", () => {
    expect(fin.spent).toBeCloseTo(fin.gross - fin.net, 9);
  });

  it("spent = Σ(diesel + factoring + expenses) + PC diesel, to the cent", () => {
    const components =
      fin.loadDieselTotal + fin.factoringTotal + fin.expensesTotal + fin.pcDiesel;
    expect(fin.spent).toBeCloseTo(components, 9);
  });

  it("profit % = net ÷ gross × 100", () => {
    expect(fin.profitPct).not.toBeNull();
    expect(fin.profitPct as number).toBeCloseTo((fin.net / fin.gross) * 100, 9);
  });

  it("only the factoring broker's load incurs a factoring fee", () => {
    // Only L1 ($2000 @ 3%) factors → 60. L2 is non-factoring → 0.
    expect(fin.factoringTotal).toBeCloseTo(60, 9);
  });
});

describe("computeTripFinancials — divide-by-zero / empty", () => {
  it("returns gross 0 and profit % null (no division) when there are no loads", () => {
    const fin = computeTripFinancials([], FUEL, factoringIds, new Map());
    expect(fin.gross).toBe(0);
    expect(fin.net).toBe(0);
    expect(fin.spent).toBe(0);
    expect(fin.profitPct).toBeNull();
  });

  it("returns gross 0 and profit % null when every load is TONU'd", () => {
    const allCancelled = LOADS.map((l) => ({ ...l, status: "tonu" }));
    const fin = computeTripFinancials(allCancelled, FUEL, factoringIds, expByLoad, tripOdo);
    expect(fin.gross).toBe(0);
    expect(fin.profitPct).toBeNull();
  });
});

// ── Progressive fuel model (Brent-confirmed) ──────────────────────────────────
// A trip's loadDieselTotal/loadedMiles/deadheadMiles must track the same
// 3-stage basis as computeLoadNet: no-odometer → full ZIP estimate; picked up
// → real deadhead + estimated loaded leg; delivered → fully real.
describe("computeTripFinancials — progressive fuel model", () => {
  it("stage 1 load (no odometer readings) contributes its full ZIP-route estimate to diesel, not $0", () => {
    const loads: TripRollupLoad[] = [
      {
        id: "P1",
        rate: 250,
        loaded_miles: 258,
        odo_assigned: null,
        odo_loaded: null,
        odo_delivered: null,
        broker_id: null,
        status: "assigned",
      },
    ];
    const fin = computeTripFinancials(loads, FUEL, factoringIds, new Map());
    const expectedDiesel = (258 / 13) * 4.7;
    expect(fin.loadedMiles).toBe(258);
    expect(fin.deadheadMiles).toBe(0);
    expect(fin.loadDieselTotal).toBeCloseTo(expectedDiesel, 5);
    expect(fin.loadDieselTotal).not.toBe(0);
  });

  it("stage 2 load (picked up, not delivered) blends real deadhead with the estimated loaded leg", () => {
    const loads: TripRollupLoad[] = [
      {
        id: "P2",
        rate: 250,
        loaded_miles: 258,
        odo_assigned: 100_000,
        odo_loaded: 100_012, // 12 real deadhead miles
        odo_delivered: null,
        broker_id: null,
        status: "loaded",
      },
    ];
    const fin = computeTripFinancials(loads, FUEL, factoringIds, new Map());
    const expectedDiesel = (270 / 13) * 4.7; // 12 real + 258 estimate
    expect(fin.deadheadMiles).toBe(12);
    expect(fin.loadedMiles).toBe(258);
    expect(fin.loadDieselTotal).toBeCloseTo(expectedDiesel, 5);
  });
});

// ── GOLDEN CANARY ─────────────────────────────────────────────────────────────
// The single invariant that catches future drift between per-load net (used on
// the load card/board) and trip net (which folds in PC diesel):
//   Σ per-load net  ===  trip net + PC diesel
// and  trip spent === gross − net.
describe("golden cross-check: per-load nets reconcile with the trip rollup", () => {
  it("Σ per-load net = trip net + PC diesel, and spent = gross − net", () => {
    const fin = computeTripFinancials(LOADS, FUEL, factoringIds, expByLoad, tripOdo);

    // Independently sum each live load's net the way the load card/board does.
    const live = LOADS.filter((l) => l.status !== "tonu");
    const sumPerLoadNet = live.reduce((s, l) => {
      const d = loadDiesel(
        {
          odoAssigned: l.odo_assigned,
          odoLoaded: l.odo_loaded,
          odoDelivered: l.odo_delivered,
          estimate: l.loaded_miles,
        },
        FUEL,
      );
      const brokerFactoring = l.broker_id != null && factoringIds.has(l.broker_id);
      const expenses = expByLoad.get(l.id) ?? 0;
      const rate = typeof l.rate === "number" ? l.rate : Number(l.rate);
      return s + loadNet({ rate, diesel: d.diesel, expensesTotal: expenses }, FUEL, brokerFactoring).net;
    }, 0);

    expect(sumPerLoadNet).toBeCloseTo(fin.net + fin.pcDiesel, 8);
    expect(fin.spent).toBeCloseTo(fin.gross - fin.net, 8);
  });
});
