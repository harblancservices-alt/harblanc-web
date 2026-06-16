import { PortalTopBar } from "./PortalTopBar";
import { PortalSidebar } from "./PortalSidebar";
import { PortalBottomNav } from "./PortalBottomNav";
import { ThemeShell } from "./ThemeShell";

/**
 * Level 4 — portal shell.
 *
 * Single component that composes:
 *   - PortalTopBar (always visible, sticky)
 *   - PortalSidebar (desktop only, hidden below lg)
 *   - main content area (page bodies render here, unchanged)
 *   - PortalBottomNav (mobile + tablet only, fixed bottom)
 *
 * Layout strategy:
 *   - Outer wrapper bg-card so the portal reads as a light surface on
 *     top of the root layout's bg-canvas body (admin shell already
 *     overrode this with bg-zinc-50 in the old layout — same idea).
 *   - Top bar h-14, sticky. Sidebar sticks at top-14, full remaining
 *     viewport height.
 *   - main has pb-16 below lg so page content clears the fixed bottom
 *     nav (h-14 nav + safe-area). lg:pb-0 removes the padding on
 *     desktop where the bottom nav is hidden.
 *
 * Server component — the only client state lives inside PortalSidebar /
 * PortalBottomNav / MoreSheet (path matching + sheet open state).
 */
export function PortalShell({
  email,
  children,
}: {
  email: string | null;
  children: React.ReactNode;
}) {
  return (
    <ThemeShell>
      <PortalTopBar />
      <div className="flex">
        <PortalSidebar email={email} />
        <main className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>
      </div>
      <PortalBottomNav />
    </ThemeShell>
  );
}
