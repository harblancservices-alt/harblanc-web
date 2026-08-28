"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { syncFollowupTask } from "@/lib/crm/followupTask";
import { completeTask, planTask } from "../tasks/actions";
import { callOutcomeLabel } from "./outcomes";
import { centralInputToIso, titleCaseWords } from "../_shell/format";
import { DEFAULT_LIFECYCLE } from "../accounts/lifecycle";
import {
  parsePhones,
  phoneDigits,
  phoneMatchKey,
  findMatchingAccount,
  findMatchingContact,
  type CallDirectory,
  type DirectoryAccount,
  type DirectoryContact,
} from "../_shell/contactFields";

/**
 * Call logging. A call is a first-class record in crm_calls AND an append-only
 * crm_activities row (kind=call) so it shows up on the company timeline. Same
 * contract as every CRM write: resolve the caller with requireCrmUser(), run
 * through the RLS-scoped client, and stamp org_id/user_id from the SESSION so a
 * row can never be written into another org.
 *
 * The "who did you talk to" flow (LogCallDialog) lets Contact/Company/Phone be
 * filled in ANY order and cross-autofills the others when an existing record
 * is picked. Creating a brand-new contact/company on save goes through a
 * server-side dedupe re-check (getCallDirectory powers both the dialog's
 * client-side autocomplete AND this re-check, so the matching rule is defined
 * once — see findMatchingAccount/findMatchingContact in _shell/contactFields)
 * before anything is inserted, so a rep can't accidentally spin up a
 * near-duplicate company/contact just because the picker didn't catch it.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v.length ? v : null;
}
function optInt(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v.length) return null;
  const n = Number.parseInt(v.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function revalidate(accountId: string | null, contactId: string | null) {
  revalidatePath("/crm");
  revalidatePath("/crm/tasks");
  if (accountId) revalidatePath(`/crm/accounts/${accountId}`);
  if (contactId) revalidatePath(`/crm/contacts/${contactId}`);
}

function mergePhones(scalar: unknown, jsonb: unknown) {
  const parsed = parsePhones(jsonb);
  if (parsed.length) return parsed;
  const s = typeof scalar === "string" ? scalar.trim() : "";
  return s ? [{ label: "", number: s }] : [];
}

/**
 * The org's full contact/company roster (id, name, phones) for LogCallDialog's
 * three linked comboboxes — fetched once when the dialog opens so all the
 * cross-autofill and dedupe matching can run client-side against an in-memory
 * list, same shape logCall re-fetches server-side before creating anything.
 */
export async function getCallDirectory(): Promise<CallDirectory> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const [{ data: accountRows }, { data: contactRows }] = await Promise.all([
    supabase
      .from("crm_accounts")
      .select("id, name, phone, phones, primary_contact_id")
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("crm_contacts")
      .select("id, name, account_id, phone, phones")
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .order("name"),
  ]);

  const accountNameById = new Map<string, string>();
  const accounts: DirectoryAccount[] = (
    (accountRows ?? []) as {
      id: string;
      name: string;
      phone: string | null;
      phones: unknown;
      primary_contact_id: string | null;
    }[]
  ).map((a) => {
    accountNameById.set(a.id, a.name);
    return {
      id: a.id,
      name: a.name,
      phones: mergePhones(a.phone, a.phones),
      primaryContactId: a.primary_contact_id ?? null,
    };
  });

  const contacts: DirectoryContact[] = (
    (contactRows ?? []) as {
      id: string;
      name: string;
      account_id: string | null;
      phone: string | null;
      phones: unknown;
    }[]
  ).map((c) => ({
    id: c.id,
    name: c.name,
    accountId: c.account_id ?? null,
    accountName: c.account_id ? accountNameById.get(c.account_id) ?? null : null,
    phones: mergePhones(c.phone, c.phones),
  }));

  return { accounts, contacts };
}

/**
 * Log a call. Contact/company can be an EXISTING record (contact_mode /
 * account_mode = "existing", ids supplied) a BRAND-NEW one to create
 * (= "new", name supplied) or absent (= "none" — the phone-only/unknown-call
 * path, allowed as long as a phone number was captured). Never re-parents an
 * already-existing contact to a different company — if the rep picked an
 * existing contact, the call links to exactly that contact and whatever
 * company it already belongs to; a company typed alongside it only affects
 * NEW records.
 */
export async function logCall(formData: FormData): Promise<ActionResult> {
  const user = await requireCrmUser();

  const outcome = optStr(formData, "outcome");
  if (!outcome) return { ok: false, error: "Pick a call outcome." };

  /**
   * CLOSING A TASK FROM HERE NEEDS NOTES, and the check happens BEFORE any
   * write (2026-08-26). Completing a task requires a close-out note
   * (tasks/actions.ts::completeTask); this flow satisfies that with the
   * call's own notes rather than prompting twice. If they are empty the whole
   * save is refused up front — the alternative is a call that commits and
   * then silently fails to close the task it promised to close, leaving the
   * rep looking at a task they believe they just finished.
   */
  if (optStr(formData, "complete_task_id") && !optStr(formData, "summary")) {
    return {
      ok: false,
      error: "Add a note about the call — closing the task needs a record of what happened.",
    };
  }

  const contactMode = str(formData, "contact_mode");
  const accountMode = str(formData, "account_mode");
  const existingContactId = optStr(formData, "contact_id");
  const existingAccountId = optStr(formData, "account_id");
  const newContactName = optStr(formData, "contact_name");
  const newCompanyName = optStr(formData, "company_name");
  const forceCreateContact = str(formData, "contact_force") === "on";
  const forceCreateAccount = str(formData, "account_force") === "on";
  const rawPhone = optStr(formData, "phone");
  const phoneKey = rawPhone ? phoneMatchKey(rawPhone) : "";

  const durationMinutes = optInt(formData, "duration_minutes");
  const durationSeconds =
    durationMinutes !== null && durationMinutes >= 0 ? durationMinutes * 60 : null;
  const summary = optStr(formData, "summary");
  const notes = optStr(formData, "notes");
  const followupRequired = str(formData, "followup_required") === "on";
  const reminderDate = optStr(formData, "reminder_date");
  const reminderTime = optStr(formData, "reminder_time");
  /* TIME IS OPTIONAL NOW. LogCallDialog still sends both, so its behaviour
     is unchanged. The composer's one-tap chips (Tomorrow / Friday / Next
     week) give a DATE and no time, and requiring a time would have meant
     either inventing a picker nobody asked for or silently dropping the
     follow-up the rep just set. Local midday, the same instant the task
     composer stores a date at, so a timezone shift cannot roll it onto the
     wrong day. */
  const reminderAt =
    followupRequired && reminderDate
      ? centralInputToIso(`${reminderDate}T${reminderTime || "12:00"}`)
      : null;

  const supabase = await createCrmServerClient();

  const needsDirectory = accountMode === "new" || contactMode === "new";
  const directory: CallDirectory | null = needsDirectory ? await getCallDirectory() : null;

  // ── Company ────────────────────────────────────────────────────────────
  let accountId: string | null = null;
  let accountCreated = false;

  if (accountMode === "existing" && existingAccountId) {
    const { data: acct } = await supabase
      .from("crm_accounts")
      .select("id")
      .eq("id", existingAccountId)
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!acct) return { ok: false, error: "That company could not be found. Pick it again." };
    accountId = acct.id as string;
  } else if (accountMode === "new" && newCompanyName) {
    const titled = titleCaseWords(newCompanyName);
    const match = findMatchingAccount(directory!.accounts, titled, rawPhone ?? "");
    if (match && !forceCreateAccount) {
      return {
        ok: false,
        error: `A company named "${match.name}" already exists — pick it from the list instead of creating a new one.`,
      };
    }

    const { data: newAccount, error } = await supabase
      .from("crm_accounts")
      .insert({
        org_id: user.orgId,
        name: titled,
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
    accountCreated = true;

    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId,
      kind: CRM_ACTIVITY.accountCreated,
      summary: `Company added from call log: ${titled}`,
    });
  }

  // ── Contact ────────────────────────────────────────────────────────────
  let contactId: string | null = null;
  let contactCreated = false;

  if (contactMode === "existing" && existingContactId) {
    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("id", existingContactId)
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!contact) return { ok: false, error: "That contact could not be found. Pick it again." };
    contactId = contact.id as string;
  } else if (contactMode === "new" && newContactName) {
    const titled = titleCaseWords(newContactName);
    const match = findMatchingContact(directory!.contacts, titled, rawPhone ?? "");
    if (match && !forceCreateContact) {
      return {
        ok: false,
        error: `A contact named "${match.name}" already exists — pick them from the list instead of creating a new one.`,
      };
    }

    const contactPhones = rawPhone ? [{ label: "Main", number: rawPhone }] : [];
    const { data: newContact, error } = await supabase
      .from("crm_contacts")
      .insert({
        org_id: user.orgId,
        // Only ever the company just resolved above — an EXISTING contact
        // (the branch above) never has its account_id touched here. null is
        // fine and expected: a contact with no company is explicitly allowed.
        account_id: accountId,
        name: titled,
        phone: rawPhone || null,
        phones: contactPhones,
      })
      .select("id")
      .single();
    if (error || !newContact) {
      return { ok: false, error: "Could not create the contact. Please try again." };
    }
    contactId = newContact.id as string;
    contactCreated = true;

    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId,
      contactId,
      kind: CRM_ACTIVITY.contactAdded,
      summary: `Contact added from call log: ${titled}`,
    });
  }

  // Both created together in this same submission — link them and make the
  // new contact the company's primary contact (never touches an existing
  // company's already-set primary contact).
  if (accountCreated && contactCreated && accountId && contactId) {
    await supabase.from("crm_accounts").update({ primary_contact_id: contactId }).eq("id", accountId);
  }

  // Reconciliation-friendly, consistent storage form: 10 US digits when the
  // number resolves to that, otherwise whatever digits were typed (an
  // extension, a malformed entry) rather than mangling it.
  const normalizedPhone = rawPhone
    ? phoneKey.length === 10
      ? phoneKey
      : phoneDigits(rawPhone)
    : null;

  const { data: newCall, error: callError } = await supabase
    .from("crm_calls")
    .insert({
      org_id: user.orgId,
      account_id: accountId,
      contact_id: contactId,
      user_id: user.id,
      outcome,
      /* HOW IT WENT, when they got through. A second answer needs a second
         column: `outcome` is what every existing surface reads for "did
         you connect", and overloading it would make a timeline chip say
         "Wants a quote" where it used to say whether the phone was
         answered. `disposition` has existed all along, is read nowhere
         else and held 0 of 52 rows — so this needed no migration. */
      disposition: optStr(formData, "disposition"),
      duration_seconds: durationSeconds,
      summary,
      notes,
      followup_required: followupRequired,
      reminder_at: reminderAt,
      phone: normalizedPhone,
    })
    .select("id")
    .single();

  if (callError || !newCall) {
    return { ok: false, error: "Could not log the call. Please try again." };
  }

  // Keeps a real crm_tasks row in sync with the reminder — see
  // src/lib/crm/followupTask.ts's header comment. Each logged call is its
  // own row (never edited in place), so this always creates a fresh task
  // rather than upserting one (existingTaskId is always null here) — two
  // different calls' reminders shouldn't share/overwrite one task.
  if (reminderAt) {
    let subjectName = "this contact";
    if (contactId) {
      const { data: c } = await supabase.from("crm_contacts").select("name").eq("id", contactId).maybeSingle();
      if (c?.name) subjectName = c.name as string;
    } else if (accountId) {
      const { data: a } = await supabase.from("crm_accounts").select("name").eq("id", accountId).maybeSingle();
      if (a?.name) subjectName = a.name as string;
    } else if (normalizedPhone) {
      subjectName = normalizedPhone;
    }

    /* The follow-up belongs to whoever owns the company, not to whoever
       logged the call — an admin ringing round somebody else's book should
       leave the callback on THEIR board. Falls back to the caller when
       there is no company or nobody owns it. */
    let followupOwner: string | null = null;
    if (accountId) {
      const { data: owner } = await supabase
        .from("crm_accounts")
        .select("assigned_user_id")
        .eq("id", accountId)
        .is("deleted_at", null)
        .maybeSingle();
      followupOwner = (owner?.assigned_user_id as string | null) ?? null;
    }

    const followupTaskId = await syncFollowupTask(supabase, {
      orgId: user.orgId,
      userId: user.id,
      assignToUserId: followupOwner,
      accountId,
      contactId,
      subjectName,
      followupAt: reminderAt,
      /* The composer drafts this from the note and the outcome. Absent
         from every other caller, which keeps "Follow up with X". */
      title: optStr(formData, "followup_title"),
      existingTaskId: null,
    });
    if (followupTaskId) {
      await supabase.from("crm_calls").update({ followup_task_id: followupTaskId }).eq("id", newCall.id);
    }
    revalidatePath("/crm/tasks");
  }

  // Best-effort: record that we spoke to this contact.
  if (contactId) {
    await supabase
      .from("crm_contacts")
      .update({ last_contacted_at: new Date().toISOString() })
      .eq("id", contactId);
  }

  const label = callOutcomeLabel(outcome);
  const durLabel = durationMinutes ? ` · ${durationMinutes}m` : "";
  const unlinkedNote = !accountId && !contactId && normalizedPhone ? " · Unlinked number" : "";
  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    contactId,
    kind: CRM_ACTIVITY.call,
    summary: `Call · ${label}${durLabel}${unlinkedNote}`,
    body: summary,
    meta: {
      outcome,
      duration_seconds: durationSeconds,
      followup_required: followupRequired,
      reminder_at: reminderAt,
      phone: normalizedPhone,
    },
  });

  // ── "Log call" straight off a task card ────────────────────────────────
  // The task that told the rep to make this call is closed by the same save,
  // so the job-to-be-done ("call them, log it, move on") is one flow instead
  // of three. Only ever set by TaskCard's Log-call trigger, which passes the
  // task's own id; every other LogCallDialog call site omits it entirely.
  //
  // Deliberately LAST and deliberately best-effort: the call itself is
  // already committed above, so a completion failure must not turn a saved
  // call into an error the rep sees. completeTask() is reused whole rather
  // than a bare status update here — it carries the task_completed activity
  // log AND the follow-up reverse-sync, and it re-resolves the caller through
  // RLS itself, so a tampered task id can't close someone else's org's task.
  //
  // Note this runs even when the rep set a follow-up reminder above: that
  // creates a NEW follow-up task for the next touch, which is correct — the
  // old task is done, the next one is scheduled.
  //
  // THE CALL'S OWN NOTES ARE THE COMPLETION NOTE. Closing a task is meant to
  // produce evidence of what happened, and `summary` is exactly that — so it
  // rides through rather than prompting the rep a second time for something
  // they just typed. Guaranteed non-empty by the guard at the top.
  //
  // AND THE CALL PLANS THE TASK IF NOBODY DID. completeTask also refuses work
  // that was never planned (no due_at). An unplanned task being closed by a
  // logged call is not a rule violation — the call IS the doing of it, today
  // — so this dates it to today first rather than failing. That keeps the
  // "you must plan work" rule about the PLANNING BOARD, where a person is
  // choosing when to do something, instead of blocking a rep who has already
  // done it.
  const completeTaskId = optStr(formData, "complete_task_id");
  if (completeTaskId) {
    const done = await completeTask(completeTaskId, summary);
    if (!done.ok && done.reason === "not_planned") {
      await planTask(completeTaskId, "today");
      await completeTask(completeTaskId, summary);
    }
  }

  revalidate(accountId, contactId);
  return { ok: true };
}

/**
 * Soft-delete a call log entry. Calls are operational (not a shared org-wide
 * record), so this is allowed for any CRM user — no role gate, matching
 * task/note deletes. The append-only crm_activities entry for the call is
 * left untouched (it's a historical record of the timeline, not the log
 * itself), matching how deleteContact leaves the activity feed alone.
 */
export async function deleteCall(
  callId: string,
  accountId: string,
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_calls")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", callId);

  if (error) return { ok: false, error: "Could not delete the call." };

  revalidate(accountId, null);
  return { ok: true };
}
