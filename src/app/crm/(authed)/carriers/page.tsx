import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Compat redirect. The carrier directory moved into Operations on
 * 2026-08-22 (/crm/operations/carriers); this route stays alive so existing
 * bookmarks, the "Carriers" link on the shipment workspace, and the detail
 * page's own back button all still resolve.
 *
 * `q` IS forwarded — it's a real server-side search on the directory (see
 * ../operations/carriers/page.tsx), so a shared "/crm/carriers?q=lone star"
 * link must keep its query on the way through rather than silently landing
 * on the unfiltered list.
 *
 * NOTE the sibling [id] route is NOT redirected and must not be: carrier
 * DETAIL still lives at /crm/carriers/[id], linked from the carrier rows,
 * from CarrierFormDialog after a create, and from the shipment workspace.
 * Only this list page moved.
 */
export default async function CarriersRedirect({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  redirect(q ? `/crm/operations/carriers?q=${encodeURIComponent(q)}` : "/crm/operations/carriers");
}
