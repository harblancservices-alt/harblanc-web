"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

/**
 * Wraps page content. Hides the public Navbar + Footer on /admin and /crm
 * routes so those app surfaces render standalone, without the public
 * marketing chrome above and below them. /crm is the standalone "Hello
 * Hotshot" CRM — it carries its own shell and must never show the public
 * site chrome (nor the admin chrome).
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const isStandaloneApp =
    pathname.startsWith("/admin") || pathname.startsWith("/crm");

  return (
    <>
      {!isStandaloneApp && <Navbar />}
      <main className="flex-1">{children}</main>
      {!isStandaloneApp && <Footer />}
    </>
  );
}
