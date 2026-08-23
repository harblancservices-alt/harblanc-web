import { PageShell } from "../_shell/ui";
import { ActiveCustomersPanel } from "./ActiveCustomersPanel";

export const dynamic = "force-dynamic";

/**
 * Standalone /crm/customers route — kept working for any existing deep
 * links, but no longer linked from the nav (consolidated into the
 * Operations > Active Clients hub's "Active Customers" tab, which renders this
 * exact same panel — see ActiveCustomersPanel.tsx).
 */
export default async function ActiveCustomersPage() {
  return (
    <PageShell title="Active Customers">
      <ActiveCustomersPanel />
    </PageShell>
  );
}
