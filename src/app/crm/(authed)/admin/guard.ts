import { redirect } from "next/navigation";
import { requireCrmUser, type CrmUser } from "@/lib/crm/auth";

/**
 * Gate for every page under /crm/admin/** — the owner-only "Admin Account"
 * section (Overview/Accounts/Activity/Documents). Same enforcement point as
 * /crm/ai-review and settings/activity/[userId]: requireCrmUser() confirms
 * the session + org membership, then role !== "owner" bounces to /crm so a
 * non-owner never sees the destination. This is defense in depth, not the
 * only check — every mutating action in ./actions.ts re-verifies role='owner'
 * itself (never trusts that a request reaching it already passed this page
 * gate), and buildCrmNav() (../_shell/nav.ts) only ever pushes the "Admin
 * Account" nav item for role==='owner' so a member never even sees the link.
 */
export async function requireCrmAdmin(): Promise<CrmUser> {
  const user = await requireCrmUser();
  if (user.role !== "owner") redirect("/crm");
  return user;
}
