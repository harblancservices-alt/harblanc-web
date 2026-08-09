import { createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead, ZEBRA_ROWS } from "../../_shell/ui";
import type { LocationDefaults } from "./LocationDialog";
import { LocationRow } from "./LocationRow";
import { AddLocationButton } from "./AddLocationButton";

/**
 * Details tab — "Locations & docks" group. Repeatable facilities, each its
 * own crm_account_locations row (address/receiving hours/dock notes) rather
 * than a single jsonb field, so they can be added/edited/removed one at a
 * time the same way People/Contacts work. Self-contained fetch.
 */
export async function LocationsSection({ accountId }: { accountId: string }) {
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_account_locations")
    .select("id, label, address, city, state, zip, receiving_hours, dock_notes")
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const locations = (data ?? []) as Required<LocationDefaults>[];

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
