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

  // Pending-review count for the nav badge — owners only, so this extra
  // count-only query never runs for regular members. Keyed on ai_status
  // alone: the ai_agent/field_capture source enumeration this used to carry
  // was retired 2026-08-25 along with those pipelines, and source is
  // provenance only (see ai-agent/queue.ts).
  let pendingReviewCount = 0;
  if (user.role === "owner") {
    const { count } = await supabase
      .from("crm_accounts")
      .select("id", { count: "exact", head: true })
      .eq("ai_status", "pending_review")
      .is("deleted_at", null);
    pendingReviewCount = count ?? 0;
  }

  // Unclaimed released leads — the alert every CRM user sees, badging the
  // "Prospects" nav item. Exactly the gate defined in ai-agent/queue.ts, the
  // same one /crm/ai-agent, claimAiLead(), the dashboard's Claim pill, and
  // the Companies-list filter use, so all five surfaces always agree.
  const { count: unclaimedAiCount } = await supabase
    .from("crm_accounts")
    .select("id", { count: "exact", head: true })
    .eq("ai_status", "released")
    .is("assigned_user_id", null)
    .is("deleted_at", null);

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
      pendingReviewCount={pendingReviewCount}
      unclaimedAiLeadsCount={unclaimedAiCount ?? 0}
      outstandingUpgradeCount={outstandingUpgradeCount ?? 0}
    >
      {children}
    </CrmShell>
  );
}
