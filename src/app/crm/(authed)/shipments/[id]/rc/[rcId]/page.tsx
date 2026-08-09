import { notFound } from "next/navigation";
import { PageShell } from "../../../../_shell/ui";
import { BackButton } from "../../../../_shell/BackButton";
import { getRateConfirmation } from "../../../rate-confirmation-actions";
import { getShipment } from "../../../actions";
import { RateConfirmationEditor } from "./RateConfirmationEditor";

export const dynamic = "force-dynamic";

/**
 * The Rate Confirmation document editor — replaces the earlier placeholder
 * landing now that the fillable editor + PDF lifecycle controls exist (see
 * RateConfirmationEditor.tsx). Loads both the RC (fields + lines) and its
 * parent shipment in parallel: the shipment is only needed for the header's
 * "back to shipment" context and route summary, never written from here.
 */
export default async function RateConfirmationDocPage({
  params,
}: {
  params: Promise<{ id: string; rcId: string }>;
}) {
  const { id, rcId } = await params;
  const [rc, shipment] = await Promise.all([getRateConfirmation(rcId), getShipment(id)]);
  if (!rc || !shipment) notFound();

  return (
    <PageShell back={<BackButton fallbackHref={`/crm/shipments/${id}`} label="Shipment" />}>
      <RateConfirmationEditor shipment={shipment} initialRc={rc} />
    </PageShell>
  );
}
