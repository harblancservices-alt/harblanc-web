"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { normalizeStage, stageLabel, stageRank, DEFAULT_LIFECYCLE } from "./lifecycle";
import { centralInputToIso, titleCaseWords, upperCaseState } from "../_shell/format";
import { phonesFromFormValue, linksFromFormValue, parsePhones, looksLikePhone } from "../_shell/contactFields";
import { MOOD_VALUES } from "../_shell/mood";
import { syncFollowupTask } from "@/lib/crm/followupTask";

/**
 * Every write in the Hello Hotshot CRM lives here. All actions share the same
 * contract: resolve the caller with requireCrmUser(), run through the
 * RLS-scoped CRM client, stamp org_id (and user_id) from the SESSION — never
 * from client input — so a row can never be written into another org, and log
 * an append-only activity for the events the timeline cares about.
 */

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type CreateAccountResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// ── FormData helpers ─────────────────────────────────────────────────────────
function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v.length ? v : null;
}
function optNum(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v.length) return null;
  const n = Number.parseFloat(v.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
/** Proper-noun fields (name/company/address/city) — title-cased on save so
 * garbage/inconsistent casing never reaches the DB for new writes. */
function optTitleCase(fd: FormData, key: string): string | null {
  const v = optStr(fd, key);
  return v ? titleCaseWords(v) : null;
}
function optState(fd: FormData, key: string): string | null {
  const v = optStr(fd, key);
  return v ? upperCaseState(v) : null;
}

/**
 * The company field set, shared by create and edit — but PARTIAL by design:
 * a key only appears in the returned object when that form actually
 * submitted it (`fd.has(...)`). CompanyDialog's full modal always includes
 * every field, so its behavior is unchanged; the profile's inline Company
 * card only edits a subset (name/address/phones/links/commodities) and must
 * NOT silently null out industry/company_size/spend/source just because its
 * smaller form doesn't carry them. `phones`/`links` are the source of truth
 * (edited via PhonesEditor/LinksEditor) — `phone`/`website` are mirrored
 * alongside from the first entry of each, purely so anything else that still
 * reads those scalar columns directly keeps working.
 */
function accountFieldsFromForm(fd: FormData): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (fd.has("name")) fields.name = titleCaseWords(str(fd, "name"));
  if (fd.has("industry")) fields.industry = optStr(fd, "industry");
  if (fd.has("company_type")) fields.company_type = optStr(fd, "company_type");
  if (fd.has("email")) fields.email = optStr(fd, "email");
  if (fd.has("phones")) {
    const phones = phonesFromFormValue(fd.get("phones"));
    fields.phones = phones;
    fields.phone = phones[0]?.number || null;
  }
  if (fd.has("links")) {
    const links = linksFromFormValue(fd.get("links"));
    fields.links = links;
    fields.website = links[0]?.url || null;
  }
  if (fd.has("address")) fields.address = optTitleCase(fd, "address");
  if (fd.has("city")) fields.city = optTitleCase(fd, "city");
  if (fd.has("state")) fields.state = optState(fd, "state");
  if (fd.has("zip")) fields.zip = optStr(fd, "zip");
  if (fd.has("company_size")) fields.company_size = optStr(fd, "company_size");
  if (fd.has("commodities")) fields.commodities = optStr(fd, "commodities");
  if (fd.has("annual_freight_spend")) {
    fields.annual_freight_spend = optNum(fd, "annual_freight_spend");
  }
  if (fd.has("revenue_potential")) {
    fields.revenue_potential = optNum(fd, "revenue_potential");
  }
  if (fd.has("source")) fields.source = optStr(fd, "source");
  return fields;
}

/**
 * The simplified CREATE form's single "Website or phone" field — mostly-digit
 * input becomes a phone entry, anything else a website link. EDIT mode still
 * uses the full PhonesEditor/LinksEditor pair, so this only ever runs from
 * createAccount.
 */
function contactValueFields(raw: string): Record<string, unknown> {
  if (looksLikePhone(raw)) {
    return { phones: [{ label: "Main", number: raw }], phone: raw };
  }
  return { links: [{ label: "Website", url: raw }], website: raw };
}

function revalidateAccount(id?: string) {
  revalidatePath("/crm/accounts");
  revalidatePath("/crm/contacts");
  revalidatePath("/crm");
  if (id) revalidatePath(`/crm/accounts/${id}`);
}

// ── Companies ────────────────────────────────────────────────────────────────

export type DuplicateMatch = { id: string; name: string; matchedOn: string[] };

/**
 * Basic duplicate check run before a NEW company is created — name (exact,
 * case-insensitive, after the same normalization saved names already go
 * through), phone (digits-only against the mirrored `phone` scalar), and
 * email domain (against the mirrored `email` scalar). Deliberately basic per
 * the "flag deeper dedupe for later" instruction — no fuzzy/MC/DOT matching,
 * no blocking (the caller can always proceed after seeing the warning).
 */
export async function findPossibleDuplicates(
  name: string,
  phone: string | null,
  email: string | null,
): Promise<DuplicateMatch[]> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const normalizedName = titleCaseWords(name).trim();
  const phoneDigits = phone ? phone.replace(/\D/g, "") : "";
  const emailDomain = email && email.includes("@") ? email.split("@")[1]?.toLowerCase() : null;

  if (!normalizedName && !phoneDigits && !emailDomain) return [];

  const { data } = await supabase
    .from("crm_accounts")
    .select("id, name, phone, email")
    .is("deleted_at", null)
    .limit(500);

  const matches = new Map<string, DuplicateMatch>();
  for (const row of (data ?? []) as { id: string; name: string; phone: string | null; email: string | null }[]) {
    const reasons: string[] = [];
    if (normalizedName && row.name.trim().toLowerCase() === normalizedName.toLowerCase()) reasons.push("name");
    if (phoneDigits && row.phone && row.phone.replace(/\D/g, "") === phoneDigits) reasons.push("phone");
    if (emailDomain && row.email && row.email.includes("@") && row.email.split("@")[1]?.toLowerCase() === emailDomain) {
      reasons.push("email domain");
    }
    if (reasons.length) matches.set(row.id, { id: row.id, name: row.name, matchedOn: reasons });
  }

  return Array.from(matches.values());
}

/**
 * Create a company for the caller's org and log the first timeline entry.
 * org_id + assigned rep come from the session; RLS WITH CHECK enforces org.
 */
export async function createAccount(
  formData: FormData,
): Promise<CreateAccountResult> {
  const user = await requireCrmUser();

  const fields = accountFieldsFromForm(formData);
  if (!fields.name) return { ok: false, error: "Company name is required." };

  // Simplified CREATE form's single "Website or phone" field — the full
  // PhonesEditor/LinksEditor pair isn't rendered in create mode.
  const contactValue = optStr(formData, "contact_value");
  if (contactValue) Object.assign(fields, contactValueFields(contactValue));

  const lifecycle = normalizeStage(
    str(formData, "lifecycle_status") || DEFAULT_LIFECYCLE,
  );
  // Optional rep from the form; default to the creator.
  const assigned = optStr(formData, "assigned_user_id") ?? user.id;

  const supabase = await createCrmServerClient();
  const { data, error } = await supabase
    .from("crm_accounts")
    .insert({
      org_id: user.orgId,
      ...fields,
      lifecycle_status: lifecycle,
      assigned_user_id: assigned,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not save the company. Please try again." };
  }

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId: data.id as string,
    kind: CRM_ACTIVITY.accountCreated,
    summary: "Company created",
  });

  revalidateAccount(data.id as string);
  return { ok: true, id: data.id as string };
}

/**
 * Update a company's fields — partial, driven entirely by whatever the
 * caller's form actually submits (see accountFieldsFromForm). Two callers:
 * CompanyDialog's full modal (every field, still reachable from the profile's
 * Details tab) and the profile's inline Company card (name/address/phones/
 * links/commodities only). If the lifecycle stage moves as part of the edit,
 * that change is logged too. Always clears needs_finalize — a save from
 * either path is the "someone filled the rest in" signal the finalize alert
 * (the dashboard's "Finalize company" queue + the profile banner) waits for.
 */
export async function updateAccount(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireCrmUser();

  const fields = accountFieldsFromForm(formData);
  if (!fields.name) return { ok: false, error: "Company name is required." };

  const supabase = await createCrmServerClient();

  // Read the prior stage so we can detect a move and log it.
  const { data: prior } = await supabase
    .from("crm_accounts")
    .select("lifecycle_status")
    .eq("id", id)
    .maybeSingle();

  const nextStage = normalizeStage(
    str(formData, "lifecycle_status") || (prior?.lifecycle_status as string),
  );
  const assigned = optStr(formData, "assigned_user_id");

  const { error } = await supabase
    .from("crm_accounts")
    .update({
      ...fields,
      lifecycle_status: nextStage,
      ...(assigned !== null ? { assigned_user_id: assigned } : {}),
      needs_finalize: false,
    })
    .eq("id", id);

  if (error) {
    return { ok: false, error: "Could not update the company. Please try again." };
  }

  const priorStage = prior ? normalizeStage(prior.lifecycle_status as string) : null;
  if (priorStage && priorStage !== nextStage) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: id,
      kind: CRM_ACTIVITY.lifecycleChanged,
      summary: `Stage changed: ${stageLabel(priorStage)} → ${stageLabel(nextStage)}`,
      meta: { from: priorStage, to: nextStage },
    });
  }

  revalidateAccount(id);
  return { ok: true };
}

/** Move a company to a new lifecycle stage and log the transition. */
export async function updateLifecycleStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const next = normalizeStage(status);
  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_accounts")
    .select("lifecycle_status")
    .eq("id", id)
    .maybeSingle();

  const priorStage = prior ? normalizeStage(prior.lifecycle_status as string) : null;
  if (priorStage === next) return { ok: true };

  const { error } = await supabase
    .from("crm_accounts")
    .update({ lifecycle_status: next })
    .eq("id", id);

  if (error) {
    return { ok: false, error: "Could not change the stage. Please try again." };
  }

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId: id,
    kind: CRM_ACTIVITY.lifecycleChanged,
    summary: priorStage
      ? `Stage changed: ${stageLabel(priorStage)} → ${stageLabel(next)}`
      : `Stage set to ${stageLabel(next)}`,
    meta: { from: priorStage, to: next },
  });

  revalidateAccount(id);
  return { ok: true };
}

/**
 * The single shared "send to Prospects and publish into the agent claim
 * queue" action — used by BOL Center (admin/bol-center/actions.ts) and OTR
 * (admin/otr/actions.ts) so both intake funnels feed /crm/ai-agent through
 * the exact same rule, not two parallel copies that could drift.
 *
 * Two independent things happen together, both idempotent:
 *  - Lifecycle promotion, guardrail-checked: only advances the company to
 *    'prospect' when its current stage genuinely ranks below it (lead/
 *    researching/contacted) — one already at or beyond Prospect (in_the_
 *    door/quoted/active_customer, or the terminal inactive/lost) is left
 *    exactly where it is. This is the ONE place either caller should ever
 *    write lifecycle_status for this purpose.
 *  - ai_status is set to 'released' UNCONDITIONALLY (not gated on whether a
 *    stage change happened) — that's what makes the company appear in the
 *    claim queue at all; /crm/ai-agent and claimAiLead() key on ai_status/
 *    source, not lifecycle stage, so a company already sitting at Prospect
 *    (or beyond) still needs this to become claimable.
 *
 * assigned_user_id is never written here — leaving it untouched (normally
 * still NULL for a fresh intake) is what keeps the company claimable; the
 * claim queue's own `assigned_user_id IS NULL` gate is what actually keeps
 * an already-owned company from surfacing there, so there's nothing extra
 * to guard. source is only set when the account has none yet — a real
 * existing source is never clobbered.
 */
export async function promoteAccountToProspect(
  supabase: Awaited<ReturnType<typeof createCrmServerClient>>,
  user: { orgId: string; id: string },
  accountId: string,
  sourceIfMissing: string,
  activitySummary = "Added to Prospects",
): Promise<ActionResult> {
  const { data: account } = await supabase.from("crm_accounts").select("lifecycle_status, source").eq("id", accountId).maybeSingle();
  if (!account) return { ok: false, error: "Company not found." };

  const currentStage = normalizeStage(account.lifecycle_status as string | null);
  const willPromote = stageRank(currentStage) < stageRank("prospect");

  const fields: { lifecycle_status?: string; source?: string; ai_status: string } = { ai_status: "released" };
  if (willPromote) fields.lifecycle_status = "prospect";
  if (!account.source) fields.source = sourceIfMissing;

  const { error } = await supabase.from("crm_accounts").update(fields).eq("id", accountId);
  if (error) return { ok: false, error: "Could not update the company." };

  if (willPromote) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId,
      kind: CRM_ACTIVITY.lifecycleChanged,
      summary: activitySummary,
    });
  }

  revalidateAccount(accountId);
  revalidatePath("/crm/ai-agent");
  return { ok: true };
}

/** Set (or clear, passing null) the 1–10 Prospect-stage level meter on the
 * stage tracker — crm_accounts.prospect_level. Only ever shown/editable while
 * the company sits on the Prospect stage, but the write itself doesn't
 * re-check that: an out-of-stage value just won't be visible until the
 * company is back on Prospect. */
export async function updateProspectLevel(
  id: string,
  level: number | null,
): Promise<ActionResult> {
  await requireCrmUser();
  if (level !== null && (!Number.isInteger(level) || level < 1 || level > 10)) {
    return { ok: false, error: "Level must be between 1 and 10." };
  }
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_accounts")
    .update({ prospect_level: level })
    .eq("id", id);

  if (error) {
    return { ok: false, error: "Could not save the prospect level. Please try again." };
  }

  revalidateAccount(id);
  return { ok: true };
}

/**
 * Soft-delete a company (set deleted_at). Admin-only (role=owner) — a
 * company is a shared record, same defense-in-depth reasoning as
 * settings/actions.ts::updateBrokerProfile. RLS only scopes crm_accounts to
 * the org, not by role, so this app-layer check is the enforcement point.
 */
export async function deleteAccount(id: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only an admin can delete a company." };
  }

  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_accounts")
    .select("name")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!prior) return { ok: false, error: "Company not found." };

  const { error } = await supabase
    .from("crm_accounts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: "Could not delete the company." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId: id,
    kind: CRM_ACTIVITY.accountDeleted,
    summary: `Company deleted: ${prior.name as string}`,
  });

  revalidateAccount(id);
  return { ok: true };
}

// ── Tags ─────────────────────────────────────────────────────────────────────

/** Attach an existing tag to a company (idempotent via the unique index). */
export async function attachTag(
  accountId: string,
  tagId: string,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_account_tags")
    .upsert(
      { org_id: user.orgId, account_id: accountId, tag_id: tagId },
      { onConflict: "account_id,tag_id", ignoreDuplicates: true },
    );

  if (error) return { ok: false, error: "Could not add the tag." };
  revalidateAccount(accountId);
  return { ok: true };
}

/** Remove a tag from a company (the tag itself is left intact for reuse). */
export async function detachTag(
  accountId: string,
  tagId: string,
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_account_tags")
    .delete()
    .eq("account_id", accountId)
    .eq("tag_id", tagId);

  if (error) return { ok: false, error: "Could not remove the tag." };
  revalidateAccount(accountId);
  return { ok: true };
}

/** Create a brand-new tag in the org and attach it to the company. */
export async function createTag(
  accountId: string,
  label: string,
  color: string | null,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Tag name is required." };

  const supabase = await createCrmServerClient();
  const { data: tag, error } = await supabase
    .from("crm_tags")
    .insert({ org_id: user.orgId, label: trimmed, color: color?.trim() || null })
    .select("id")
    .single();

  if (error || !tag) return { ok: false, error: "Could not create the tag." };

  const { error: linkErr } = await supabase.from("crm_account_tags").upsert(
    { org_id: user.orgId, account_id: accountId, tag_id: tag.id as string },
    { onConflict: "account_id,tag_id", ignoreDuplicates: true },
  );
  if (linkErr) return { ok: false, error: "Tag created, but could not attach it." };

  revalidateAccount(accountId);
  return { ok: true };
}

// ── Contacts ─────────────────────────────────────────────────────────────────

/**
 * `phones`/`links` are the source of truth (edited via PhonesEditor/
 * LinksEditor); `phone`/`linkedin_url` are still written alongside, mirrored
 * from the first entry of each list, for anything else that still reads
 * those scalar columns directly.
 */
function contactFieldsFromForm(fd: FormData) {
  const phones = phonesFromFormValue(fd.get("phones"));
  const links = linksFromFormValue(fd.get("links"));
  return {
    name: titleCaseWords(str(fd, "name")),
    title: optStr(fd, "title"),
    email: optStr(fd, "email"),
    phone: phones[0]?.number || null,
    phones,
    linkedin_url: links[0]?.url || null,
    links,
    best_time_to_call: optStr(fd, "best_time_to_call"),
    notes: optStr(fd, "notes"),
    // Comes in as a datetime-local value the dialog shows in Central time
    // (toDatetimeLocal) — convert back through the same Central
    // interpretation rather than storing the naive string as-is.
    next_followup_at: centralInputToIso(optStr(fd, "next_followup_at")),
    // role_category is deliberately NOT here — ContactDialog no longer
    // submits it (role-setting moved to the inline RoleControl pills, saved
    // instantly via setContactRole). Leaving it out of this object means
    // create/update never touch the column, so a save from this form can't
    // silently null out a role a rep already set via the pills.
    //
    // current_mood IS here, unlike role — Brent's explicit call: mood is set
    // from this form at creation time (MoodPicker), then changed afterward
    // via the separate inline MoodControl (mirrors RoleControl's own
    // instant-save pattern). Since ContactDialog always renders MoodPicker
    // with the contact's existing mood as its defaultValue, a save that
    // doesn't touch the picker resubmits the same value — never a silent
    // null-out the way excluding it entirely (like role_category) guards
    // against.
    current_mood: optStr(fd, "current_mood"),
  };
}

export async function createContact(
  accountId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const fields = contactFieldsFromForm(formData);
  if (!fields.name) return { ok: false, error: "Contact name is required." };

  const supabase = await createCrmServerClient();
  const { data, error } = await supabase
    .from("crm_contacts")
    .insert({
      org_id: user.orgId,
      account_id: accountId,
      ...fields,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not save the contact. Please try again." };
  }
  const contactId = data.id as string;

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    contactId,
    kind: CRM_ACTIVITY.contactAdded,
    summary: `Contact added: ${fields.name}`,
  });

  // Keeps a real crm_tasks row in sync with next_followup_at — see
  // src/lib/crm/followupTask.ts's header comment for why this exists (a
  // follow-up date used to save with no linked task, so it never showed up
  // on the real Tasks page).
  const followupTaskId = await syncFollowupTask(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    contactId,
    subjectName: fields.name,
    followupAt: fields.next_followup_at,
    existingTaskId: null,
  });
  if (followupTaskId) {
    await supabase.from("crm_contacts").update({ followup_task_id: followupTaskId }).eq("id", contactId);
  }

  revalidateAccount(accountId);
  revalidatePath("/crm/tasks");
  return { ok: true };
}

export async function updateContact(
  contactId: string,
  accountId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const fields = contactFieldsFromForm(formData);
  if (!fields.name) return { ok: false, error: "Contact name is required." };

  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase.from("crm_contacts").select("followup_task_id").eq("id", contactId).maybeSingle();

  const { error } = await supabase
    .from("crm_contacts")
    .update({ ...fields })
    .eq("id", contactId);

  if (error) {
    return { ok: false, error: "Could not update the contact. Please try again." };
  }

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    contactId,
    kind: CRM_ACTIVITY.contactUpdated,
    summary: `Contact updated: ${fields.name}`,
  });

  const followupTaskId = await syncFollowupTask(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    contactId,
    subjectName: fields.name,
    followupAt: fields.next_followup_at,
    existingTaskId: (prior?.followup_task_id as string | null) ?? null,
  });
  if (followupTaskId !== (prior?.followup_task_id ?? null)) {
    await supabase.from("crm_contacts").update({ followup_task_id: followupTaskId }).eq("id", contactId);
  }

  revalidateAccount(accountId);
  revalidatePath("/crm/tasks");
  return { ok: true };
}

/**
 * Soft-delete a contact (set deleted_at). Admin-only (role=owner) — a
 * contact is a shared record, same defense-in-depth reasoning as
 * deleteAccount above. If it was the company's primary contact, clear that
 * pointer so the profile never references a hidden row.
 */
export async function deleteContact(
  contactId: string,
  accountId: string,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only an admin can delete a contact." };
  }

  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_contacts")
    .select("name")
    .eq("id", contactId)
    .maybeSingle();

  const { error } = await supabase
    .from("crm_contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", contactId);

  if (error) return { ok: false, error: "Could not delete the contact." };

  // Clear primary_contact_id if it pointed at this contact.
  await supabase
    .from("crm_accounts")
    .update({ primary_contact_id: null })
    .eq("id", accountId)
    .eq("primary_contact_id", contactId);

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    contactId,
    kind: CRM_ACTIVITY.contactDeleted,
    summary: `Contact deleted: ${(prior?.name as string) ?? "Contact"}`,
  });

  revalidateAccount(accountId);
  return { ok: true };
}

/** Set (or clear) a company's primary contact. */
export async function setPrimaryContact(
  accountId: string,
  contactId: string | null,
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_accounts")
    .update({ primary_contact_id: contactId })
    .eq("id", accountId);

  if (error) return { ok: false, error: "Could not set the primary contact." };
  revalidateAccount(accountId);
  return { ok: true };
}

/**
 * Set (or clear) a contact's role category — a single-field instant-save,
 * same shape as updateLifecycleStatus/assignRep, so the role pills on the
 * contact profile page, the Contacts tab rows, and the Overview People cards
 * can all write directly with one tap instead of going through the edit
 * dialog (role-setting was deliberately pulled OUT of ContactDialog once
 * every surface got its own inline picker — see roles.ts/RoleControl.tsx).
 * accountId is nullable (a contact can exist with no company) purely for
 * cache revalidation, not a DB filter.
 */
export async function setContactRole(
  contactId: string,
  accountId: string | null,
  role: string | null,
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_contacts")
    .update({ role_category: role })
    .eq("id", contactId);

  if (error) return { ok: false, error: "Could not update the role." };
  revalidateAccount(accountId ?? undefined);
  revalidatePath(`/crm/contacts/${contactId}`);
  return { ok: true };
}

/** Instant-save for MoodControl — same shape as setContactRole. `mood` is
 * validated against the real vocabulary here too (not just trusted from the
 * client) since the DB check constraint would reject anything else anyway;
 * failing fast with a clear error beats a raw constraint-violation message. */
export async function setContactMood(
  contactId: string,
  accountId: string | null,
  mood: string | null,
): Promise<ActionResult> {
  await requireCrmUser();
  if (mood && !(MOOD_VALUES as string[]).includes(mood)) {
    return { ok: false, error: "Not a valid mood." };
  }
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_contacts")
    .update({ current_mood: mood })
    .eq("id", contactId);

  if (error) return { ok: false, error: "Could not update the mood." };
  revalidateAccount(accountId ?? undefined);
  revalidatePath(`/crm/contacts/${contactId}`);
  return { ok: true };
}

/**
 * Move a labeled number off the company's own phones list onto one of its
 * contacts — the "Assign to contact" action in the profile's Stray numbers
 * section. `label` is whatever the picker on that row currently shows (it may
 * have been relabeled before assigning), `originalNumber` locates the entry
 * to remove from crm_accounts.phones.
 */
export async function assignCompanyPhoneToContact(
  accountId: string,
  originalNumber: string,
  label: string,
  contactId: string,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: account } = await supabase
    .from("crm_accounts")
    .select("phones")
    .eq("id", accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!account) return { ok: false, error: "Company not found." };

  const companyPhones = parsePhones(account.phones);
  const idx = companyPhones.findIndex((p) => p.number === originalNumber.trim());
  if (idx === -1) {
    return { ok: false, error: "That number is no longer on the company." };
  }

  const { data: contact } = await supabase
    .from("crm_contacts")
    .select("name, phones")
    .eq("id", contactId)
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!contact) return { ok: false, error: "That contact could not be found." };

  const nextCompanyPhones = companyPhones.filter((_, i) => i !== idx);
  const nextContactPhones = [
    ...parsePhones(contact.phones),
    { label: label.trim(), number: originalNumber.trim() },
  ];

  const [accountUpdate, contactUpdate] = await Promise.all([
    supabase
      .from("crm_accounts")
      .update({ phones: nextCompanyPhones, phone: nextCompanyPhones[0]?.number || null })
      .eq("id", accountId),
    supabase
      .from("crm_contacts")
      .update({ phones: nextContactPhones, phone: nextContactPhones[0]?.number || null })
      .eq("id", contactId),
  ]);

  if (accountUpdate.error || contactUpdate.error) {
    return { ok: false, error: "Could not move the number. Please try again." };
  }

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    contactId,
    kind: CRM_ACTIVITY.contactUpdated,
    summary: `Number moved to ${contact.name as string}`,
  });

  revalidateAccount(accountId);
  return { ok: true };
}

/**
 * Spin up a brand-new contact on this company from a stray company-level
 * number — the other half of the Stray numbers section's two actions. Removes
 * the number from crm_accounts.phones once the new contact carries it.
 */
export async function createContactFromPhone(
  accountId: string,
  input: { name: string; title: string | null; label: string; number: string },
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Contact name is required." };

  const supabase = await createCrmServerClient();

  const { data: account } = await supabase
    .from("crm_accounts")
    .select("phones")
    .eq("id", accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!account) return { ok: false, error: "Company not found." };

  const companyPhones = parsePhones(account.phones);
  const idx = companyPhones.findIndex((p) => p.number === input.number.trim());
  if (idx === -1) {
    return { ok: false, error: "That number is no longer on the company." };
  }
  const nextCompanyPhones = companyPhones.filter((_, i) => i !== idx);
  const contactPhones = [{ label: input.label.trim(), number: input.number.trim() }];

  const { data: contact, error: contactErr } = await supabase
    .from("crm_contacts")
    .insert({
      org_id: user.orgId,
      account_id: accountId,
      name,
      title: input.title,
      phone: contactPhones[0].number,
      phones: contactPhones,
    })
    .select("id")
    .single();

  if (contactErr || !contact) {
    return { ok: false, error: "Could not create the contact. Please try again." };
  }

  const { error: accountErr } = await supabase
    .from("crm_accounts")
    .update({ phones: nextCompanyPhones, phone: nextCompanyPhones[0]?.number || null })
    .eq("id", accountId);
  if (accountErr) {
    return {
      ok: false,
      error: "Contact created, but could not remove the number from the company.",
    };
  }

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    contactId: contact.id as string,
    kind: CRM_ACTIVITY.contactAdded,
    summary: `Contact added from stray number: ${name}`,
  });

  revalidateAccount(accountId);
  return { ok: true };
}

// ── Notes ────────────────────────────────────────────────────────────────────

export async function addNote(
  accountId: string,
  body: string,
  pinned: boolean,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Write something first." };

  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_notes").insert({
    org_id: user.orgId,
    account_id: accountId,
    user_id: user.id,
    body: trimmed,
    is_pinned: pinned,
    is_ai: false,
  });

  if (error) return { ok: false, error: "Could not save the note." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.noteAdded,
    summary: "Note added",
  });

  revalidateAccount(accountId);
  return { ok: true };
}

/**
 * A note tied to a specific person rather than the company at large — writes
 * contact_id alongside account_id (account_id may be null for a contact with
 * no company) so both the company-profile Notes feed and the global Contacts
 * directory can attribute the note to exactly who it's about. Shared by
 * QuickNoteDialog for both callers.
 */
export async function addContactNote(
  contactId: string,
  accountId: string | null,
  body: string,
  pinned: boolean = false,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Write something first." };

  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_notes").insert({
    org_id: user.orgId,
    account_id: accountId,
    contact_id: contactId,
    user_id: user.id,
    body: trimmed,
    is_pinned: pinned,
    is_ai: false,
  });

  if (error) return { ok: false, error: "Could not save the note." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    contactId,
    kind: CRM_ACTIVITY.noteAdded,
    summary: "Note added",
  });

  revalidateAccount(accountId ?? undefined);
  return { ok: true };
}

/** Edit an existing note's body in place. Same no-role-gate reasoning as
 * deleteNote — a note is operational, not a shared org-wide record. */
export async function updateNote(
  noteId: string,
  accountId: string | null,
  body: string,
): Promise<ActionResult> {
  await requireCrmUser();
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Note can't be empty." };

  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_notes")
    .update({ body: trimmed })
    .eq("id", noteId);

  if (error) return { ok: false, error: "Could not update the note." };
  revalidateAccount(accountId ?? undefined);
  return { ok: true };
}

/** Pin (or unpin) a note — same no-role-gate reasoning as updateNote/
 * deleteNote. Pinned notes surface at the top of the Notes feed. */
export async function setNotePinned(
  noteId: string,
  accountId: string | null,
  pinned: boolean,
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_notes")
    .update({ is_pinned: pinned })
    .eq("id", noteId);

  if (error) return { ok: false, error: "Could not update the note." };
  revalidateAccount(accountId ?? undefined);
  return { ok: true };
}

/**
 * Soft-delete a note. Notes are operational (not a shared org-wide record
 * like a company/contact/deal), so this is allowed for any CRM user — no
 * role gate, matching task/call deletes.
 */
export async function deleteNote(
  noteId: string,
  accountId: string | null,
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", noteId);

  if (error) return { ok: false, error: "Could not delete the note." };
  revalidateAccount(accountId ?? undefined);
  return { ok: true };
}
