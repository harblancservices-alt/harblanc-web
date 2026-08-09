import { requireCrmUser } from "@/lib/crm/auth";
import { PageShell } from "../_shell/ui";
import { getActiveOrgUsers } from "../_shell/orgUsers";
import { getBrokerProfile } from "../_shell/brokerProfile";
import { getActiveCustomers } from "../_shell/customerDirectory";
import { BillOfLadingGenerator } from "./BillOfLadingGenerator";

export const dynamic = "force-dynamic";

/**
 * Bill of Lading generator: a left-side fill-in form paired with a live
 * document preview on the right, printed via the same "hide everything but
 * the print area" trick as /crm/rate-confirmation. Every field is
 * controlled React state (not uncontrolled inputs) so the preview can
 * re-render as-you-type with blank underlines instead of bracket
 * placeholders. No persistence.
 *
 * This Server Component fetches the org's active CRM users (for the Broker
 * Contact dropdown), the org's broker letterhead info (company/MC/DOT/
 * address, edited from CRM Settings), and the org's Active Customers (for
 * the form's "start from a customer" auto-fill) and hands all three down as
 * props — the client generator below has no server access of its own.
 */
export default async function BillOfLadingPage() {
  await requireCrmUser();

  const [orgUsers, brokerProfile, customers] = await Promise.all([
    getActiveOrgUsers(),
    getBrokerProfile(),
    getActiveCustomers(),
  ]);

  return (
    <PageShell>
      <BillOfLadingGenerator orgUsers={orgUsers} brokerProfile={brokerProfile} customers={customers} />
    </PageShell>
  );
}
