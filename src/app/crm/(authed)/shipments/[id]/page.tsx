import { notFound } from "next/navigation";
import { PageShell } from "../../_shell/ui";
import { BackButton } from "../../_shell/BackButton";
import { getShipment } from "../actions";
import { listShipmentDocuments } from "../document-history-actions";
import { ShipmentWorkspace } from "./ShipmentWorkspace";
import { DocumentsSection } from "./DocumentsSection";

export const dynamic = "force-dynamic";

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [shipment, documents] = await Promise.all([getShipment(id), listShipmentDocuments(id)]);
  if (!shipment) notFound();

  return (
    <PageShell back={<BackButton fallbackHref="/crm/shipments" label="Shipments" />}>
      <ShipmentWorkspace shipment={shipment} />
      <DocumentsSection shipmentId={id} documents={documents} />
    </PageShell>
  );
}
