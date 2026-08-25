import { listShipments } from "../../shipments/actions";
import { listAllDocuments } from "../../shipments/document-history-actions";
import { isActiveShipmentStatus } from "../../shipments/statusMeta";
import { resolveShipmentTimingFromDomain } from "../../shipments/timing";
import { LoadCenterClient } from "./LoadCenterClient";
import type { LoadRow } from "./loadRow";

export const dynamic = "force-dynamic";

/**
 * Operations → Active Loads (the Load Center).
 *
 * REUSES THE EXISTING SHIPMENTS DATA LAYER ENTIRELY — no new query, no new
 * table, no schema change, and nothing imported from /tms-v2 (the TMS
 * `loads` table is service-role/dispatch territory and the CRM's RLS-scoped
 * client can't read it anyway; a CRM "load" is a crm_shipments row):
 *
 *   listShipments()     — every org shipment, already enriched with its
 *                         carrier name and RC/BOL counts.
 *   listAllDocuments()  — every RC and BOL org-wide, each carrying its
 *                         parent `shipmentId` AND its lifecycle `status`.
 *
 * That second call is what makes the Docs column show state ("RC Sent",
 * "BOL Draft", "No BOL") rather than the bare counts listShipments() gives.
 * The counts alone can't distinguish a sent rate confirmation from a
 * cancelled one, and "needs paperwork" turns on exactly that distinction.
 * Both actions already exist and are already called side by side on the
 * Active Customers hub, so this is composition, not a new read path.
 *
 * "Active" comes from isActiveShipmentStatus() — the single shared
 * definition in shipments/statusMeta.ts (open / dispatched / in_transit),
 * which the company profile's Shipments tab now also uses.
 *
 * NO MONEY CROSSES THIS BOUNDARY. crm_shipments carries customer_rate and
 * carrier_rate, and listShipments() returns them; the mapping below simply
 * never reads them, and LoadRow has nowhere to put them. Sales agents work
 * this screen and margin isn't theirs to see, so it stops here, in the data
 * mapping, rather than being hidden in a component.
 */
export default async function OperationsActiveLoadsPage() {
  const [shipments, documents] = await Promise.all([listShipments(), listAllDocuments()]);

  // Newest document of each type per shipment. listAllDocuments() comes back
  // newest-first, so the FIRST one seen for a shipment is the current one.
  const rcByShipment = new Map<string, string>();
  const bolByShipment = new Map<string, string>();
  for (const doc of documents) {
    const target = doc.docType === "rate_confirmation" ? rcByShipment : bolByShipment;
    if (!target.has(doc.shipmentId)) target.set(doc.shipmentId, doc.status);
  }

  const loads: LoadRow[] = shipments
    .filter((s) => isActiveShipmentStatus(s.status))
    .map((s) => {
      // Resolve through the shared timing rule rather than reading pickup_at,
      // which Phase 1 stopped writing — see shipments/timing.ts.
      const timing = resolveShipmentTimingFromDomain(s);
      return {
        id: s.id,
        // shipment_number is DB-assigned and effectively always present; the
        // id slice is a last-resort label so a row can never render nameless.
        loadNumber: s.shipmentNumber || s.id.slice(0, 8).toUpperCase(),
        status: s.status,
        customerName: s.customerName,
        shipperCity: s.shipperCity,
        shipperState: s.shipperState,
        consigneeCity: s.consigneeCity,
        consigneeState: s.consigneeState,
        carrierName: s.carrierName,
        pickupOn: timing.pickup.sortKey,
        deliveryOn: timing.delivery.sortKey,
        rcStatus: rcByShipment.get(s.id) ?? null,
        bolStatus: bolByShipment.get(s.id) ?? null,
      };
    });

  return <LoadCenterClient loads={loads} />;
}
