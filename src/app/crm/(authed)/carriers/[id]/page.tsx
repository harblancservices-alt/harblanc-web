import { notFound } from "next/navigation";
import { PageShell } from "../../_shell/ui";
import { BackButton } from "../../_shell/BackButton";
import { getCarrier } from "../../shipments/carriers-actions";
import { CarrierDetail } from "./CarrierDetail";

export const dynamic = "force-dynamic";

export default async function CarrierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const carrier = await getCarrier(id);
  if (!carrier) notFound();

  return (
    <PageShell back={<BackButton fallbackHref="/crm/carriers" label="Carriers" />}>
      <CarrierDetail carrier={carrier} />
    </PageShell>
  );
}
