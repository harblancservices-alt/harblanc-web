import { requireCrmUser } from "@/lib/crm/auth";
import { AgentHome } from "./agent/AgentHome";

export const dynamic = "force-dynamic";

/**
 * Workspace → Dashboard. THE agent dashboard, for everybody.
 *
 * Your work on the left, grouped Overdue / Today / This week / Later with a
 * Done button on every row; the companies you own on the right,
 * neglected-first; three counts along the top.
 *
 * NO ROLE SPLIT (Brent, 2026-08-25). An owner opening Dashboard sees their
 * own tasks and their own companies, exactly as an agent does — the page
 * answers "what am I working on", and that question has the same shape
 * whoever is asking. This route briefly branched on role (owner → the
 * command centre, agent → this) with an "Agent view" toggle bolted on for
 * owners; both are gone. The command centre moved to /crm/command-center,
 * unlinked — see its own docstring.
 *
 * The whole page is AgentHome, a server component, so the org-wide reads the
 * command centre used to run on this route are simply never issued: Dashboard
 * now costs two scoped queries plus the last-contact rollup, against ~15.
 */
export default async function CrmDashboardPage() {
  const user = await requireCrmUser();
  return <AgentHome user={user} />;
}
