"use server";

import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { firstName as profileFirstName, titleCaseWords } from "../_shell/format";
import type { RepOption } from "../accounts/CompanyDialog";
import type { TaskContactOption } from "./TaskDialog";

export type TaskOfferOptions = {
  contacts: TaskContactOption[];
  reps: RepOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
};

/**
 * Everything a TaskOfferButton needs to render a real TaskDialog — same
 * shape TasksTab/QuickActionsStrip already pass in, fetched fresh here since
 * the "offer a task" moments (lead claimed, added to prospects, OTR
 * released, became an Active Customer, doc sent) happen from pages that
 * don't already have this on hand. Scoped to one company's contacts when an
 * accountId is given (matches TasksTab's usage); empty otherwise.
 */
export async function getTaskOfferOptions(accountId: string | null): Promise<TaskOfferOptions> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const [profilesRes, contactsRes] = await Promise.all([
    supabase.from("crm_profiles").select("id, full_name, email, is_active"),
    accountId
      ? supabase
          .from("crm_contacts")
          .select("id, name, account_id")
          .eq("account_id", accountId)
          .is("deleted_at", null)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; name: string; account_id: string | null }[] }),
  ]);

  const profiles = (profilesRes.data ?? []) as { id: string; full_name: string | null; email: string | null; is_active: boolean }[];
  const reps: RepOption[] = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: profileFirstName(p.full_name, p.email) || "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const contacts: TaskContactOption[] = ((contactsRes.data ?? []) as { id: string; name: string; account_id: string | null }[]).map(
    (c) => ({ id: c.id, name: titleCaseWords(c.name), accountId: c.account_id }),
  );

  return {
    contacts,
    reps,
    canAssignOthers: user.role === "owner",
    currentUser: { id: user.id, label: profileFirstName(user.fullName, user.email) || "You" },
  };
}
