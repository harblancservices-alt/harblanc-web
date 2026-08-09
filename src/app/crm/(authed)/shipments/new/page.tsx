import { redirect } from "next/navigation";
import { PageShell, Card, EmptyState } from "../../_shell/ui";
import { BackButton } from "../../_shell/BackButton";
import { IconTruck } from "../../_shell/icons";
import { createShipment } from "../actions";

export const dynamic = "force-dynamic";

/**
 * "New Shipment" — creates a bare draft shipment (shipment_number is
 * DB-assigned, status defaults to 'open') and immediately routes into the
 * workspace to fill it in. No form here; every field is editable on the
 * workspace itself.
 */
export default async function NewShipmentPage() {
  const result = await createShipment({});

  if (!result.ok) {
    return (
      <PageShell back={<BackButton fallbackHref="/crm/shipments" />}>
        <Card>
          <EmptyState
            icon={<IconTruck />}
            title="Could not create the shipment"
            body={result.error}
          />
        </Card>
      </PageShell>
    );
  }

  redirect(`/crm/shipments/${result.id}`);
}
