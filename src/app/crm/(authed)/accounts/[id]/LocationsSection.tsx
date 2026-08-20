import { createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead, ZEBRA_ROWS } from "../../_shell/ui";
import { LocationRow, type LocationListItem } from "./LocationRow";
import { AddLocationButton } from "./AddLocationButton";

/**
 * Details tab — "Locations & docks" group. Repeatable facilities, each its
 * own crm_account_locations row (address/receiving hours/dock notes/contact/
 * recurring carrier) rather than a single jsonb field, so they can be
 * added/edited/removed one at a time the same way People/Contacts work.
 * Self-contained fetch; batch-resolves each location's recurring carrier/
 * contact name for display the same way listAccountLocations() does.
 */
export async function LocationsSection({ accountId }: { accountId: string }) {
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_account_locations")
    .select(
      "id, label, address, city, state, zip, receiving_hours, dock_notes, contact_name, contact_phone, contact_email, default_carrier_id, default_carrier_contact_id",
    )
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as Omit<LocationListItem, "default_carrier_name" | "default_carrier_contact_name">[];

  const carrierIds = Array.from(
    new Set(rows.map((r) => r.default_carrier_id).filter((v): v is string => Boolean(v))),
  );
  const contactIds = Array.from(
    new Set(rows.map((r) => r.default_carrier_contact_id).filter((v): v is string => Boolean(v))),
  );
  const [carriersRes, contactsRes] = await Promise.all([
    carrierIds.length
      ? supabase.from("crm_carriers").select("id, name").in("id", carrierIds)
      : Promise.resolve({ data: [] }),
    contactIds.length
      ? supabase.from("crm_carrier_contacts").select("id, name").in("id", contactIds)
      : Promise.resolve({ data: [] }),
  ]);
  const carrierNameById = new Map<string, string>(
    ((carriersRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );
  const contactNameById = new Map<string, string | null>(
    ((contactsRes.data ?? []) as { id: string; name: string | null }[]).map((c) => [c.id, c.name]),
  );

  const locations: LocationListItem[] = rows.map((r) => ({
    ...r,
    default_carrier_name: r.default_carrier_id ? (carrierNameById.get(r.default_carrier_id) ?? null) : null,
    default_carrier_contact_name: r.default_carrier_contact_id
      ? (contactNameById.get(r.default_carrier_contact_id) ?? null)
      : null,
  }));

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
