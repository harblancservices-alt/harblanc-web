import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { Breadcrumb } from "./Breadcrumb";

/**
 * The responsive app shell — desktop sidebar + mobile bottom nav, both
 * driven by the single src/lib/nav/nav.config.ts source of truth
 * (v2-architecture.md §2). `.tms-v2-light` scopes the design-system tokens
 * added to globals.css to this subtree only, exactly like `.admin-light`
 * and `.crm-light` already do for their own route groups.
 */
export function PortalShell({ email, children }: { email: string | null; children: ReactNode }) {
  return (
    <div className="tms-v2-light min-h-screen bg-canvas text-fg">
      <TopBar email={email} />
      <div className="mx-auto flex max-w-[1400px]">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-8">
          <Breadcrumb />
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
