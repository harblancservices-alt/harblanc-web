import type { CrmUser } from "@/lib/crm/auth";
import { firstName } from "../_shell/format";
import { HeaderAddCompanyButton } from "../QuickActions";
import { getAgentDashboardData } from "./agent-data";
import { AgentDashboard } from "./AgentDashboard";

/**
 * The non-owner half of /crm. Kept as its own server component (rather than
 * an inline branch inside page.tsx) so the owner dashboard's ~15 org-wide
 * queries are never even reached for an agent — the branch happens before
 * any of that work starts, not after it.
 *
 * `reps` is deliberately empty: HeaderAddCompanyButton renders the
 * Add-company dialog without `canAssign`, so its rep <select> never renders
 * and the roster would be queried for nothing. An agent's new company lands
 * on them anyway — createAccount defaults assigned_user_id to the creator.
 */
export async function AgentHome({ user }: { user: CrmUser }) {
  const { tasks, companies, now } = await getAgentDashboardData(user);

  return (
    <AgentDashboard
      name={firstName(user.fullName, user.email) || "You"}
      tasks={tasks}
      companies={companies}
      now={now}
      addCompanyButton={<HeaderAddCompanyButton reps={[]} />}
    />
  );
}
