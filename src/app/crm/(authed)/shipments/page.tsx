import Link from "next/link";
import { PageShell } from "../_shell/ui";
import { IconPlus, IconTruck } from "../_shell/icons";
import { BTN_PRIMARY, BTN_EDIT } from "../_shell/ui";
import { listShipments } from "./actions";
import { ShipmentsListClient, type ShipmentListRow } from "./ShipmentsListClient";

export const dynamic = "force-dynamic";

/**
 * Shipments list — the entry point into the brokerage document system's
 * operational side (Shipment workspace, then Rate Confirmation/BOL generated
 * from it). Reads listShipments() (org-wide, newest first, already carrying
 * carrier name + RC/BOL counts) and hands it to a client component for
 * instant search filtering.
 */
export default async function ShipmentsPage() {
  const shipments = await listShipments();

  const rows: ShipmentListRow[] = shipments.map((s) => ({
    id: s.id,
    shipmentNumber: s.shipmentNumber,
    status: s.status,
    customerName: s.customerName,
    shipperCity: s.shipperCity,
    shipperState: s.shipperState,
    consigneeCity: s.consigneeCity,
    consigneeState: s.consigneeState,
    carrierName: s.carrierName,
    pickupAt: s.pickupAt,
    deliveryAt: s.deliveryAt,
    rateConfirmationCount: s.rateConfirmationCount,
    bolCount: s.bolCount,
  }));

  return (
    <PageShell
      actions={
        <>
          <Link
            href="/crm/carriers"
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-semibold transition-colors ${BTN_EDIT}`}
          >
            <IconTruck width={16} height={16} />
            Carriers
          </Link>
          <Link
            href="/crm/shipments/new"
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-bold shadow-e2 transition-all hover:-translate-y-0.5 hover:shadow-e3 ${BTN_PRIMARY}`}
          >
            <IconPlus width={16} height={16} />
            New Shipment
          </Link>
        </>
      }
    >
      <ShipmentsListClient shipments={rows} />
    </PageShell>
  );
}
