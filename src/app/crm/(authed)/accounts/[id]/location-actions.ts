"use server";

import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";

/**
 * The sites a company actually has, for the contact dialog's "Site" picker.
 *
 * FETCHED ON DEMAND rather than threaded as a prop. ContactDialog has a
 * dozen call sites across the company file, the roster, the gaps chips and
 * mobile; `companyName` had to be plumbed through five of them and that was
 * worth it because it fixes a correctness bug. A list that is only needed
 * once the dialog is actually open is not — one small query when it opens
 * beats twelve call sites carrying a prop they never read.
 */

export type CompanySite = {
  id: string;
  /** What the picker shows — label if the site has one, otherwise the
   * address, which is what most rows in this table actually carry. */
  label: string;
};

function siteLabel(row: {
  label: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}): string {
  if (row.label && row.label.trim()) return row.label.trim();
  const place = [row.city, row.state].filter((p) => p && p.trim()).join(", ");
  const street = (row.address ?? "").trim();
  if (street && place && !street.includes(place)) return `${street} — ${place}`;
  return street || place || "Unnamed site";
}

export async function listCompanySites(accountId: string): Promise<CompanySite[]> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_account_locations")
    .select("id, label, address, city, state")
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  return ((data ?? []) as {
    id: string;
    label: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  }[]).map((r) => ({ id: r.id, label: siteLabel(r) }));
}
