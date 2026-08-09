import { requireCrmUser } from "@/lib/crm/auth";
import { PageShell, Card, EmptyState } from "../../../../_shell/ui";
import { BackButton } from "../../../../_shell/BackButton";
import { IconBillOfLading } from "../../../../_shell/icons";

export const dynamic = "force-dynamic";

/**
 * Placeholder landing for a Bill of Lading generated from a shipment — the
 * fillable editor + PDF preview/lifecycle controls (send/sign/complete/
 * supersede, all already backed by bol-actions.ts) are a follow-up build.
 * This just confirms the BOL exists and gives a way back to the shipment it
 * came from.
 */
export default async function BolDocPage({
  params,
}: {
  params: Promise<{ id: string; bolId: string }>;
}) {
  await requireCrmUser();
  const { id, bolId } = await params;

  return (
    <PageShell back={<BackButton fallbackHref={`/crm/shipments/${id}`} label="Shipment" />}>
      <Card>
        <EmptyState
          icon={<IconBillOfLading />}
          title="Bill of Lading created"
          body={`BOL ${bolId} was created from this shipment. The fillable editor and PDF preview are coming in a follow-up update.`}
        />
      </Card>
    </PageShell>
  );
}
