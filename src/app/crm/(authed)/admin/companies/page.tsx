import { getCompaniesData } from "./companies-data";
import { CompaniesBoard } from "./CompaniesBoard";

export const dynamic = "force-dynamic";

/**
 * Admin → Companies — step 1 of the centralised company/work model.
 *
 * The management view of every company in the org, whoever owns it, with the
 * unowned ones first. This is where an admin sees the whole universe and
 * decides who is responsible for what.
 *
 * Scope is deliberately step 1 ONLY: assigning here sets
 * crm_accounts.assigned_user_id and nothing else. It does not create a task,
 * change the agent-facing Companies view, touch the sales nav, or rebuild the
 * Overview — those are steps 2 through 5.
 */
export default async function AdminCompaniesPage() {
  const { rows, agents } = await getCompaniesData();
  return <CompaniesBoard rows={rows} agents={agents} />;
}
