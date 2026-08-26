import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { CrmShell } from "./_shell/CrmShell";

export const dynamic = "force-dynamic";

/**
 * Gate for every authenticated CRM page. requireCrmUser() enforces BOTH a
 * valid Supabase session AND active crm_profiles membership — so a dispatch
 * admin (who has no crm_profiles row) is rejected here even with a session.
 * Fully independent of the /admin gate.
 */
export default async function CrmAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  // (The unclaimed-leads count query that used to live here went away with
  // the "Prospects" nav item on 2026-08-25 — the claim model is retired, so
  // nothing badges that number any more. One fewer count query on every CRM
  // page render. Unclaimed companies now surface on Admin → Companies.)

  // (The active-customers count query that used to live here went away with
  // the "Active Clients" nav item on 2026-08-22 — it became an Operations
  // sub-tab and no longer carries a badge, so the count is no longer read.
  // One fewer count query on every single CRM page render.)

  // Outstanding (not-done) Upgrades requests for the nav badge — visible to
  // every CRM user, same as the other backlog counts above; the board itself
  // isn't owner-gated, only marking a request done is (see upgrades/actions.ts).
  const { count: outstandingUpgradeCount } = await supabase
    .from("crm_upgrade_requests")
    .select("id", { count: "exact", head: true })
    .neq("status", "done")
    .is("deleted_at", null);

  return (
    <CrmShell
      email={user.email}
      fullName={user.fullName}
      role={user.role}
      outstandingUpgradeCount={outstandingUpgradeCount ?? 0}
    >
      {children}
    </CrmShell>
  );
}
