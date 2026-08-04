"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

/**
 * Wraps page content. Hides the public Navbar + Footer on /admin, /crm, and
 * /tms-v2 routes so those app surfaces render standalone, without the
 * public marketing chrome above and below them. /crm is the standalone
 * "Hello Hotshot" CRM and /tms-v2 is the in-progress TMS rebuild — both
 * carry their own shell (PortalShell, for /tms-v2 — see
 * src/app/tms-v2/(authed)/_shell/PortalShell.tsx) and must never show the
 * public site chrome (nor each other's/admin's).
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const isStandaloneApp =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/crm") ||
    pathname.startsWith("/tms-v2");

  return (
    <>
      {!isStandaloneApp && <Navbar />}
      <main className="flex-1">{children}</main>
      {!isStandaloneApp && <Footer />}
    </>
  );
}
