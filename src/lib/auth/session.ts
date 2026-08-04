/**
 * /tms-v2's auth import surface — a thin re-export of /admin's existing
 * gates (src/lib/admin/auth.ts), not a reimplementation. Same Supabase Auth
 * session, same ADMIN_EMAIL allowlist, same cookies as /admin (see
 * docs/portal/v2-architecture.md §7). Gives tms-v2 code a route-group-
 * appropriate import path without duplicating logic — a fix to the shared
 * gate benefits /admin and /tms-v2 simultaneously.
 */
export { adminFromMiddleware, requireAdmin, type AdminUser } from "@/lib/admin/auth";
