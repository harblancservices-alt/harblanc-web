import { listShipments } from "../../shipments/actions";
import { ShipmentsListClient } from "../../shipments/ShipmentsListClient";
import { toShipmentListRow, type ShipmentListRow } from "../../shipments/shipmentListRow";
import { NewShipmentButton } from "../../shipments/NewShipmentButton";

export const dynamic = "force-dynamic";

/**
 * Operations → Shipments — EVERY shipment, at any status.
 *
 * Promoted 2026-08-25 from a tab inside the Active Clients hub, alongside
 * BOL / RC, so Operations has one tab row instead of two.
 *
 * IT HAD TO COME UP RATHER THAN BE DELETED. It looks like a duplicate of
 * Active Loads and is not: ../loads pre-filters through
 * isActiveShipmentStatus() (open / dispatched / in_transit), so a delivered,
 * invoiced or cancelled shipment appears HERE and nowhere else in the
 * Operations section. Dropping this tab would have left those rows with no
 * navigation path at all — /crm/shipments is a live route but nothing in the
 * nav links to it (see _shell/nav.ts, where it is only a `match` entry), so
 * this tab was the single way in.
 *
 * Same components as that standalone route, not a rebuild — this exists so
 * the list can be reached without leaving the Operations tab row, exactly
 * the pattern ../clients already used for it.
 */
export default async function OperationsShipmentsPage() {
  const shipments = await listShipments();
  const rows: ShipmentListRow[] = shipments.map(toShipmentListRow);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewShipmentButton />
      </div>
      <ShipmentsListClient shipments={rows} />
    </div>
  );
}
