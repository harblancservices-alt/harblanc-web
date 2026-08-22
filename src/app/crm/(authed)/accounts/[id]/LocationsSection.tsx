import { createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead, ZEBRA_ROWS } from "../../_shell/ui";
import { LocationRow } from "./LocationRow";
import { AddLocationButton } from "./AddLocationButton";
import { fetchAccountLocations } from "./locations-data";

/**
 * Details tab — "Locations & docks" group. Repeatable facilities, each its
 * own crm_account_locations row (address/receiving hours/dock notes/contact/
 * recurring carrier) rather than a single jsonb field, so they can be
 * added/edited/removed one at a time the same way People/Contacts work.
 *
 * 2026-08-22: the fetch + carrier/contact name resolution moved verbatim to
 * locations-data.ts's `fetchAccountLocations`, which the desktop company
 * profile's own Locations card also uses — same query, same shape, one
 * source of truth. This component's own rendering is unchanged.
 */
export async function LocationsSection({ accountId }: { accountId: string }) {
  const supabase = await createCrmServerClient();
  const locations = await fetchAccountLocations(supabase, accountId);

  return (
    <Card>
      <CardHead
        title="Locations & docks"
        hint={locations.length ? `${locations.length} on file` : undefined}
        right={<AddLocationButton accountId={accountId} />}
      />
      {locations.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13.5px] text-fg-muted">
          No facilities on file yet — add a warehouse, yard, or dock.
        </p>
      ) : (
        <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
          {locations.map((loc) => (
            <LocationRow key={loc.id} accountId={accountId} location={loc} />
          ))}
        </ul>
      )}
    </Card>
  );
}
