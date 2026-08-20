import { requireCrmAdmin } from "../guard";
import { Card, CardHead } from "../../_shell/ui";
import { getBrokerProfile } from "../../_shell/brokerProfile";
import { BrokerProfileEditButton } from "../../settings/BrokerProfileEditButton";

export const dynamic = "force-dynamic";

/**
 * Organization — the real edit-authority move DESIGN_DECISIONS.md §2/§3
 * describes: the org's brokerage/letterhead fields (crm_broker_profile),
 * previously the one owner-only *edit* control stranded outside Admin
 * (CRM_MASTER_AUDIT.md §3/§14). Every field/action here is the same real
 * data Settings used to edit directly — relocated, not rebuilt. Settings
 * keeps a read-only view + a link here for members who just need to read
 * the letterhead.
 */
export default async function AdminOrganizationPage() {
  await requireCrmAdmin();
  const profile = await getBrokerProfile();

  return (
    <Card>
      <CardHead
        title="Company / Brokerage Info"
        hint="The letterhead every generated document (Rate Confirmation, Bill of Lading) reads from."
        right={<BrokerProfileEditButton profile={profile} />}
      />
      <dl className="divide-y divide-line-strong">
        <Row label="Company name" value={profile.name || "—"} />
        <Row label="MC #" value={profile.mc || "—"} />
        <Row label="DOT #" value={profile.dot || "—"} />
        <Row label="Address" value={profile.address || "—"} />
        <Row label="Phone" value={profile.phone || "—"} />
        <Row label="Email" value={profile.email || "—"} />
      </dl>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <dt className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">{label}</dt>
      <dd className="text-[14px] text-fg">{value}</dd>
    </div>
  );
}
