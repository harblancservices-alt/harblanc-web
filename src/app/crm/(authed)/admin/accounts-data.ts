import { createCrmServerClient } from "@/lib/crm/auth";
import type { AdminTeamMember, AdminTeamMemberRow } from "./types";

/**
 * The Admin Account "Accounts" tab's team roster — every crm_profiles row in
 * the org, plus the two counts the detail page's profile card shows
 * ("Companies owned", "Open tasks") and a "Last active" readout (reusing the
 * same crm_user_events newest-first reduction settings/page.tsx already does
 * for its per-member "Last seen" column). Caller is assumed already
 * owner-gated (requireCrmAdmin(), called by every page/layout under
 * /crm/admin) — this is a plain data read, not itself a security boundary.
 */
export async function listTeamMembers(): Promise<AdminTeamMember[]> {
  const supabase = await createCrmServerClient();

  const [{ data: profileRows }, { data: accountRows }, { data: taskRows }, { data: eventRows }] =
    await Promise.all([
      supabase
        .from("crm_profiles")
        .select("id, full_name, email, role, is_active, is_primary_owner, can_view_all_companies, created_at")
        .order("full_name", { ascending: true }),
      supabase.from("crm_accounts").select("assigned_user_id").is("deleted_at", null).not("assigned_user_id", "is", null),
      supabase.from("crm_tasks").select("assigned_user_id").eq("status", "open").not("assigned_user_id", "is", null),
      supabase.from("crm_user_events").select("user_id, created_at").order("created_at", { ascending: false }).limit(2000),
    ]);

  const companiesOwnedByUser = new Map<string, number>();
  for (const row of (accountRows ?? []) as { assigned_user_id: string }[]) {
    companiesOwnedByUser.set(row.assigned_user_id, (companiesOwnedByUser.get(row.assigned_user_id) ?? 0) + 1);
  }

  const openTasksByUser = new Map<string, number>();
  for (const row of (taskRows ?? []) as { assigned_user_id: string }[]) {
    openTasksByUser.set(row.assigned_user_id, (openTasksByUser.get(row.assigned_user_id) ?? 0) + 1);
  }

  const lastActiveByUser = new Map<string, string>();
  for (const row of (eventRows ?? []) as { user_id: string; created_at: string }[]) {
    if (!lastActiveByUser.has(row.user_id)) lastActiveByUser.set(row.user_id, row.created_at);
  }

  const members = ((profileRows ?? []) as AdminTeamMemberRow[]).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    role: r.role,
    isActive: r.is_active,
    isPrimaryOwner: r.is_primary_owner,
    canViewAllCompanies: r.can_view_all_companies,
    createdAt: r.created_at,
    companiesOwned: companiesOwnedByUser.get(r.id) ?? 0,
    openTasks: openTasksByUser.get(r.id) ?? 0,
    lastActiveAt: lastActiveByUser.get(r.id) ?? null,
  }));

  return members.sort((a, b) => {
    if (a.isPrimaryOwner !== b.isPrimaryOwner) return a.isPrimaryOwner ? -1 : 1;
    if (a.role === "owner" && b.role !== "owner") return -1;
    if (b.role === "owner" && a.role !== "owner") return 1;
    return (a.fullName || a.email || "").localeCompare(b.fullName || b.email || "");
  });
}
