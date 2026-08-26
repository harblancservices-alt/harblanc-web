import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePhones } from "@/app/crm/(authed)/_shell/contactFields";

/**
 * "Who do I call at this company" — one definition, for every surface that
 * shows a company card.
 *
 * THE RULE. The account's own `primary_contact_id` wins when it is set and
 * still points at a live contact. Otherwise the first contact by name, which
 * is arbitrary but STABLE — an arbitrary-but-stable pick beats no pick,
 * because the alternative is a card that says "nobody to call" about a
 * company with four contacts on it. It also beats picking by created_at,
 * which would silently reshuffle whenever somebody adds a person.
 *
 * A company with no contacts is simply absent from the map; callers render
 * that as the honest "nobody to call there yet" rather than a blank line.
 *
 * PHONE comes from the same two-column arrangement the rest of the CRM uses:
 * the structured `phones` jsonb first, falling back to the plain `phone`
 * text. Same precedence as the company profile and Active Customers, so the
 * number on a card is the number the profile shows.
 */

export type PrimaryContact = {
  id: string;
  name: string;
  title: string | null;
  phone: string | null;
};

export async function primaryContactByAccount(
  supabase: SupabaseClient,
  accountIds: string[],
  /** crm_accounts.primary_contact_id per account, where one is set. */
  primaryIdByAccount: Map<string, string>,
): Promise<Map<string, PrimaryContact>> {
  const out = new Map<string, PrimaryContact>();
  if (accountIds.length === 0) return out;

  const { data } = await supabase
    .from("crm_contacts")
    .select("id, account_id, name, title, phone, phones")
    .in("account_id", accountIds)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(5000);

  for (const row of (data ?? []) as {
    id: string;
    account_id: string | null;
    name: string | null;
    title: string | null;
    phone: string | null;
    phones: unknown;
  }[]) {
    const accountId = row.account_id;
    if (!accountId) continue;

    const chosen: PrimaryContact = {
      id: row.id,
      name: (row.name ?? "").trim(),
      title: (row.title ?? "").trim() || null,
      phone: parsePhones(row.phones)[0]?.number || row.phone || null,
    };
    if (!chosen.name) continue;

    const existing = out.get(accountId);
    if (!existing) {
      out.set(accountId, chosen);
      continue;
    }
    // Rows arrive name-ordered, so the first one seen is already the
    // fallback pick. Only an explicit primary_contact_id may displace it.
    if (primaryIdByAccount.get(accountId) === row.id) out.set(accountId, chosen);
  }

  return out;
}
