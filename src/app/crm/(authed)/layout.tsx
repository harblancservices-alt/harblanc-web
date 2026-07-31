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

  // Org name for the shell header. Scoped by RLS to the user's own org.
  const supabase = await createCrmServerClient();
  const { data: org } = await supabase
    .from("crm_orgs")
    .select("name")
    .eq("id", user.orgId)
    .maybeSingle();

  // Pending-review count for the nav badge — owners only, so this extra
  // count-only query never runs for regular members. Covers both AI-agent
  // research leads and Field Capture leads; both land in the same queue.
  let pendingReviewCount = 0;
  if (user.role === "owner") {
    const { count } = await supabase
      .from("crm_accounts")
      .select("id", { count: "exact", head: true })
      .in("source", ["ai_agent", "field_capture"])
      .eq("ai_status", "pending_review")
      .is("deleted_at", null);
    pendingReviewCount = count ?? 0;
  }

  // Unclaimed released AI leads — the alert every CRM user sees, badging the
  // "AI Agent" nav item. Same predicate as the /crm/ai-agent tab itself, the
  // dashboard's "New leads to claim" card, and its due-count bell, so all
  // four surfaces always agree.
  const { count: unclaimedAiCount } = await supabase
    .from("crm_accounts")
    .select("id", { count: "exact", head: true })
    .in("source", ["ai_agent", "field_capture"])
    .eq("ai_status", "released")
    .is("assigned_user_id", null)
    .is("deleted_at", null);

  // Active-customers count for the nav badge — visible to every CRM user
  // (the tab itself isn't owner-gated), same predicate as /crm/customers.
  const { count: customerCount } = await supabase
    .from("crm_accounts")
    .select("id", { count: "exact", head: true })
    .eq("lifecycle_status", "customer")
    .is("deleted_at", null);

  return (
    <CrmShell
      email={user.email}
      fullName={user.fullName}
      orgName={(org?.name as string) ?? "Hello Hotshot"}
      role={user.role}
      pendingReviewCount={pendingReviewCount}
      unclaimedAiLeadsCount={unclaimedAiCount ?? 0}
      customerCount={customerCount ?? 0}
    >
      {children}
    </CrmShell>
  );
}
