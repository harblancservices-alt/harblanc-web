import { ActiveCustomersPanel } from "../../customers/ActiveCustomersPanel";

export const dynamic = "force-dynamic";

/**
 * Operations → Active Clients. Moved here 2026-08-22 from the top-level
 * /crm/active-customers nav destination (that route now redirects here); the
 * panel is the SAME component, not a rebuild.
 *
 * 2026-08-25: the second tab row is gone. This page used to render
 * ActiveCustomersTabs — Active Customers / Shipments / BOL-RC — stacked
 * directly under the Operations tab row, which put two tab strips on one
 * screen and restated this very tab ("Active Clients") as the lower row's
 * first button.
 *
 * Where the three went:
 *   Active Customers — was this page's own landing panel, so it IS this page
 *                      now; the tab that selected it was selecting the thing
 *                      you had already navigated to.
 *   Shipments        — promoted to ../shipments (see that file: it is not the
 *                      same set as Active Loads, so it could not just be
 *                      dropped).
 *   BOL / RC         — promoted to ../bol-rc.
 *
 * Nothing was removed from the product and no destination lost a path in.
 */
export default function OperationsActiveClientsPage() {
  return <ActiveCustomersPanel />;
}
