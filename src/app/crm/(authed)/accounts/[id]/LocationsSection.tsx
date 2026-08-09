import { createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead, BTN_PRIMARY, ZEBRA_ROWS } from "../../_shell/ui";
import { IconPlus } from "../../_shell/icons";
import { LocationDialog, type LocationDefaults } from "./LocationDialog";
import { LocationRow } from "./LocationRow";

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
        right={
          <LocationDialog
            accountId={accountId}
            mode="create"
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_PRIMARY}`}
              >
                <IconPlus width={14} height={14} />
                Add location
              </button>
            )}
          />
        }
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
