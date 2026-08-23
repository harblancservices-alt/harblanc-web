import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Compat redirect. Active Clients moved into Operations on 2026-08-22
 * (/crm/operations/clients) and left the top-level nav; this route stays
 * alive so existing bookmarks, the activity log's recorded page views, and
 * any link still pointing at the old hub land on the real page instead of a
 * 404. Same approach as the /admin/{login,logout,...} compat redirects in
 * src/middleware.ts.
 *
 * No search params are forwarded on purpose: the only one this route ever
 * read was `q`, and that drove the Carriers tab, which is now its own
 * sub-tab at /crm/operations/carriers with its own `q`.
 */
export default function ActiveCustomersRedirect() {
  redirect("/crm/operations/clients");
}
