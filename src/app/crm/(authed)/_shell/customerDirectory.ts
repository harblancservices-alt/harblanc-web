import { createCrmServerClient } from "@/lib/crm/auth";
import { normalizeStage } from "../accounts/lifecycle";
import { parsePhones } from "./contactFields";
import { titleCaseWords, upperCaseState } from "./format";

export type CustomerOption = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  contactName: string;
  contactPhone: string;
};

type AccountRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  phones: unknown;
  lifecycle_status: string | null;
  primary_contact_id: string | null;
};

type ContactRow = { id: string; name: string | null; phones: unknown };

/**
 * The org's Active Customers — crm_accounts whose lifecycle stage normalizes
 * to "active_customer" (see accounts/lifecycle.ts; legacy raw values like
 * "customer"/"quoted" count too) — shaped for document auto-fill (Bill of
 * Lading's "Start from a customer" picker today). Reads the account's saved
 * company-profile address/phone plus its primary contact, if any; a future
 * "fill from the customer's last logged shipment" source can layer on top
 * of or replace this without changing the CustomerOption shape callers see.
 */
export async function getActiveCustomers(): Promise<CustomerOption[]> {
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_accounts")
    .select("id, name, address, city, state, zip, phone, phones, lifecycle_status, primary_contact_id")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(1000);

  const rows = (data ?? []) as AccountRow[];
  const active = rows.filter((r) => normalizeStage(r.lifecycle_status) === "active_customer");

  const contactIds = active
    .map((r) => r.primary_contact_id)
    .filter((id): id is string => Boolean(id));

  const contactById = new Map<string, ContactRow>();
  if (contactIds.length) {
    const { data: contactRows } = await supabase
      .from("crm_contacts")
      .select("id, name, phones")
      .in("id", contactIds)
      .is("deleted_at", null);
    for (const c of (contactRows ?? []) as ContactRow[]) contactById.set(c.id, c);
  }

  return active.map((a) => {
    const contact = a.primary_contact_id ? contactById.get(a.primary_contact_id) : undefined;
    return {
      id: a.id,
      name: titleCaseWords(a.name) || a.name || "",
      address: titleCaseWords(a.address),
      city: titleCaseWords(a.city),
      state: upperCaseState(a.state),
      zip: a.zip || "",
      phone: parsePhones(a.phones)[0]?.number || a.phone || "",
      contactName: contact?.name || "",
      contactPhone: parsePhones(contact?.phones)[0]?.number || "",
    };
  });
}
