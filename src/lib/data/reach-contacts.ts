/**
 * Reach's Contacts management reader (Phase QA-gap item 5) — a tms-v2-own
 * query, not legacy's loadReachContacts() (src/app/admin/(authed)/
 * dispatch/reach/queries.ts): that function's ReachContact shape drops
 * broker_id (it only keeps a resolved broker NAME), which the existing
 * addBrokerContact/updateBrokerContact/deleteBrokerContact actions
 * (src/actions/tms-v2/brokers.ts) need to revalidate the right broker
 * detail path. This mirrors the same broker_contacts + brokers join
 * legacy's reader does, just keeping broker_id on the row.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";

export type ReachContactRow = {
  id: string;
  brokerId: string;
  brokerName: string;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  /** Reach's own recipient-eligibility flag — the same broker_contacts.
   * is_backhaul column buildRecipients() filters on. */
  isBackhaul: boolean;
};

type ContactRow = {
  id: string;
  broker_id: string | null;
  name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  is_backhaul: boolean | null;
};

export async function listReachContacts(): Promise<ReachContactRow[]> {
  if (await isDemoMode()) return [];

  const sb = createServiceRoleClient();
  const [{ data: contactRows }, { data: brokerRows }] = await Promise.all([
    sb
      .from("broker_contacts")
      .select("id, broker_id, name, title, phone, email, is_backhaul")
      .is("deleted_at", null)
      .returns<ContactRow[]>(),
    sb.from("brokers").select("id, name").is("deleted_at", null).returns<{ id: string; name: string }[]>(),
  ]);

  const brokerNameById = new Map((brokerRows ?? []).map((b) => [b.id, b.name]));

  return (contactRows ?? [])
    .filter((c) => c.broker_id)
    .map((c) => ({
      id: c.id,
      brokerId: c.broker_id as string,
      brokerName: brokerNameById.get(c.broker_id as string) ?? "—",
      name: (c.name ?? "").trim() || "Unnamed contact",
      title: c.title,
      phone: c.phone,
      email: c.email,
      isBackhaul: !!c.is_backhaul,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
