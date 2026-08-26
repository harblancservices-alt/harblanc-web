"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { logCrmEvent } from "./activity-actions";

/** Minimum time between two logged page views for the SAME path, so rapid
 * client-side nav (a redirect chain, flicking back and forth) can't spam
 * crm_user_events with duplicate rows. */
const DEBOUNCE_MS = 4000;

const KNOWN_LABELS: Record<string, string> = {
  "/crm": "Dashboard",
  "/crm/accounts": "Companies",
  "/crm/customers": "Active Customers",
  // Operations sub-tabs. The two /crm/{active-customers,carriers} entries
  // below are the pre-2026-08-22 routes, kept so historical rows in the
  // activity log still read as words rather than falling through to the
  // humanized-slug fallback.
  "/crm/operations": "Quote Calculator",
  "/crm/operations/documents": "Operations Documents",
  "/crm/operations/loads": "Active Loads",
  "/crm/operations/clients": "Active Clients",
  "/crm/operations/carriers": "Active Carriers",
  "/crm/active-customers": "Active Customers",
  "/crm/carriers": "Carriers",
  "/crm/contacts": "Contacts",
  "/crm/pipeline": "Pipeline",
  "/crm/tasks": "Tasks",
  "/crm/settings": "Settings",
  "/crm/admin": "Admin Account",
  "/crm/admin/accounts": "Admin Accounts",
  "/crm/admin/companies": "Admin Companies",
  "/crm/admin/contacts": "Admin Contacts",
  "/crm/admin/tasks": "Admin Tasks",
  "/crm/admin/activity": "Admin Activity",
  "/crm/admin/documents": "Admin Documents",
};

// "/crm/ai-review" came out on 2026-08-26. Unlike the retired-but-real
// routes above, that page no longer EXISTS, so nothing can navigate to it and
// this entry could never fire again. The 24 historical rows are unaffected:
// crm_user_events stores the label on the row at write time (see
// activity-actions.ts), so they still read "AI Review" without the map.

/** Concise human label for a route — exact matches for every known tab,
 * pattern matches for the two dynamic profile-style routes, and a generic
 * fallback (humanized last path segment) for anything else so a future page
 * still logs something readable instead of going untracked. */
function labelForPath(path: string): string {
  if (KNOWN_LABELS[path]) return KNOWN_LABELS[path];
  if (/^\/crm\/accounts\/[^/]+$/.test(path)) return "Company profile";
  if (/^\/crm\/admin\/accounts\/[^/]+$/.test(path)) return "Admin member detail";
  const last = path.split("/").filter(Boolean).pop() ?? "crm";
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, " ");
}

/**
 * Silent page-view logging for the owner-only activity log. Renders nothing
 * and shows nothing — no toast, badge, or indicator anywhere — and never
 * lets a logging failure surface to (or block navigation for) the person
 * it's tracking. Mounted once in CrmShell, so it survives every client-side
 * navigation within the authed CRM; a ref (not state) tracks the last
 * logged path/time so re-renders elsewhere in the shell never reset the
 * debounce window.
 */
export function ActivityTracker() {
  const pathname = usePathname();
  const lastRef = useRef<{ path: string; at: number } | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const now = Date.now();
    const last = lastRef.current;
    if (last && last.path === pathname && now - last.at < DEBOUNCE_MS) return;
    lastRef.current = { path: pathname, at: now };

    logCrmEvent({ kind: "page", path: pathname, label: labelForPath(pathname) }).catch(() => {
      // Silent by design — see docstring.
    });
  }, [pathname]);

  return null;
}
