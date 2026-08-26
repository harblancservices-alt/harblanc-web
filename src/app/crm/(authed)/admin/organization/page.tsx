import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Organization folded into Admin → Accounts (2026-08-25) as a compact info
 * card, and its tab came off the row.
 *
 * The ROUTE stays as a redirect rather than being deleted: Settings links
 * here ("Edit in Admin → Organization", owner-only), settings/actions.ts
 * revalidates this path after a broker-profile save, and the URL may be
 * bookmarked. A 404 for any of those would be a dead link created by a
 * layout decision.
 *
 * The page's own content is not duplicated here — it lives in one place now,
 * on ../accounts.
 */
export default async function AdminOrganizationPage() {
  redirect("/crm/admin/accounts");
}
