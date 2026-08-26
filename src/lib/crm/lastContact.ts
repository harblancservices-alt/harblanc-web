import type { SupabaseClient } from "@supabase/supabase-js";
import { CRM_CONTACT_ACTIVITY_KINDS } from "./activity";
import { timestampMs } from "@/app/crm/(authed)/_shell/format";

/**
 * "When did a human last actually talk to them" — THE definition, in one
 * place.
 *
 * It is the later of two things: the subject's last logged call
 * (crm_calls.occurred_at) and its last CONTACT-KIND activity
 * (crm_activities.occurred_at filtered to CRM_CONTACT_ACTIVITY_KINDS). That
 * kind filter is what stops an AI-research run, a stage change or a
 * record-created event reading as "someone spoke to them" — it is the whole
 * reason this cannot be a naive MAX over crm_activities.
 *
 * WHY THIS FILE EXISTS. By 2026-08-26 the same query pair and the same
 * reduce-to-max had been copy-pasted into six readers: the Companies list,
 * Active Customers, Admin -> Companies, Admin -> Contacts, the agent
 * dashboard and the pipeline board. Six copies of one rule is exactly the
 * drift this codebase keeps rediscovering — the last-contact number is about
 * to drive a hot/cold scale, and a scale computed six different ways is not a
 * scale. Every reader now calls this instead.
 *
 * TWO SUBJECTS, ONE RULE. A company's clock and a contact's clock are the
 * same question asked of a different column, so they share an implementation
 * rather than being two functions that drift apart.
 */

/** How many rows to pull per side. Both tables are read newest-first, so this
 * caps how far back the rollup can see, not which rows win. Was 2000 in three
 * callers and 3000 in two; standardised up so no caller silently sees less
 * history than it used to. */
const ROW_CAP = 3000;

type Row = { occurred_at: string } & Record<string, unknown>;

async function rollup(
  supabase: SupabaseClient,
  column: "account_id" | "contact_id",
  ids: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;

  const [callsRes, activitiesRes] = await Promise.all([
    supabase
      .from("crm_calls")
      .select(`${column}, occurred_at`)
      .in(column, ids)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(ROW_CAP),
    supabase
      .from("crm_activities")
      .select(`${column}, occurred_at`)
      .in(column, ids)
      .in("kind", CRM_CONTACT_ACTIVITY_KINDS)
      .order("occurred_at", { ascending: false })
      .limit(ROW_CAP),
  ]);

  for (const r of [
    ...((callsRes.data ?? []) as Row[]),
    ...((activitiesRes.data ?? []) as Row[]),
  ]) {
    const id = r[column] as string | null;
    if (!id) continue;
    const ms = timestampMs(r.occurred_at);
    if (ms === null) continue;
    const current = out.get(id);
    if (current === undefined || ms > current) out.set(id, ms);
  }

  return out;
}

/**
 * Last real human contact per COMPANY, as epoch ms. Companies with no contact
 * on record are simply absent from the map — callers read that as "never",
 * which is deliberately distinct from "long ago".
 */
export function lastContactByAccount(
  supabase: SupabaseClient,
  accountIds: string[],
): Promise<Map<string, number>> {
  return rollup(supabase, "account_id", accountIds);
}

/**
 * Last real human contact per CONTACT. Note this is the PER-PERSON clock, not
 * their company's — a company can be warm while one of its people has never
 * been reached, and Admin -> Contacts exists to show exactly that.
 */
export function lastContactByContact(
  supabase: SupabaseClient,
  contactIds: string[],
): Promise<Map<string, number>> {
  return rollup(supabase, "contact_id", contactIds);
}
