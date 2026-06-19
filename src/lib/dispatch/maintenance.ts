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
