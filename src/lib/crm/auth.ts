import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerComponentClient } from "@/lib/supabase/server";

/**
 * The authenticated Hello Hotshot CRM user, resolved from their Supabase Auth
 * session PLUS their crm_profiles membership row. Membership in crm_profiles —
 * and only that — is what grants CRM access; a dispatch admin with no
 * crm_profiles row is rejected here even though they hold a valid session.
 */
export type CrmUser = {
  id: string;
  email: string;
  orgId: string;
  fullName: string | null;
  role: string;
};

/**
 * Gate for every authenticated CRM page/action. Confirms a Supabase session,
 * then confirms the user belongs to a CRM org via crm_profiles (deny-by-default
 * RLS means a non-member simply reads back no row). This is fully independent
 * of the /admin gate — it never consults ADMIN_EMAIL and redirects only to the
 * CRM's own login.
 *
 * Middleware already blocks unauthenticated requests to /crm/**, so this is
 * the authoritative authorization check (defense in depth): auth in middleware,
 * org membership in the data layer.
 */
export async function requireCrmUser(): Promise<CrmUser> {
  const supabase = await createServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/crm/login");
  }

  const { data: profile } = await supabase
    .from("crm_profiles")
    .select("org_id, full_name, email, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    // Authenticated, but not an active CRM member (e.g. a dispatch admin).
    redirect("/crm/login?error=no_access");
  }

  return {
    id: user.id,
    email: user.email ?? profile.email ?? "",
    orgId: profile.org_id as string,
    fullName: (profile.full_name as string | null) ?? null,
    role: (profile.role as string) ?? "member",
  };
}

/**
 * Cookie-aware Supabase client bound to the current CRM session. All queries
 * run as the authenticated user, so crm_* RLS (org scoping) applies — the CRM
 * never touches the service-role key and therefore can never read another
 * org's rows or any dispatch table.
 */
export async function createCrmServerClient(): Promise<SupabaseClient> {
  return createServerComponentClient();
}
