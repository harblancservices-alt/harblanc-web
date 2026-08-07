"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TMS_V2_NAV, TMS_V2_SETTINGS, NAV_GROUP_LABEL } from "@/lib/nav/nav.config";

/**
 * Persistent breadcrumb anchor (shell foundation phase). Auto-derived from
 * the one nav registry (nav.config.ts) against the current pathname — never
 * a per-page prop, so every route gets it for free and it can't drift out
 * of sync with the sidebar the way a hand-maintained crumb would. Longest
 * matching href wins so a detail route (e.g. /tms-v2/loads/[id]) still
 * resolves to its list page's crumb. Hidden on the Dashboard itself — a
 * "Dashboard / Dashboard" crumb is noise.
 */
export function Breadcrumb() {
  const pathname = usePathname();
  if (pathname === "/tms-v2") return null;

  const all = [...TMS_V2_NAV, TMS_V2_SETTINGS];
  const match = all
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-[13px] text-fg-muted">
      <Link href="/tms-v2" prefetch={false} className="hover:text-fg">
        Dashboard
      </Link>
      {match ? (
        <>
          <span aria-hidden>/</span>
          <span className="text-fg-subtle">{NAV_GROUP_LABEL[match.group]}</span>
          <span aria-hidden>/</span>
          <Link href={match.href} prefetch={false} className="font-medium text-fg hover:text-accent">
            {match.label}
          </Link>
        </>
      ) : null}
    </nav>
  );
}
