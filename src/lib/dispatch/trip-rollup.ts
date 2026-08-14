/**
 * Trip financial rollup — the SINGLE source of truth for a trip's gross, net,
 * spent, profit %, and business mileage. Used by both the trips list (cards)
 * and the trip detail page so every number agrees.
 *
 * Net is computed with the real fuel/expense math (loadDiesel + loadNet), NOT
 * the legacy `fuel_cost` / `factoring_fee` / `misc_cost` columns on `loads`
 * (the app never populates those — reading them made the card show net == gross).
 *
 * Net is ALL-IN at the trip level:
 *   net = gross − (loaded/deadhead diesel + factoring + load expenses + PC diesel)
 * PC (personal-conveyance, the empty miles between loads + the home bookends)
 * diesel is folded in here — this is a TRIP-level concept, so per-load net
 * (loadNet, used by the load page / board) is unchanged.
 *
 * Cancelled loads are excluded from every dollar figure (they earn nothing at
 * the trip level).
 */

import { loadDiesel, loadNet, dieselCost, type FuelSettings } from "./fuel";

export type TripRollupLoad = {
  id: string;
  rate: number | string | null;
  loaded_miles: number | null;
  odo_assigned: number | null;
  odo_loaded: number | null;
  odo_delivered: number | null;
  broker_id: string | null;
  status: string;
};

export type TripFinancials = {
  /** Count of non-cancelled loads on the trip. */
  loads: number;
  /** Sum of load rates. */
  gross: number;
  /** gross − (load diesel + factoring + expenses + PC diesel) — all-in net. */
  net: number;
  /** Total spent = gross − net = load diesel + factoring + expenses + PC diesel. */
  spent: number;
  /** net ÷ gross × 100, or null when gross is 0 (avoid divide-by-zero). */
  profitPct: number | null;
  loadedMiles: number;
  deadheadMiles: number;
  /** Business (loaded + deadhead) diesel across the trip's loads. */
  loadDieselTotal: number;
  factoringTotal: number;
  expensesTotal: number;
  /** Personal-conveyance (empty) miles for the trip. */
  pcMiles: number;
  /** PC diesel — now included in net/spent. */
  pcDiesel: number;
};

/**
 * Personal-conveyance miles for a trip: the empty gaps where the truck moved
 * but no load was on. Order the loads by their assigned odometer; PC is
 * start-odometer → first assigned, each delivered → next assigned, and last
 * delivered → end-odometer. Only non-negative gaps count.
 */
function computePcMiles(
  loads: TripRollupLoad[],
  startOdometer: number | null,
  endOdometer: number | null,
): number {
  const seq = loads
    .filter((l) => l.odo_assigned != null && l.odo_delivered != null)
    .sort((a, b) => (a.odo_assigned ?? 0) - (b.odo_assigned ?? 0));
  let pc = 0;
  if (startOdometer != null && seq.length > 0) {
    const g = (seq[0].odo_assigned ?? 0) - startOdometer;
    if (g > 0) pc += g;
  }
  for (let i = 1; i < seq.length; i++) {
    const g = (seq[i].odo_assigned ?? 0) - (seq[i - 1].odo_delivered ?? 0);
    if (g > 0) pc += g;
  }
  if (endOdometer != null && seq.length > 0) {
    const g = endOdometer - (seq[seq.length - 1].odo_delivered ?? 0);
    if (g > 0) pc += g;
  }
  return pc;
}

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function computeTripFinancials(
  loads: TripRollupLoad[],
  fuel: FuelSettings,
  factoringIds: Set<string>,
  expByLoad: Map<string, number>,
  tripOdometer?: { start: number | null; end: number | null },
): TripFinancials {
  const live = loads.filter((l) => l.status !== "tonu");

  let gross = 0;
  let loadNetSum = 0; // sum of per-load nets (before PC)
  let loadedMiles = 0;
  let deadheadMiles = 0;
  let loadDieselTotal = 0;
  let factoringTotal = 0;
  let expensesTotal = 0;

  for (const l of live) {
    const rate = num(l.rate);
    // Miles/diesel — progressive model, same basis for DISPLAY (trip's Total
    // mi/Deadhead mi sums) and the PROFIT deduction: stage 1 (no odometer)
    // prices the full ZIP-route estimate, stage 2 (picked up) blends real
    // deadhead + estimated loaded leg, stage 3 (delivered) is fully real —
    // loadedMiles() already prefers the real delta once both readings exist.
    const d = loadDiesel(
      {
        odoAssigned: l.odo_assigned,
        odoLoaded: l.odo_loaded,
        odoDelivered: l.odo_delivered,
        estimate: l.loaded_miles,
      },
      fuel,
    );
    const brokerFactoring =
      l.broker_id != null && factoringIds.has(l.broker_id);
    const expenses = expByLoad.get(l.id) ?? 0;
    const { factoring, net: loadNetValue } = loadNet(
      { rate, diesel: d.diesel, expensesTotal: expenses },
      fuel,
      brokerFactoring,
    );

    gross += rate;
    loadNetSum += loadNetValue;
    loadedMiles += d.loaded ?? 0;
    deadheadMiles += d.deadhead ?? 0;
    loadDieselTotal += d.diesel;
    factoringTotal += factoring;
    expensesTotal += expenses;
  }

  // PC diesel is a TRIP-level cost — fold it into net so net is all-in. PC
  // counts gaps over ALL loads with odometer readings (incl. cancelled), the
  // same basis the detail page has always used to show the PC bucket.
  const pcMiles = computePcMiles(
    loads,
    tripOdometer?.start ?? null,
    tripOdometer?.end ?? null,
  );
  const pcDiesel = dieselCost(pcMiles, fuel);

  const net = loadNetSum - pcDiesel;
  const spent = gross - net; // = loadDiesel + factoring + expenses + PC diesel
  const profitPct = gross > 0 ? (net / gross) * 100 : null;

  return {
    loads: live.length,
    gross,
    net,
    spent,
    profitPct,
    loadedMiles,
    deadheadMiles,
    loadDieselTotal,
    factoringTotal,
    expensesTotal,
    pcMiles,
    pcDiesel,
  };
}
