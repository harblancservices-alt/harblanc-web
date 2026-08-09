import { notFound } from "next/navigation";
import { PageShell } from "../../_shell/ui";
import { BackButton } from "../../_shell/BackButton";
import { getShipment } from "../actions";
import { ShipmentWorkspace } from "./ShipmentWorkspace";

export const dynamic = "force-dynamic";

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shipment = await getShipment(id);
  if (!shipment) notFound();

  return (
    <PageShell back={<BackButton fallbackHref="/crm/shipments" label="Shipments" />}>
      <ShipmentWorkspace shipment={shipment} />
    </PageShell>
  );
}
