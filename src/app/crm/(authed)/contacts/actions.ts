"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { DEFAULT_LIFECYCLE } from "../accounts/lifecycle";
import { centralInputToIso, titleCaseWords } from "../_shell/format";
import { phonesFromFormValue, linksFromFormValue } from "../_shell/contactFields";
import { syncFollowupTask } from "@/lib/crm/followupTask";
import { roleFromTitle } from "../accounts/[id]/contactRoles";

export type ActionResult =
  | { ok: true; accountId: string | null }
  | { ok: false; error: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v.length ? v : null;
}

function revalidateContactPaths(accountId: string | null) {
  revalidatePath("/crm/contacts");
  revalidatePath("/crm/accounts");
  revalidatePath("/crm");
  if (accountId) revalidatePath(`/crm/accounts/${accountId}`);
}

/**
 * Quick-add a contact from the global Contacts directory — previously the
 * only way to add a contact at all was from inside a company profile. The
 * "company_mode" field (set by AddContactDialog from its CompanyCombobox
 * selection) drives where the contact lands:
 *  - "existing": attach to the chosen crm_accounts row, re-verified here as
 *    org-owned and not deleted rather than trusted from the client.
 *  - "new": create a bare crm_accounts row from just the typed name
 *    (lifecycle_status='lead', source='manual', needs_finalize=true) and
 *    attach the contact there. needs_finalize is what surfaces it on the
 *    dashboard's "Finalize company" alert and the profile banner until
 *    someone fills the rest in via the full company edit dialog.
 *  - anything else ("none" / no typed name): the contact is saved with no
 *    company at all — crm_contacts.account_id is nullable, and the Contacts
 *    directory already renders these (a non-clickable row).
 */
export async function createContactQuick(formData: FormData): Promise<ActionResult> {
  const user = await requireCrmUser();

  const name = titleCaseWords(str(formData, "name"));
  if (!name) return { ok: false, error: "Contact name is required." };

  const companyMode = str(formData, "company_mode");
  const companyId = str(formData, "company_id");
  const companyName = titleCaseWords(str(formData, "company_name"));

  const supabase = await createCrmServerClient();

  let accountId: string | null = null;

  if (companyMode === "existing" && companyId) {
    const { data: account } = await supabase
      .from("crm_accounts")
      .select("id")
      .eq("id", companyId)
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!account) {
      return { ok: false, error: "That company could not be found. Pick it again." };
    }
    accountId = account.id as string;
  } else if (companyMode === "new" && companyName) {
    const { data: newAccount, error } = await supabase
      .from("crm_accounts")
      .insert({
        org_id: user.orgId,
        name: companyName,
        lifecycle_status: DEFAULT_LIFECYCLE,
        source: "manual",
        needs_finalize: true,
      })
      .select("id")
      .single();
    if (error || !newAccount) {
      return { ok: false, error: "Could not create the company. Please try again." };
    }
    accountId = newAccount.id as string;

    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId,
      kind: CRM_ACTIVITY.accountCreated,
      summary: `Company quick-added: ${companyName}`,
    });
  }

  const phones = phonesFromFormValue(formData.get("phones"));
  const links = linksFromFormValue(formData.get("links"));

  const { data: contact, error: contactErr } = await supabase
    .from("crm_contacts")
    .insert({
      org_id: user.orgId,
      account_id: accountId,
      name,
      title: optStr(formData, "title"),
      // Derived from the chosen title, exactly as createContact does, so a
      // person added from the dashboard gets the same coloured role pill as
      // one added from inside a company. Only written when the title is a
      // recognised preset — free text leaves the column alone rather than
      // nulling a role somebody set from the inline pills.
      ...(roleFromTitle(optStr(formData, "title"))
        ? { role_category: roleFromTitle(optStr(formData, "title")) }
        : {}),
      email: optStr(formData, "email"),
      phone: phones[0]?.number || null,
      phones,
      linkedin_url: links[0]?.url || null,
      links,
      best_time_to_call: optStr(formData, "best_time_to_call"),
      notes: optStr(formData, "notes"),
      next_followup_at: centralInputToIso(optStr(formData, "next_followup_at")),
      current_mood: optStr(formData, "current_mood"),
    })
    .select("id")
    .single();

  if (contactErr || !contact) {
    return { ok: false, error: "Could not save the contact. Please try again." };
  }
  const contactId = contact.id as string;

  if (accountId) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId,
      contactId,
      kind: CRM_ACTIVITY.contactAdded,
      summary: `Contact added: ${name}`,
    });

    // THE NOTE GOES ON THE COMPANY, not the person — the same rule
    // createContact follows, and the same reason: what you learn while
    // writing somebody down is a fact about the account, and filing it
    // under a person buries it the moment they leave. A failed note does
    // not fail the save; the contact is already stored.
    const companyNote = (optStr(formData, "company_note") ?? "").trim();
    if (companyNote) {
      const { error: noteErr } = await supabase.from("crm_notes").insert({
        org_id: user.orgId,
        account_id: accountId,
        user_id: user.id,
        body: companyNote,
        is_pinned: false,
        is_ai: false,
      });
      if (!noteErr) {
        await logActivity(supabase, {
          orgId: user.orgId,
          userId: user.id,
          accountId,
          kind: CRM_ACTIVITY.noteAdded,
          summary: "Note added",
        });
      }
    }
  }

  // Keeps a real crm_tasks row in sync with next_followup_at — see
  // src/lib/crm/followupTask.ts's header comment.
  const followupAt = centralInputToIso(optStr(formData, "next_followup_at"));
  const followupTaskId = await syncFollowupTask(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    contactId,
    subjectName: name,
    followupAt,
    existingTaskId: null,
  });
  if (followupTaskId) {
    await supabase.from("crm_contacts").update({ followup_task_id: followupTaskId }).eq("id", contactId);
  }
  if (followupAt) revalidatePath("/crm/tasks");

  revalidateContactPaths(accountId);
  return { ok: true, accountId };
}
