/**
 * Operations → Active Loads: the row shape and every pure derivation the
 * Load Center does on it — doc status, "needs paperwork", search, sort.
 *
 * A PLAIN module (no React, no "use server", no DB): the server page builds
 * `LoadRow[]` from the EXISTING shipments data layer and hands it to a client
 * component, and everything in between is testable without a browser.
 *
 * NO MONEY, ANYWHERE. `LoadRow` deliberately has no customerRate,
 * carrierRate or margin field — not hidden in the UI, not present in the
 * type. Sales agents see this screen, and margin is not theirs to see, so
 * the safest place to enforce that is the shape itself: there is no field to
 * accidentally render. crm_shipments.customer_rate/carrier_rate exist in the
 * data layer (shipments/types.ts) and are simply never mapped in.
 */

/** The lifecycle position of a shipment's most recent RC or BOL, or null
 * when none has ever been created for it. */
export type DocState = string | null;

export type LoadRow = {
  id: string;
  loadNumber: string;
  status: string;
  customerName: string | null;
  shipperCity: string | null;
  shipperState: string | null;
  consigneeCity: string | null;
  consigneeState: string | null;
  carrierName: string | null;
  pickupAt: string | null;
  deliveryAt: string | null;
  /** Status of the newest Rate Confirmation on this load; null if none. */
  rcStatus: DocState;
  /** Status of the newest Bill of Lading on this load; null if none. */
  bolStatus: DocState;
};

export const LOAD_FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "dispatched", label: "Dispatched" },
  { key: "in_transit", label: "In transit" },
  { key: "paperwork", label: "Needs paperwork" },
] as const;

export type LoadFilterKey = (typeof LOAD_FILTERS)[number]["key"];

/**
 * A load "needs paperwork" when anything required to actually run it is
 * still missing: no carrier assigned, no rate confirmation, or no bill of
 * lading. This is the one filter that isn't just a status — it's the working
 * queue, the reason a rep opens this screen at all.
 *
 * A CANCELLED document counts as missing on purpose: a load whose only RC
 * was cancelled has no live rate confirmation, and calling that "done" would
 * hide exactly the load someone needs to redo.
 */
export function needsPaperwork(row: LoadRow): boolean {
  return !row.carrierName || !isLiveDoc(row.rcStatus) || !isLiveDoc(row.bolStatus);
}

/** A document counts as present only if it exists and hasn't been cancelled. */
export function isLiveDoc(status: DocState): boolean {
  if (!status) return false;
  return status.trim().toLowerCase() !== "cancelled";
}

export function matchesFilter(row: LoadRow, filter: LoadFilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "paperwork") return needsPaperwork(row);
  return (row.status || "").trim().toLowerCase() === filter;
}

/** Free-text search over load #, customer and carrier (the three things a
 * rep actually has in hand when they come looking), plus the lane, which is
 * free to include and often how a load is remembered. */
export function matchesQuery(row: LoadRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    row.loadNumber,
    row.customerName,
    row.carrierName,
    row.shipperCity,
    row.shipperState,
    row.consigneeCity,
    row.consigneeState,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export const SORT_KEYS = ["loadNumber", "customer", "carrier", "pickup", "delivery", "status"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

/** Status sorts by lifecycle position, not alphabetically — "dispatched"
 * before "in_transit" is meaningful, `d` before `i` is an accident. */
const STATUS_ORDER: Record<string, number> = {
  open: 0,
  dispatched: 1,
  in_transit: 2,
  delivered: 3,
  invoiced: 4,
  cancelled: 5,
};

function sortValue(row: LoadRow, key: SortKey): string | number | null {
  switch (key) {
    case "loadNumber":
      return row.loadNumber.toLowerCase();
    case "customer":
      return row.customerName?.toLowerCase() ?? null;
    case "carrier":
      return row.carrierName?.toLowerCase() ?? null;
    case "pickup":
      return row.pickupAt;
    case "delivery":
      return row.deliveryAt;
    case "status":
      return STATUS_ORDER[(row.status || "").trim().toLowerCase()] ?? 99;
  }
}

/**
 * Sorts a copy, never in place. Rows with no value for the sort key always
 * sink to the BOTTOM regardless of direction — a load with no pickup date
 * isn't "earliest", it's unscheduled, and floating those to the top of a
 * date sort would bury the loads that actually have a date on them.
 */
export function sortLoads(rows: LoadRow[], key: SortKey, dir: SortDir): LoadRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    // Stable tie-break so equal keys don't shuffle between renders.
    return a.loadNumber.localeCompare(b.loadNumber);
  });
}

/** Per-filter counts for the chip row, computed in one pass. */
export function countByFilter(rows: LoadRow[]): Record<LoadFilterKey, number> {
  const counts: Record<LoadFilterKey, number> = {
    all: rows.length,
    open: 0,
    dispatched: 0,
    in_transit: 0,
    paperwork: 0,
  };
  for (const row of rows) {
    const status = (row.status || "").trim().toLowerCase();
    if (status === "open") counts.open += 1;
    else if (status === "dispatched") counts.dispatched += 1;
    else if (status === "in_transit") counts.in_transit += 1;
    if (needsPaperwork(row)) counts.paperwork += 1;
  }
  return counts;
}
