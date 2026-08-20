import { requireCrmAdmin } from "../guard";
import { Card, EmptyState } from "../../_shell/ui";
import { IconAdminAccount } from "../../_shell/icons";

export const dynamic = "force-dynamic";

/**
 * BOL Center — crm-design's admin-only BOL photo intake/intelligence funnel
 * (upload → AI extraction → customer/location match → research → approve →
 * release to Prospects). Nothing in the real CRM implements this today: no
 * `bolRecords` table, no extraction pipeline, no release-to-Prospects action.
 * This tab exists so the IA crm-design designed is visible in the real nav
 * (matching CRM_MIGRATION_MATRIX.md §3's "keep it structurally present, mark
 * it missing" instruction) rather than silently absent — it is deliberately
 * NOT a fake inbox with invented rows.
 */
export default async function AdminBolCenterPage() {
  await requireCrmAdmin();

  return (
    <Card>
      <EmptyState
        icon={<IconAdminAccount />}
        title="BOL Center isn't connected yet"
        body="This is where uploaded BOL photos would queue for AI extraction, customer/location matching, and research before release to Prospects — a real crm-design feature with no backend in the real CRM yet. Nothing is faked here; building it needs a new table, an extraction pipeline, and a release action."
      />
    </Card>
  );
}
