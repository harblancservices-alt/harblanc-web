import { PageShell } from "../_shell/ui";
import { BackButton } from "../_shell/BackButton";
import { listCarriers } from "../shipments/carriers-actions";
import { CarriersListClient, type CarrierListRow } from "./CarriersListClient";
import { AddCarrierButton } from "./AddCarrierButton";

export const dynamic = "force-dynamic";

/**
 * The org's carrier directory — independent of any one shipment, reused
 * from the Shipment workspace's carrier picker/"Add carrier" flow. Reads
 * listCarriers() (up to the org's first 20 alphabetically — see
 * carriers-actions.ts's comment on why that's the intended shape for a
 * picker; the directory page here just reuses the same action for its full
 * list, matching every other CRM list's "already the full page, filter
 * client-side" pattern).
 */
export default async function CarriersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const carriers = await listCarriers(q);

  const rows: CarrierListRow[] = carriers.map((c) => ({
    id: c.id,
    name: c.name,
    mcNumber: c.mcNumber,
    dotNumber: c.dotNumber,
    phone: c.phone,
    city: c.city,
    state: c.state,
    equipment: c.equipment,
    status: c.status,
  }));

  return (
    <PageShell
      title="Carriers"
      /* Falls back into the Active Clients hub (carriers is one of its 4
         tabs), not the orphaned standalone /crm/shipments route — a rep who
         arrived here from the hub should land back in it, not outside it
         (CRM_MASTER_AUDIT.md §5/§10, P1 #8). */
      back={<BackButton fallbackHref="/crm/active-customers" label="Active Clients" />}
      actions={<AddCarrierButton />}
    >
      <CarriersListClient carriers={rows} q={q} />
    </PageShell>
  );
}
