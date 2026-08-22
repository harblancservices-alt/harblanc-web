import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocationListItem } from "./LocationRow";

/**
 * Fetch a company's facilities with each row's recurring carrier / carrier
 * contact resolved to a NAME for display — extracted verbatim from
 * LocationsSection so the desktop company profile (which needs the same rows
 * for its own compact Locations card) can't drift from what the mobile
 * section renders. Takes an already-authenticated Supabase client rather
 * than creating its own, so a caller that already has one (page.tsx) can
 * fold this into its existing Promise.all instead of opening a second.
 *
 * Plain module, NOT "use server" — it's a data helper called from Server
 * Components, not a server action, so nothing here crosses a client boundary.
 */
export async function fetchAccountLocations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  accountId: string,
): Promise<LocationListItem[]> {
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

  const carrierIds = Array.from(new Set(rows.map((r) => r.default_carrier_id).filter((v): v is string => Boolean(v))));
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

  return rows.map((r) => ({
    ...r,
    default_carrier_name: r.default_carrier_id ? (carrierNameById.get(r.default_carrier_id) ?? null) : null,
    default_carrier_contact_name: r.default_carrier_contact_id
      ? (contactNameById.get(r.default_carrier_contact_id) ?? null)
      : null,
  }));
}
