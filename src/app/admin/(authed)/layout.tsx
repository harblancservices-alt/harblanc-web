import { requireAdmin } from "@/lib/admin/auth";
import { PortalShell } from "./_shell/PortalShell";

/**
 * Level 4 — admin shell layout (V3 portal).
 *
 * requireAdmin() runs once per authed request so every page underneath
 * can assume the visitor is signed in and on the allowlist. The user's
 * email is threaded down into PortalShell so the desktop sidebar foot
 * block can render it (kept inside the shell, no longer in the top bar).
 *
 * The prior top bar layout - BrandLogo + AdminNav + DispatchClock +
 * inline email + Sign out - is gone. AdminNav and DispatchClock are
 * deleted in this level. Email + Sign out live in PortalSidebar (foot
 * block) on desktop and the Settings page on mobile.
 *
 * Page bodies (Dashboard, Quotes, Applications, Previews, Settings,
 * Trash routes) render inside <main> unchanged. Visual changes to those
 * land in Levels 5-7.
 */
export default async function AuthedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return <PortalShell email={user.email ?? null}>{children}</PortalShell>;
}
