/**
 * Trip financial rollup — the SINGLE source of truth for a trip's gross, net,
 * spent, profit %, and business mileage. Used by both the trips list (cards)
 * and the trip detail page so every number agrees.
 *
 * Net is computed with the real fuel/expense math (loadDiesel + loadNet), NOT
 * the legacy `fuel_cost` / `factoring_fee` / `misc_cost` columns on `loads`
 * (the app never populates those — reading them made the card show net == gross).
 *
 * Cancelled loads are excluded from every figure (they earn nothing at the
 * trip level). PC (personal-conveyance) diesel is intentionally NOT part of
 * net or spent — it's tracked separately on the detail page.
 */

import { loadDiesel, loadNet, type FuelSettings } from "./fuel";

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
  /** gross − diesel − factoring − expenses (the true net). */
  net: number;
  /** Total spent = gross − net = diesel + factoring + expenses. */
  spent: number;
  /** net ÷ gross × 100, or null when gross is 0 (avoid divide-by-zero). */
  profitPct: number | null;
  loadedMiles: number;
  deadheadMiles: number;
  /** Business (loaded + deadhead) diesel across the trip's loads. */
  loadDieselTotal: number;
  factoringTotal: number;
  expensesTotal: number;
};

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
): TripFinancials {
  const live = loads.filter((l) => l.status !== "cancelled");

  let gross = 0;
  let net = 0;
  let loadedMiles = 0;
  let deadheadMiles = 0;
  let loadDieselTotal = 0;
  let factoringTotal = 0;
  let expensesTotal = 0;

  for (const l of live) {
    const rate = num(l.rate);
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
    net += loadNetValue;
    loadedMiles += d.loaded ?? 0;
    deadheadMiles += d.deadhead ?? 0;
    loadDieselTotal += d.diesel;
    factoringTotal += factoring;
    expensesTotal += expenses;
  }

  const spent = gross - net;
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
  };
}
