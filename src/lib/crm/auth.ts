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
 * THE SAME CHECK, WITHOUT THE TELEPORT.
 *
 * requireCrmUser() calls redirect() when the session is gone. Inside a server
 * action that throws Next's redirect signal, which unwinds past the calling
 * component entirely: the browser navigates to /crm/login, the composer
 * unmounts, and whatever the user had typed goes with it. No error is shown,
 * because control never comes back to show one.
 *
 * That is how Tyler lost a note on 2026-08-28. He typed it, pressed save, his
 * session had expired, and the write was never attempted — the Supabase edge
 * logs for that window contain exactly one POST to crm_notes, the earlier note
 * that did save. No request, no error, no row.
 *
 * So any action that a person triggers WITH TEXT ON SCREEN resolves the user
 * through this instead. It returns null rather than redirecting, the action
 * returns a normal failure, and the composer renders it like any other error —
 * which means it keeps what they wrote.
 *
 * Read paths keep using requireCrmUser(): bouncing someone to login while they
 * are only looking at a page costs them nothing.
 */
export async function currentCrmUser(): Promise<CrmUser | null> {
  const supabase = await createServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("crm_profiles")
    .select("org_id, full_name, email, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;

  return {
    id: user.id,
    email: user.email ?? (profile.email as string | null) ?? "",
    orgId: profile.org_id as string,
    fullName: (profile.full_name as string | null) ?? null,
    role: (profile.role as string) ?? "member",
  };
}

/** The message a composer shows when the session died under it. Deliberately
 * says the work is safe, because the whole point of this path is that it is. */
export const SESSION_EXPIRED_ERROR =
  "Your session expired. Open the CRM in a new tab and sign in, then press save again — what you typed is still here.";

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
