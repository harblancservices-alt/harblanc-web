import { ComingSoonPanel } from "../ComingSoonPanel";
import { IconTruck } from "../../_shell/icons";

export const dynamic = "force-dynamic";

/**
 * Operations → Active Loads. Placeholder for now.
 *
 * The data this will read already exists and already works — listShipments()
 * (../../shipments/actions.ts) returns every org shipment already enriched
 * with its carrier name and RC/BOL counts, and "active" is already defined
 * once, in ../../accounts/[id]/ShipmentsTab.tsx. This tab is deliberately
 * NOT built in the same pass as the Documents packet builder so the two
 * don't land half-finished together; when it is built it reuses that
 * existing shipments module rather than introducing a second load model.
 */
export default function OperationsActiveLoadsPage() {
  return (
    <ComingSoonPanel
      title="Active Loads"
      hint="Open, dispatched, and in-transit loads"
      icon={<IconTruck width={22} height={22} />}
      headline="Coming soon"
      body="Every load currently moving — customer, lane, carrier, and its rate confirmation and bill of lading at a glance — with a Create load button and the actions you need on each row."
    />
  );
}
