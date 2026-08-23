import { listCarriers } from "../../shipments/carriers-actions";
import { CarriersListClient, type CarrierListRow } from "../../carriers/CarriersListClient";
import { AddCarrierButton } from "../../carriers/AddCarrierButton";

export const dynamic = "force-dynamic";

/**
 * Operations → Active Carriers. The org's carrier directory, moved here
 * 2026-08-22 from the standalone /crm/carriers route (which now redirects
 * here) and from the Active Clients hub's old "Carriers" tab.
 *
 * REUSES the existing components and action verbatim — CarriersListClient,
 * AddCarrierButton, listCarriers() — so search, create, edit and the
 * /crm/carriers/[id] detail route all behave exactly as before. Nothing is
 * rebuilt and no query logic is duplicated.
 *
 * THE DETAIL ROUTE DELIBERATELY DID NOT MOVE. /crm/carriers/[id] stays
 * where it is: it's linked from the carrier rows, from CarrierFormDialog
 * after a create, and from the shipment workspace's carrier picker. Only
 * the standalone LIST page — the "entry point" — moved, which is what
 * removing a duplicate destination actually requires. Moving the detail
 * route too would have broken those links for no benefit.
 *
 * `q` drives listCarriers()'s SERVER-side search: CarriersListClient pushes
 * the query onto this page's own URL rather than filtering client-side,
 * because listCarriers() caps its result (see carriers-actions.ts), so the
 * full directory isn't in the browser to filter. That's why this page reads
 * searchParams and the other Operations sub-tabs don't.
 */
export default async function OperationsActiveCarriersPage({
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
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddCarrierButton />
      </div>
      <CarriersListClient carriers={rows} q={q} />
    </div>
  );
}
