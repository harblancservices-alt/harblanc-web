import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase/server";

export type AdminUser = {
  id: string;
  email: string;
};

/**
 * Server-side gate for admin routes. Call at the top of any server component
 * or route handler under /admin/** (except /admin/login). Returns the
 * authenticated admin user OR throws a redirect to the login screen — the
 * caller never needs to branch on the result.
 *
 * Two-layer auth:
 *   1. Supabase Auth session must exist (cookies must be valid).
 *   2. The session\u2019s email must match the ADMIN_EMAIL env var.
 *
 * Authenticated users not on the allowlist are signed out before redirect
 * so they don\u2019t loop on the login page with a stale session.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    redirect("/admin/login");
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=not_authorized");
  }

  return { id: user.id, email: user.email };
}
