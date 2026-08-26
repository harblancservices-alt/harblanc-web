import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";
import { initialsOf } from "../_shell/format";
import { type WorkItem } from "./workItem";
import { findDuplicates } from "./duplicates";

/**
 * Server-side reads for Admin → Overview's assignment board: every company
 * nobody owns yet, plus the team and how loaded each person is.
 *
 * ONE QUERY, AS OF 2026-08-26. This used to pool three tables — unclaimed
 * prospects, open OTR entries and unmatched BOL entries — each with its own
 * status vocabulary imported from the screen that owned it. Both those
 * funnels are gone: an OTR entry is now a company from the moment it is
 * created, and BOL Center was retired because nothing in the app ever wrote
 * crm_bol_entries. The pool is the same size it was; it is just made of one
 * kind of thing now.
 */

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
// Stages that still count as work in progress. Deliberately excludes the
// won stage (active), the two terminal ones (lost, disqualified) AND dormant
// — a customer who has gone quiet is a problem to work, but it is not
// pipeline load, and counting it as such would make a rep look busy for
// holding stale accounts. Raw values include the pre-remap vocabulary so the
// count is right before and after the remap.
const IN_FUNNEL = [
  "new_lead", "qualified", "contacted", "engaged", "quoting", "setup",
  "researching", // legacy raw value, still on live rows pre-remap
];

export async function getAssignBoardData(): Promise<AssignBoardData> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const [prospectsRes, profilesRes, tasksRes, ownedRes, allNamesRes, contactsRes] = await Promise.all([
    // Unowned companies — the CRM's existing gate, verbatim:
    // ai_status = 'released' AND assigned_user_id IS NULL.
    supabase
      .from("crm_accounts")
      .select("id, name, city, state, created_at")
      .is("deleted_at", null)
      .eq("ai_status", "released")
      .is("assigned_user_id", null),

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

    // Every live company's name, for read-time duplicate detection. id+name
    // only — this is the cheapest possible shape and it is the whole org
    // because a pool company can collide with an ASSIGNED one just as
    // easily (BETCO does exactly that).
    supabase
      .from("crm_accounts")
      .select("id, name")
      .is("deleted_at", null)
      .limit(5000),

    supabase
      .from("crm_contacts")
      .select("id, name, account_id, title")
      .is("deleted_at", null)
      .not("account_id", "is", null)
      .order("name", { ascending: true })
      .limit(2000),
  ]);

  const poolRows = (prospectsRes.data ?? []) as { id: string; name: string | null }[];
  const duplicates = findDuplicates(
    poolRows.map((r) => ({ id: r.id, name: (r.name as string) || "" })),
    ((allNamesRes.data ?? []) as { id: string; name: string | null }[]).map((r) => ({
      id: r.id,
      name: (r.name as string) || "",
    })),
  );

  const items: WorkItem[] = [];

  for (const row of prospectsRes.data ?? []) {
    items.push({
      id: row.id as string,
      company: (row.name as string) || "Unnamed company",
      city: (row.city as string | null) ?? null,
      state: (row.state as string | null) ?? null,
      // One sentence now that the list is homogeneous. It used to vary by
      // source ("Research, then release" for OTR, a match count for BOL);
      // every row is an unowned company, and what it needs is an owner.
      needs: "Assign an owner",
      waitingSince: row.created_at as string,
      duplicateOf: duplicates.get(row.id as string) ?? [],
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
