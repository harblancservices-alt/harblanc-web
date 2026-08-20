import { requireCrmAdmin } from "../guard";
import { Card, EmptyState } from "../../_shell/ui";
import { IconAdminAccount } from "../../_shell/icons";

export const dynamic = "force-dynamic";

/**
 * OTR — crm-design's second, document-less intake funnel: a company named
 * over the phone with no BOL/scan at all, researched and released to
 * Prospects independently of BOL Center. No real backend exists (no
 * `otrEntries` table, no route, no UI) — flagged here per
 * CRM_MIGRATION_MATRIX.md §3, not faked with invented rows.
 */
export default async function AdminOtrPage() {
  await requireCrmAdmin();

  return (
    <Card>
      <EmptyState
        icon={<IconAdminAccount />}
        title="OTR isn't connected yet"
        body="This is where a document-less researched prospect — a company named over the phone, with no BOL or scan — would be tracked and released to Prospects, separately from BOL Center. A real crm-design feature; the real CRM has no table or route for it yet."
      />
    </Card>
  );
}
