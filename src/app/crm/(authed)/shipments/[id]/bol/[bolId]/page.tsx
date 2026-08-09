import { notFound } from "next/navigation";
import { PageShell } from "../../../../_shell/ui";
import { BackButton } from "../../../../_shell/BackButton";
import { getBol } from "../../../bol-actions";
import { getShipment } from "../../../actions";
import { BolEditor } from "./BolEditor";

export const dynamic = "force-dynamic";

/**
 * The Bill of Lading document editor — replaces the earlier placeholder
 * landing now that the fillable editor + PDF lifecycle controls exist (see
 * BolEditor.tsx). Loads both the BOL (fields + line items) and its parent
 * shipment in parallel: the shipment supplies the shipper/consignee/carrier
 * snapshot fields (crm_bills_of_lading has no scalar columns of its own for
 * those — see bol-actions.ts's header comment), shown read-only with a link
 * back to the shipment for edits, plus the header's "back to shipment"
 * context.
 */
export default async function BolDocPage({
  params,
}: {
  params: Promise<{ id: string; bolId: string }>;
}) {
  const { id, bolId } = await params;
  const [bol, shipment] = await Promise.all([getBol(bolId), getShipment(id)]);
  if (!bol || !shipment) notFound();

  return (
    <PageShell back={<BackButton fallbackHref={`/crm/shipments/${id}`} label="Shipment" />}>
      <BolEditor shipment={shipment} initialBol={bol} />
    </PageShell>
  );
}
