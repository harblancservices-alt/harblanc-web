import { listShipmentsForAccount } from "../../shipments/actions";
import { ShipmentCard } from "../../shipments/ShipmentCard";
import { toShipmentListRow } from "../../shipments/shipmentListRow";
import { NewShipmentButton } from "../../shipments/NewShipmentButton";
// The ONE definition of "active", shared with Operations → Active Loads.
// Was a private const here; promoted to statusMeta.ts so the two surfaces
// can't drift apart on what counts as a live load.
import { isActiveShipmentStatus } from "../../shipments/statusMeta";

/**
 * The profile's "Shipments" tab — this customer's loads, active first then
 * historical, each already carrying its RC/BOL doc counts (see
 * listShipmentsForAccount). "Create load" pre-links the new shipment to this
 * account instead of the org-wide NewShipmentButton's blank-shipment flow, so
 * a load started from a customer's profile never needs the customer picked
 * again on the shipment itself. Reuses ShipmentCard unmodified — a shipment
 * row looks the same here as it does on /crm/shipments.
 */
export async function ShipmentsTab({ accountId, accountName }: { accountId: string; accountName: string }) {
  const shipments = await listShipmentsForAccount(accountId);
  const active = shipments.filter((s) => isActiveShipmentStatus(s.status));
  const historical = shipments.filter((s) => !isActiveShipmentStatus(s.status));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      {/* The button only sits up here when there is a list to sit above.
          On an empty tab it used to float hard right of nothing, with the
          sentence explaining the emptiness stranded below it — the eye
          lands on the middle of an empty card, so that is where the way
          out belongs. */}
      {shipments.length > 0 && (
        <div className="flex items-center justify-end">
          <NewShipmentButton accountId={accountId} customerName={accountName} label="Create load" />
        </div>
      )}

      {shipments.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
          <p className="text-[13.5px] text-fg-muted">
            No shipments for this customer yet — create one to start a load.
          </p>
          <NewShipmentButton accountId={accountId} customerName={accountName} label="Create load" />
        </div>
      ) : (
        <>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
              Active {active.length ? `(${active.length})` : ""}
            </p>
            {active.length === 0 ? (
              <p className="text-[12.5px] text-fg-subtle">No active loads.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {active.map((s) => (
                  <ShipmentCard key={s.id} shipment={toShipmentListRow(s)} />
                ))}
              </div>
            )}
          </div>

          {historical.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                History ({historical.length})
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {historical.map((s) => (
                  <ShipmentCard key={s.id} shipment={toShipmentListRow(s)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
