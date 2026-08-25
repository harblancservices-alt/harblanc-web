import { resolveShipmentTimingFromDomain } from "./timing";
import type { CrmShipmentSummary } from "./types";

/**
 * The row shape ShipmentCard / ShipmentTable render, and the ONE function
 * that builds it from a shipment.
 *
 * A PLAIN module (no React, no "use client", no "use server") on purpose —
 * same reasoning as operations/loads/loadRow.ts. Four surfaces produce these
 * rows and three of them are SERVER components (the Shipments page, the
 * Companies profile's Shipments tab, Operations → Active Clients), so this
 * cannot live in ShipmentsListClient.tsx: a "use client" file's exports
 * become client references, and a server component calling one throws
 * "Attempted to call toShipmentListRow() from the server".
 *
 * Before this existed each surface built the row inline, which is how they
 * ended up reading the retired pickup_at column and showing every
 * newly-scheduled load as having no date. One builder means a new surface
 * gets the timing fallback for free.
 */
export type ShipmentListRow = {
  id: string;
  shipmentNumber: string;
  status: string;
  customerName: string | null;
  shipperCity: string | null;
  shipperState: string | null;
  consigneeCity: string | null;
  consigneeState: string | null;
  carrierName: string | null;
  /**
   * The stop's calendar day as "YYYY-MM-DD", resolved from the timing model
   * with the legacy fallback (shipments/timing.ts) — NOT the raw pickup_at
   * column, which Phase 1 stopped writing. Render it with
   * formatStopDateShort().
   */
  pickupOn: string | null;
  deliveryOn: string | null;
  rateConfirmationCount: number;
  bolCount: number;
};

export function toShipmentListRow(s: CrmShipmentSummary): ShipmentListRow {
  const timing = resolveShipmentTimingFromDomain(s);
  return {
    id: s.id,
    shipmentNumber: s.shipmentNumber,
    status: s.status,
    customerName: s.customerName,
    shipperCity: s.shipperCity,
    shipperState: s.shipperState,
    consigneeCity: s.consigneeCity,
    consigneeState: s.consigneeState,
    carrierName: s.carrierName,
    pickupOn: timing.pickup.sortKey,
    deliveryOn: timing.delivery.sortKey,
    rateConfirmationCount: s.rateConfirmationCount,
    bolCount: s.bolCount,
  };
}
