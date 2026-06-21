/**
 * Maintenance math — shared by the Maintenance page and the dashboard
 * oil/fuel-filter widget so the status / next-due / progress all agree.
 *
 * Pure functions, no DB. The "current odometer" is the highest reading
 * across non-deleted loads (computed by the caller).
 */

export type MaintStatus = "overdue" | "soon" | "ok" | "baseline";

export type MaintComputed = {
  status: MaintStatus;
  neverServiced: boolean;
  nextDue: number | null;
  milesRemaining: number | null;
  /** 0–100: miles since last service ÷ interval, clamped. 0 if never serviced. */
  pct: number;
};

/** Highest odometer reading across the given load rows (0 if none). */
export function currentOdoFromLoads(
  rows: ReadonlyArray<{
    odo_assigned: number | null;
    odo_loaded: number | null;
    odo_delivered: number | null;
  }> | null,
): number {
  let max = 0;
  for (const l of rows ?? []) {
    max = Math.max(max, l.odo_assigned ?? 0, l.odo_loaded ?? 0, l.odo_delivered ?? 0);
  }
  return max;
}

/**
 * Lowest positive odometer reading across the given load rows (null if none).
 * Zeros/nulls are ignored — they'd otherwise falsely peg the start at 0.
 */
export function earliestOdoFromLoads(
  rows: ReadonlyArray<{
    odo_assigned: number | null;
    odo_loaded: number | null;
    odo_delivered: number | null;
  }> | null,
): number | null {
  let min: number | null = null;
  for (const l of rows ?? []) {
    for (const v of [l.odo_assigned, l.odo_loaded, l.odo_delivered]) {
      if (v != null && v > 0) min = min == null ? v : Math.min(min, v);
    }
  }
  return min;
}

export type MaintCostPerMile = {
  /** Lifetime maintenance spend (sum of service totals). */
  totalSpend: number;
  /** Miles between the earliest known odometer and the current odometer. */
  milesDriven: number | null;
  /** Dollars of maintenance per mile driven. Null when it can't be computed. */
  costPerMile: number | null;
};

/**
 * Maintenance cost-per-mile = total spend ÷ miles driven.
 *
 * `earliestOdo` is the smaller of the earliest load odometer and the earliest
 * logged service odometer (the caller picks it). Returns costPerMile = null
 * when there's no spend yet or miles-driven is 0/unknown, so the UI can show
 * "—" instead of dividing by zero.
 *
 * Kept here (not inline in the page) so the rate-check tool can reuse the same
 * cost basis later without re-deriving it.
 */
export function computeCostPerMile(
  totalSpend: number,
  currentOdo: number,
  earliestOdo: number | null,
): MaintCostPerMile {
  const milesDriven =
    earliestOdo != null && currentOdo > earliestOdo
      ? currentOdo - earliestOdo
      : null;
  const costPerMile =
    milesDriven != null && milesDriven > 0 && totalSpend > 0
      ? totalSpend / milesDriven
      : null;
  return { totalSpend, milesDriven, costPerMile };
}

export function computeMaintenance(
  intervalMiles: number,
  lastServiceOdo: number | null,
  currentOdo: number,
): MaintComputed {
  const neverServiced = lastServiceOdo == null;
  const nextDue = neverServiced ? null : lastServiceOdo + intervalMiles;
  const milesRemaining = nextDue == null ? null : nextDue - currentOdo;

  // due soon = within 1,000 mi OR past 90% of the interval.
  const soonThreshold = Math.max(1000, Math.round(intervalMiles * 0.1));

  let status: MaintStatus;
  if (neverServiced) status = "baseline";
  else if ((milesRemaining as number) <= 0) status = "overdue";
  else if ((milesRemaining as number) <= soonThreshold) status = "soon";
  else status = "ok";

  const milesSince = neverServiced
    ? 0
    : Math.max(0, currentOdo - (lastServiceOdo as number));
  const pct =
    neverServiced || intervalMiles <= 0
      ? 0
      : Math.max(0, Math.min(100, (milesSince / intervalMiles) * 100));

  return { status, neverServiced, nextDue, milesRemaining, pct };
}
