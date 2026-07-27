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

  return (
    <CrmShell
      email={user.email}
      fullName={user.fullName}
      orgName={(org?.name as string) ?? "Hello Hotshot"}
    >
      {children}
    </CrmShell>
  );
}
