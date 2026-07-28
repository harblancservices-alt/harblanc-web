"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { normalizeStage, stageLabel, DEFAULT_LIFECYCLE } from "./lifecycle";
import { firstName } from "../_shell/format";

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
function optInt(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v.length) return null;
  const n = Number.parseInt(v.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
function optNum(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v.length) return null;
  const n = Number.parseFloat(v.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** The full company field set, shared by create and edit. */
function accountFieldsFromForm(fd: FormData) {
  return {
    name: str(fd, "name"),
    industry: optStr(fd, "industry"),
    website: optStr(fd, "website"),
    phone: optStr(fd, "phone"),
    address: optStr(fd, "address"),
    city: optStr(fd, "city"),
    state: optStr(fd, "state"),
    zip: optStr(fd, "zip"),
    dot_number: optStr(fd, "dot_number"),
    mc_number: optStr(fd, "mc_number"),
    company_size: optStr(fd, "company_size"),
    fleet_size: optInt(fd, "fleet_size"),
    annual_freight_spend: optNum(fd, "annual_freight_spend"),
    revenue_potential: optNum(fd, "revenue_potential"),
    current_carrier: optStr(fd, "current_carrier"),
    source: optStr(fd, "source"),
  };
}

function revalidateAccount(id?: string) {
  revalidatePath("/crm/accounts");
  revalidatePath("/crm/contacts");
  revalidatePath("/crm");
  if (id) revalidatePath(`/crm/accounts/${id}`);
}

// ── Companies ────────────────────────────────────────────────────────────────

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
 * Update every editable field on a company. If the lifecycle stage moves as
 * part of the edit, that change is logged too (the edit form is one of the two
 * ways a stage can change).
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

/** Assign / change the rep on a company. Empty string clears the assignment. */
export async function assignRep(
  id: string,
  repId: string,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const nextRep = repId.trim().length ? repId.trim() : null;

  const { error } = await supabase
    .from("crm_accounts")
    .update({ assigned_user_id: nextRep })
    .eq("id", id);

  if (error) {
    return { ok: false, error: "Could not reassign the company. Please try again." };
  }

  let repName: string | null = null;
  if (nextRep) {
    const { data: rep } = await supabase
      .from("crm_profiles")
      .select("full_name, email")
      .eq("id", nextRep)
      .maybeSingle();
    repName = firstName(rep?.full_name as string | null, rep?.email as string | null) || null;
  }

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId: id,
    kind: CRM_ACTIVITY.repChanged,
    summary: repName ? `Assigned to ${repName}` : "Rep assignment cleared",
    meta: { rep_id: nextRep },
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

function contactFieldsFromForm(fd: FormData) {
  return {
    name: str(fd, "name"),
    title: optStr(fd, "title"),
    email: optStr(fd, "email"),
    phone: optStr(fd, "phone"),
    mobile: optStr(fd, "mobile"),
    extension: optStr(fd, "extension"),
    best_time_to_call: optStr(fd, "best_time_to_call"),
    is_decision_maker: str(fd, "is_decision_maker") === "on",
    linkedin_url: optStr(fd, "linkedin_url"),
    notes: optStr(fd, "notes"),
    next_followup_at: optStr(fd, "next_followup_at"),
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
      next_followup_at: fields.next_followup_at || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not save the contact. Please try again." };
  }

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    contactId: data.id as string,
    kind: CRM_ACTIVITY.contactAdded,
    summary: `Contact added: ${fields.name}`,
  });

  revalidateAccount(accountId);
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
  const { error } = await supabase
    .from("crm_contacts")
    .update({ ...fields, next_followup_at: fields.next_followup_at || null })
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

  revalidateAccount(accountId);
  return { ok: true };
}

/**
 * Soft-delete a contact (set deleted_at). If it was the company's primary
 * contact, clear that pointer so the profile never references a hidden row.
 * The append-only activity feed is untouched.
 */
export async function deleteContact(
  contactId: string,
  accountId: string,
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

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

/** Pin or unpin a note. */
export async function setNotePinned(
  noteId: string,
  accountId: string,
  pinned: boolean,
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_notes")
    .update({ is_pinned: pinned })
    .eq("id", noteId);

  if (error) return { ok: false, error: "Could not update the note." };
  revalidateAccount(accountId);
  return { ok: true };
}
