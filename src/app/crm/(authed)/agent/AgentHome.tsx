import type { CrmUser } from "@/lib/crm/auth";
import { firstName } from "../_shell/format";
import { HeaderAddCompanyButton } from "../QuickActions";
import { getAgentDashboardData } from "./agent-data";
import { AgentDashboard } from "./AgentDashboard";

/**
 * The Dashboard's server half: read this person's work and this person's
 * companies, hand them to the client component.
 *
 * ONE PATH FOR EVERYONE (Brent, 2026-08-25). There is no role argument and
 * no "view as somebody else" — the page shows the signed-in user their own
 * tasks and their own companies, whoever they are. An owner-only toggle and
 * a `?as=<id>` preview lived here briefly while the agent dashboard was
 * pinned to a role branch; both went when Dashboard became this screen for
 * all users.
 *
 * `reps` is deliberately empty: HeaderAddCompanyButton renders the
 * Add-company dialog without `canAssign`, so its rep <select> never renders
 * and the roster would be queried for nothing. A new company lands on its
 * creator anyway — createAccount defaults assigned_user_id to `user.id`.
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
