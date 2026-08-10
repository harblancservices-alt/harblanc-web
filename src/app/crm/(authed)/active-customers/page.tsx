import { PageShell } from "../_shell/ui";
import { ActiveCustomersPanel } from "../customers/ActiveCustomersPanel";
import { listCarriers } from "../shipments/carriers-actions";
import { CarriersListClient, type CarrierListRow } from "../carriers/CarriersListClient";
import { AddCarrierButton } from "../carriers/AddCarrierButton";
import { listShipments } from "../shipments/actions";
import { ShipmentsListClient, type ShipmentListRow } from "../shipments/ShipmentsListClient";
import { NewShipmentButton } from "../shipments/NewShipmentButton";
import { listAllDocuments } from "../shipments/document-history-actions";
import { AllDocumentsListClient } from "./AllDocumentsListClient";
import { ActiveCustomersTabs } from "./ActiveCustomersTabs";

export const dynamic = "force-dynamic";

/**
 * The single "Active Customers" nav destination — an aggregator hub over
 * four previously-separate surfaces (Active Customers, Carriers, Shipments,
 * and a new org-wide BOL/RC library), switched client-side by
 * ActiveCustomersTabs with no route reload. /crm/shipments, /crm/carriers,
 * and /crm/customers are all still live routes (deep links from tiles/rows
 * still resolve) — this page just stops being reached from the nav in favor
 * of this one, and reuses their exact list components/actions rather than
 * duplicating any query logic.
 *
 * `q` drives the Carriers tab's server-side search only (CarriersListClient
 * pushes it onto this page's own URL — see that component's header comment
 * for why listCarriers() searches server-side instead of client-filtering
 * its capped 20-row result). The other three tabs need no query params.
 */
export default async function ActiveCustomersHubPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const [carriers, shipments, documents] = await Promise.all([
    listCarriers(q),
    listShipments(),
    listAllDocuments(),
  ]);

  const carrierRows: CarrierListRow[] = carriers.map((c) => ({
    id: c.id,
    name: c.name,
    mcNumber: c.mcNumber,
    dotNumber: c.dotNumber,
    phone: c.phone,
    city: c.city,
    state: c.state,
    equipment: c.equipment,
    status: c.status,
  }));

  const shipmentRows: ShipmentListRow[] = shipments.map((s) => ({
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
    <PageShell>
      <ActiveCustomersTabs
        activeCustomers={<ActiveCustomersPanel />}
        carriers={<CarriersListClient carriers={carrierRows} q={q} />}
        carrierActions={<AddCarrierButton />}
        shipments={<ShipmentsListClient shipments={shipmentRows} />}
        shipmentActions={<NewShipmentButton />}
        documents={<AllDocumentsListClient documents={documents} />}
      />
    </PageShell>
  );
}
