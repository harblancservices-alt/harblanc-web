import { createCrmServerClient } from "@/lib/crm/auth";
import { CRM_ACTIVITY } from "@/lib/crm/activity";
import type { AdminActivityItem } from "./types";

const ROW_LIMIT = 500;

type ProfileRow = { id: string; full_name: string | null; email: string | null };

function profileName(p: ProfileRow | undefined): string | null {
  if (!p) return null;
  return p.full_name || p.email || "Unnamed";
}

/**
 * The Admin Account "Activity" tab — an org-wide, all-companies version of
 * the per-company ActivityTimeline (accounts/[id]/ActivityTimeline.tsx): the
 * same three-source merge (crm_activities minus call/note kinds, plus
 * crm_calls, plus human crm_notes) that page already builds, just without
 * the `.eq("account_id", id)` scope. Each row carries its parent company's
 * id/name (when it has one) so the page can filter by company and link a row
 * straight to that company's profile — "each links to the record it
 * references" from the approved spec. Note-type rows carry the note's full
 * body text; the page renders it truncated with a "View" link to the
 * company profile where the complete note lives, rather than duplicating a
 * note-reading UI here.
 *
 * This NEVER includes admin actions (role changes, promotions, control
 * toggles, suspensions) — admin/actions.ts simply never calls logActivity(),
 * so there is nothing here to filter out; Brent's "don't log it when I do"
 * instruction is satisfied by omission, not by a kind-exclusion list that
 * could drift.
 */
export async function listOrgActivity(): Promise<AdminActivityItem[]> {
  const supabase = await createCrmServerClient();

  const [{ data: activityRows }, { data: callRows }, { data: noteRows }, { data: profileRows }] =
    await Promise.all([
      supabase
        .from("crm_activities")
        .select("id, kind, summary, body, occurred_at, user_id, account_id, contact_id")
        .not("kind", "in", `(${CRM_ACTIVITY.call},${CRM_ACTIVITY.noteAdded})`)
        .order("occurred_at", { ascending: false })
        .limit(ROW_LIMIT),
      supabase
        .from("crm_calls")
        .select("id, account_id, contact_id, outcome, duration_seconds, summary, notes, occurred_at, user_id")
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false })
        .limit(ROW_LIMIT),
      supabase
        .from("crm_notes")
        .select("id, account_id, contact_id, body, is_ai, created_at, user_id")
        .is("deleted_at", null)
        .eq("is_ai", false)
        .order("created_at", { ascending: false })
        .limit(ROW_LIMIT),
      supabase.from("crm_profiles").select("id, full_name, email"),
    ]);

  const profileById = new Map(((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  type ActivityRow = {
    id: string;
    kind: string;
    summary: string | null;
    body: string | null;
    occurred_at: string;
    user_id: string | null;
    account_id: string | null;
    contact_id: string | null;
  };
  type CallRow = {
    id: string;
    account_id: string | null;
    contact_id: string | null;
    outcome: string | null;
    duration_seconds: number | null;
    summary: string | null;
    notes: string | null;
    occurred_at: string;
    user_id: string | null;
  };
  type NoteRow = {
    id: string;
    account_id: string | null;
    contact_id: string | null;
    body: string;
    created_at: string;
    user_id: string | null;
  };

  const fromActivities: AdminActivityItem[] = ((activityRows ?? []) as ActivityRow[]).map((a) => ({
    id: `activity-${a.id}`,
    type: "activity",
    kind: a.kind,
    title: a.summary || "Activity",
    body: a.body,
    occurredAt: a.occurred_at,
    authorId: a.user_id,
    authorName: profileName(profileById.get(a.user_id ?? "")),
    accountId: a.account_id,
    accountName: null,
    contactId: a.contact_id,
    contactName: null,
  }));

  const fromCalls: AdminActivityItem[] = ((callRows ?? []) as CallRow[]).map((c) => {
    const durLabel = c.duration_seconds ? ` · ${Math.round(c.duration_seconds / 60)}m` : "";
    const outcomeLabel = (c.outcome || "logged").replace(/_/g, " ");
    return {
      id: `call-${c.id}`,
      type: "call",
      kind: CRM_ACTIVITY.call,
      title: `Call · ${outcomeLabel}${durLabel}`,
      body: [c.summary, c.notes].filter(Boolean).join("\n") || null,
      occurredAt: c.occurred_at,
      authorId: c.user_id,
      authorName: profileName(profileById.get(c.user_id ?? "")),
      accountId: c.account_id,
      accountName: null,
      contactId: c.contact_id,
      contactName: null,
    };
  });

  const fromNotes: AdminActivityItem[] = ((noteRows ?? []) as NoteRow[]).map((n) => ({
    id: `note-${n.id}`,
    type: "note",
    kind: CRM_ACTIVITY.noteAdded,
    title: "Note",
    body: n.body,
    occurredAt: n.created_at,
    authorId: n.user_id,
    authorName: profileName(profileById.get(n.user_id ?? "")),
    accountId: n.account_id,
    accountName: null,
    contactId: n.contact_id,
    contactName: null,
  }));

  const merged = [...fromActivities, ...fromCalls, ...fromNotes].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );

  const accountIds = Array.from(new Set(merged.map((m) => m.accountId).filter((v): v is string => !!v)));
  const accountNameById = new Map<string, string>();
  if (accountIds.length) {
    const { data: accountRows } = await supabase.from("crm_accounts").select("id, name").in("id", accountIds);
    for (const row of (accountRows ?? []) as { id: string; name: string }[]) {
      accountNameById.set(row.id, row.name);
    }
  }

  const contactIds = Array.from(new Set(merged.map((m) => m.contactId).filter((v): v is string => !!v)));
  const contactNameById = new Map<string, string>();
  if (contactIds.length) {
    const { data: contactRows } = await supabase.from("crm_contacts").select("id, name").in("id", contactIds);
    for (const row of (contactRows ?? []) as { id: string; name: string }[]) {
      contactNameById.set(row.id, row.name);
    }
  }

  return merged.map((m) => ({
    ...m,
    accountName: m.accountId ? accountNameById.get(m.accountId) ?? null : null,
    contactName: m.contactId ? contactNameById.get(m.contactId) ?? null : null,
  }));
}
