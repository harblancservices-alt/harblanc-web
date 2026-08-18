import { adminFromMiddleware } from "@/lib/auth/session";
import { PortalShell } from "./_shell/PortalShell";

/**
 * /tms-v2's auth boundary — identical gate to /admin (v2-architecture.md
 * §7). adminFromMiddleware() reads the x-admin-user-id/email headers the
 * shared middleware gate (src/middleware.ts's adminSessionGate) already
 * verified for this request; it redirects to /login if they're absent,
 * which would mean the request somehow bypassed the middleware. There is
 * no /tms-v2/login — /login is a neutral top-level route (src/app/login/**,
 * outside src/app/admin/** — shared-authentication carve-out) both /admin
 * and /tms-v2 use as their one single door.
 */
export default async function AuthedTmsV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await adminFromMiddleware();
  return <PortalShell email={user.email ?? null}>{children}</PortalShell>;
}
