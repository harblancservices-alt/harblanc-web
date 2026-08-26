import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";
import { initialsOf } from "../_shell/format";
import { needsLabel, type WorkItem } from "./workItem";

/**
 * Server-side reads for Admin → Overview's assignment board. Pooled from
 * three tables into ONE list of unowned work, plus the team and how loaded
 * each person is.
 *
 * Every status vocabulary here is imported from the tab that owns it rather
 * than re-typed, so "what counts as open" can't drift between this page and
 * the BOL Center / OTR screens themselves.
 */

/** OTR entries still needing a human: everything before release, excluding
 * the ones already rejected. Matches OtrEntryCard's own `editable` rule
 * (status is neither "released" nor "rejected"). */
const OTR_OPEN_STATUSES = ["new", "researching", "ready_for_approval"] as const;

/** BOL entries still needing matching — the same set BolTable calls OPEN. */
const BOL_OPEN_STATUSES = ["new", "needs_review", "ready"] as const;

export type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  initials: string;
  /** Open tasks currently assigned to them (crm_tasks.status = 'open'). */
  openTasks: number;
  /** Companies they own that are still in the funnel — not won, not lost. */
  prospects: number;
};

/** One contact the composer can point a task at, with the company it belongs
 * to so the picker can narrow as soon as a company is chosen. */
export type ComposerContact = {
  id: string;
  name: string;
  accountId: string;
  title: string | null;
};

export type AssignBoardData = {
  items: WorkItem[];
  team: TeamMember[];
  /** Every contact in the org that HAS a company, for the composer's
   * contact picker. Org-wide on purpose: this is the admin's own composer on
   * an owner-gated page, and the whole point is assigning work about any
   * company to anyone. A contact with no company is excluded — it could never
   * be reached through the picker, which only opens once a company is
   * chosen. */
  contacts: ComposerContact[];
  /** Server clock, passed to the client so every "waiting" label is computed
   * against ONE instant — see waitingLabel's note on hydration. */
  now: number;
};


/** Stages that still count as "on someone's plate" for the load readout. A
 * won or dropped-out company is not work in progress. */
const IN_FUNNEL = ["new_lead", "researching", "contacted", "quoting"];

export async function getAssignBoardData(): Promise<AssignBoardData> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const [prospectsRes, otrRes, bolRes, profilesRes, tasksRes, ownedRes, contactsRes] = await Promise.all([
    // Unclaimed prospects — the CRM's existing gate, verbatim:
    // ai_status = 'released' AND assigned_user_id IS NULL (see ai-agent/queue.ts).
    supabase
      .from("crm_accounts")
      .select("id, name, city, state, created_at")
      .is("deleted_at", null)
      .eq("ai_status", "released")
      .is("assigned_user_id", null),

    supabase
      .from("crm_otr_entries")
      .select("id, company_name, city, state, created_at")
      .is("deleted_at", null)
      .in("status", OTR_OPEN_STATUSES as unknown as string[]),

    supabase
      .from("crm_bol_entries")
      .select(
        "id, shipper_name, consignee_name, bill_to, carrier, created_at, matched_shipper_account_id, matched_consignee_account_id, matched_bill_to_account_id, matched_carrier_account_id",
      )
      .is("deleted_at", null)
      .in("status", BOL_OPEN_STATUSES as unknown as string[]),

    supabase
      .from("crm_profiles")
      .select("id, full_name, email")
      .eq("org_id", user.orgId)
      .eq("is_active", true),

    supabase.from("crm_tasks").select("assigned_user_id").eq("status", "open").is("deleted_at", null),

    supabase
      .from("crm_accounts")
      .select("assigned_user_id")
      .is("deleted_at", null)
      .not("assigned_user_id", "is", null)
      .in("lifecycle_status", IN_FUNNEL),

    supabase
      .from("crm_contacts")
      .select("id, name, account_id, title")
      .is("deleted_at", null)
      .not("account_id", "is", null)
      .order("name", { ascending: true })
      .limit(2000),
  ]);

  const items: WorkItem[] = [];

  for (const row of prospectsRes.data ?? []) {
    items.push({
      id: row.id as string,
      source: "prospect",
      company: (row.name as string) || "Unnamed company",
      city: (row.city as string | null) ?? null,
      state: (row.state as string | null) ?? null,
      needs: needsLabel("prospect"),
      waitingSince: row.created_at as string,
      ownable: true,
    });
  }

  for (const row of otrRes.data ?? []) {
    items.push({
      id: row.id as string,
      source: "otr",
      company: (row.company_name as string) || "Unnamed company",
      city: (row.city as string | null) ?? null,
      state: (row.state as string | null) ?? null,
      needs: needsLabel("otr"),
      waitingSince: row.created_at as string,
      ownable: false,
    });
  }

  for (const row of bolRes.data ?? []) {
    // A BOL entry's work is per-party: count the parties it NAMES, then how
    // many of those still have no matched company.
    const parties: [unknown, unknown][] = [
      [row.shipper_name, row.matched_shipper_account_id],
      [row.consignee_name, row.matched_consignee_account_id],
      [row.bill_to, row.matched_bill_to_account_id],
      [row.carrier, row.matched_carrier_account_id],
    ];
    const named = parties.filter(([name]) => typeof name === "string" && name.trim());
    const unmatched = named.filter(([, matched]) => !matched).length;

    items.push({
      id: row.id as string,
      source: "bol",
      company: (row.shipper_name as string) || (row.consignee_name as string) || "Bill of lading",
      city: null,
      state: null,
      needs: needsLabel("bol", { unmatched, named: named.length }),
      waitingSince: row.created_at as string,
      ownable: false,
    });
  }

  const openTaskByUser = new Map<string, number>();
  for (const t of tasksRes.data ?? []) {
    const id = t.assigned_user_id as string | null;
    if (id) openTaskByUser.set(id, (openTaskByUser.get(id) ?? 0) + 1);
  }

  const prospectsByUser = new Map<string, number>();
  for (const a of ownedRes.data ?? []) {
    const id = a.assigned_user_id as string | null;
    if (id) prospectsByUser.set(id, (prospectsByUser.get(id) ?? 0) + 1);
  }

  const team: TeamMember[] = (profilesRes.data ?? [])
    .map((p) => {
      const name = ((p.full_name as string | null) ?? "").trim();
      const email = (p.email as string | null) ?? null;
      return {
        id: p.id as string,
        name: name || email || "Unnamed",
        email,
        initials: initialsOf(name, email),
        openTasks: openTaskByUser.get(p.id as string) ?? 0,
        prospects: prospectsByUser.get(p.id as string) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const contacts: ComposerContact[] = (contactsRes.data ?? []).map((c) => ({
    id: c.id as string,
    name: (c.name as string) || "Unnamed contact",
    accountId: c.account_id as string,
    title: (c.title as string | null) ?? null,
  }));

  return { items, team, contacts, now: Date.now() };
}
