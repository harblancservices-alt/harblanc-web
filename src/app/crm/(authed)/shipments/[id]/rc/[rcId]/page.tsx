import { requireCrmUser } from "@/lib/crm/auth";
import { PageShell, Card, EmptyState } from "../../../../_shell/ui";
import { BackButton } from "../../../../_shell/BackButton";
import { IconRateConfirmation } from "../../../../_shell/icons";

export const dynamic = "force-dynamic";

/**
 * Placeholder landing for a Rate Confirmation generated from a shipment —
 * the fillable editor + PDF preview/lifecycle controls (send/accept/
 * complete/supersede, all already backed by rate-confirmation-actions.ts)
 * are a follow-up build. This just confirms the RC exists and gives a way
 * back to the shipment it came from.
 */
export default async function RateConfirmationDocPage({
  params,
}: {
  params: Promise<{ id: string; rcId: string }>;
}) {
  await requireCrmUser();
  const { id, rcId } = await params;

  return (
    <PageShell back={<BackButton fallbackHref={`/crm/shipments/${id}`} label="Shipment" />}>
      <Card>
        <EmptyState
          icon={<IconRateConfirmation />}
          title="Rate Confirmation created"
          body={`RC ${rcId} was created from this shipment. The fillable editor and PDF preview are coming in a follow-up update.`}
        />
      </Card>
    </PageShell>
  );
}
