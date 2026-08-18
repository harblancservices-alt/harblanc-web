import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerComponentClient } from "@/lib/supabase/server";

export type AdminUser = {
  id: string;
  email: string;
};

/**
 * Server-side gate for admin routes. Call at the top of any server component
 * or route handler under /admin/**. Returns the authenticated admin user OR
 * throws a redirect to the login screen — the caller never needs to branch
 * on the result. The login screen itself lives at the neutral /login route
 * (src/app/login/**, outside src/app/admin/** — shared-authentication
 * carve-out), not under /admin.
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
    redirect("/login");
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    await supabase.auth.signOut();
    redirect("/login?error=not_authorized");
  }

  return { id: user.id, email: user.email };
}


/**
 * Fast admin gate for pages/layouts that always run behind the admin
 * middleware (everything under /admin/**). The middleware already performed
 * the authoritative getUser() + allowlist check and forwarded the verified
 * identity as request headers, so we read those instead of making a second
 * auth round-trip. Falls back to a login redirect if the headers are absent
 * (which would mean the request bypassed the middleware).
 *
 * Do NOT use this outside middleware-covered routes (e.g. /api/admin/*),
 * where the headers would be missing or client-supplied -- use requireAdmin().
 */
export async function adminFromMiddleware(): Promise<AdminUser> {
  const h = await headers();
  const id = h.get("x-admin-user-id");
  const email = h.get("x-admin-user-email");
  if (!id || !email) {
    redirect("/login");
  }
  return { id, email };
}
