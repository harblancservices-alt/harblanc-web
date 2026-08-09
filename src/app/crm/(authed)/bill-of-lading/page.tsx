import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Retired standalone Bill of Lading generator — BOL generation now lives on
 * a Shipment's Documents tab (see /crm/shipments/[id]). This route stays
 * only so old links/bookmarks land somewhere useful.
 */
export default function BillOfLadingPage() {
  redirect("/crm/shipments");
}
