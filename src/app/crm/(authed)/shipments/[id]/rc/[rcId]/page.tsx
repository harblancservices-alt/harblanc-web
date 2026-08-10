import { redirect } from "next/navigation";

/**
 * The Rate Confirmation editor moved into a modal over the shipment
 * workspace (2026-08-09) — see DocumentEditorModal.tsx. This route now only
 * exists so old bookmarks / deep links to a specific RC still land somewhere
 * sensible (the parent shipment) instead of 404ing or falling through to the
 * Active Customers list via browser history.
 */
export default async function RateConfirmationDocPage({
  params,
}: {
  params: Promise<{ id: string; rcId: string }>;
}) {
  const { id } = await params;
  redirect(`/crm/shipments/${id}`);
}
