import { requireCrmUser } from "@/lib/crm/auth";
import { PageShell } from "../_shell/ui";
import { getActiveOrgUsers } from "../_shell/orgUsers";
import { getBrokerProfile } from "../_shell/brokerProfile";
import { RateConfirmationDocument } from "./RateConfirmationDocument";

export const dynamic = "force-dynamic";

/**
 * Fillable, print-to-PDF carrier Rate Confirmation. Mostly uncontrolled
 * inputs filled in by hand before printing — no persistence — except the
 * broker header (company/MC/DOT/address plus the Broker Contact rep), which
 * auto-fills from this Server Component's data the same way /crm/bill-of-lading
 * does: the org's broker letterhead info (edited from CRM Settings) and its
 * active CRM users (for the Broker Contact dropdown) are fetched here and
 * handed down as props.
 */
export default async function RateConfirmationPage() {
  await requireCrmUser();

  const [orgUsers, brokerProfile] = await Promise.all([
    getActiveOrgUsers(),
    getBrokerProfile(),
  ]);

  return (
    <PageShell>
      <RateConfirmationDocument orgUsers={orgUsers} brokerProfile={brokerProfile} />
    </PageShell>
  );
}
