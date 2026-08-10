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
  "/crm/active-customers": "Active Customers",
  "/crm/contacts": "Contacts",
  "/crm/tasks": "Tasks",
  "/crm/ai-agent": "AI Agent",
  "/crm/ai-review": "AI Review",
  "/crm/settings": "Settings",
};

/** Concise human label for a route — exact matches for every known tab,
 * pattern matches for the two dynamic profile-style routes, and a generic
 * fallback (humanized last path segment) for anything else so a future page
 * still logs something readable instead of going untracked. */
function labelForPath(path: string): string {
  if (KNOWN_LABELS[path]) return KNOWN_LABELS[path];
  if (/^\/crm\/accounts\/[^/]+$/.test(path)) return "Company profile";
  if (/^\/crm\/settings\/activity\/[^/]+$/.test(path)) return "Team activity";
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
