import { ActiveCustomersPanel } from "../../customers/ActiveCustomersPanel";
import { listShipments } from "../../shipments/actions";
import { ShipmentsListClient } from "../../shipments/ShipmentsListClient";
import { toShipmentListRow, type ShipmentListRow } from "../../shipments/shipmentListRow";
import { NewShipmentButton } from "../../shipments/NewShipmentButton";
import { listAllDocuments } from "../../shipments/document-history-actions";
import { AllDocumentsListClient } from "./AllDocumentsListClient";
import { ActiveCustomersTabs } from "./ActiveCustomersTabs";

export const dynamic = "force-dynamic";

/**
 * Operations → Active Clients. Moved here 2026-08-22 from the top-level
 * /crm/active-customers nav destination (that route now redirects here);
 * the page, its tabs and every panel are the SAME components, not a rebuild.
 *
 * ONE TAB LEFT BEHIND: Carriers. The hub used to be four tabs (Active
 * Customers / Carriers / Shipments / BOL-RC), but the carrier directory is
 * now a first-class Operations sub-tab of its own — ../carriers. Keeping it
 * here as well would have put the same directory in two places inside the
 * same tab strip, which is exactly the "one concept, two disconnected
 * destinations" problem CRM_MASTER_AUDIT.md §1 exists to stop. Nothing was
 * removed from the product: carrier CRUD, search and the /crm/carriers/[id]
 * detail route are all intact, one tab over.
 *
 * The `q` search param went with it — it only ever drove the Carriers tab's
 * server-side search (CarriersListClient pushes it onto the page's own URL),
 * so this page no longer reads searchParams at all.
 *
 * The remaining three tabs still reuse the exact list components and actions
 * their standalone routes use (/crm/customers, /crm/shipments), so no query
 * logic is duplicated here.
 */
export default async function OperationsActiveClientsPage() {
  const [shipments, documents] = await Promise.all([listShipments(), listAllDocuments()]);

  const shipmentRows: ShipmentListRow[] = shipments.map(toShipmentListRow);

  return (
    <ActiveCustomersTabs
      activeCustomers={<ActiveCustomersPanel />}
      shipments={<ShipmentsListClient shipments={shipmentRows} />}
      shipmentActions={<NewShipmentButton />}
      documents={<AllDocumentsListClient documents={documents} />}
    />
  );
}
