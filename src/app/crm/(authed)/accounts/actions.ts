"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { normalizeStage, stageLabel, stageRank, DEFAULT_LIFECYCLE } from "./lifecycle";
import { centralInputToIso, firstName, titleCaseWords, upperCaseState } from "../_shell/format";
import { phonesFromFormValue, linksFromFormValue, parsePhones, looksLikePhone } from "../_shell/contactFields";
import { MOOD_VALUES } from "../_shell/mood";
import { syncFollowupTask } from "@/lib/crm/followupTask";
import { fireStageEntryTask } from "@/lib/crm/stageAutomation";

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
 *
 * `options.unassigned` (default false) is the ONE override to the "defaults
 * to the creator" rule below — used only by BOL Center's new-company paths
 * (resolveAndProspectCompany/createAndProspectCompany/prospectCarrier),
 * which need a freshly-created prospect to land UNCLAIMED in the agent
 * queue (/crm/ai-agent), not pre-owned by whichever admin happened to
 * process the BOL. An explicit empty assigned_user_id in the form data does
 * NOT achieve this — optStr treats "" as null and the `?? user.id` fallback
 * still applies — so this needs its own real signal. Every other caller
 * (the manual Add-Company dialog included) omits `options` entirely and
 * keeps the unchanged default: assign to the creator.
 */
export async function createAccount(
  formData: FormData,
  options?: { unassigned?: boolean },
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
  // Optional rep from the form; defaults to the creator UNLESS the caller
  // explicitly opted into an unassigned company (see options.unassigned above).
  const assigned = options?.unassigned ? null : (optStr(formData, "assigned_user_id") ?? user.id);

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

  // Read the prior stage AND the prior owner: the stage so we can detect a
  // move and log it, the owner so the assignment gate below can tell a claim
  // (unowned → self, allowed for anyone) from a reassign (admin-only).
  const { data: prior } = await supabase
    .from("crm_accounts")
    .select("lifecycle_status, assigned_user_id")
    .eq("id", id)
    .maybeSingle();

  const nextStage = normalizeStage(
    str(formData, "lifecycle_status") || (prior?.lifecycle_status as string),
  );
  const assigned = optStr(formData, "assigned_user_id");

  /**
   * ASSIGNMENT GATE — this form (CompanyDialog's "Assigned rep" select) used
   * to be an unguarded second door onto crm_accounts.assigned_user_id, which
   * let any member silently take or hand off ANY company in the org,
   * including one owned by another rep. Ownership now follows exactly one
   * rule wherever it's written, and this enforces the same one assignAccount()
   * below does: a non-admin's ONLY legal transition is unowned → themselves.
   * Anything else — reassigning an owned company, or seating someone other
   * than yourself — is admin-only. The select is also hidden from non-owners
   * in the UI (CompanyDialog's `canAssign` prop), but that's cosmetic; this
   * is the check that actually holds, and the companion trigger migration
   * 20260822000000_crm_accounts_guard_assignment.sql backs it at the DB.
   *
   * Re-submitting the value the row ALREADY has is never blocked, so a member
   * editing any other field on a company they own keeps working unchanged.
   */
  const priorAssigned = (prior?.assigned_user_id as string | null) ?? null;
  if (
    assigned !== null &&
    assigned !== priorAssigned &&
    user.role !== "owner" &&
    !(priorAssigned === null && assigned === user.id)
  ) {
    return {
      ok: false,
      error: "Only an admin can change who a company is assigned to.",
    };
  }

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

/**
 * Claim / assign / reassign / unassign a company — the ONE control-driven
 * write of crm_accounts.assigned_user_id, and the single place the ownership
 * rule lives (ASSIGNMENT_AUDIT.md):
 *
 *  - UNCLAIMED (assigned_user_id IS NULL): ANY CRM user may claim it. A
 *    non-admin may only target THEMSELVES; an admin may seat any active rep.
 *  - ALREADY CLAIMED: admin (role='owner') ONLY — to move it to another rep,
 *    or to unassign it (targetUserId = null). A member is rejected even for
 *    the company they own themselves: handing an account off (or dropping it
 *    back into the pool) is an admin call, not self-service.
 *
 * RLS does NOT back this up. crm_accounts_rw (crm_foundation.sql:499) scopes
 * ROWS by org and never COLUMNS by role — the same shape as the crm_profiles
 * hole that 20260818000000_crm_profiles_role_lockdown.sql had to close with a
 * trigger, and reachable the same way (the publishable-key client the app
 * already uses directly elsewhere). The companion migration
 * 20260822000000_crm_accounts_guard_assignment.sql applies that same trigger
 * pattern to this column; until it's applied, the checks below are the only
 * enforcement there is.
 *
 * Race-safe exactly like claimAiLead (ai-agent/actions.ts:36-45): the UPDATE
 * re-asserts the ownership state this call decided against — `IS NULL` for a
 * claim, `= currentOwner` for a reassign — so two people acting at once can
 * only ever seat one of them, and the loser gets a clear message instead of
 * silently clobbering the winner.
 *
 * Claiming an unclaimed NEW LEAD also advances it to Researching and fires
 * that stage's entry task assigned to the NEW OWNER, so claiming from a
 * company profile behaves identically to claiming the same company from the
 * Prospects queue. Deliberately claim-only and new_lead-only: an admin
 * reassigning a company that's already at Quoting never rewinds its stage,
 * matching the no-downgrade guardrail promoteAccountToProspect uses.
 */
export async function assignAccount(
  accountId: string,
  targetUserId: string | null,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: account } = await supabase
    .from("crm_accounts")
    .select("assigned_user_id, lifecycle_status, name")
    .eq("id", accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!account) return { ok: false, error: "Company not found." };

  const currentOwner = (account.assigned_user_id as string | null) ?? null;
  const isAdmin = user.role === "owner";

  // ── The rule, in one place ────────────────────────────────────────────
  if (currentOwner === null) {
    if (targetUserId === null) return { ok: true }; // already unassigned
    if (!isAdmin && targetUserId !== user.id) {
      return { ok: false, error: "Only an admin can assign a company to someone else." };
    }
  } else if (!isAdmin) {
    return { ok: false, error: "Only an admin can reassign or unassign a company." };
  }
  if (targetUserId === currentOwner) return { ok: true };

  // Never trust the submitted id beyond its shape — the target must be a
  // real, ACTIVE member. crm_profiles RLS is org-matched, so an id from
  // another org simply reads back nothing and is refused like an unknown one
  // (same "re-verify the target independently" reasoning as
  // admin/actions.ts::suspendAndReassignMember). Both the old and the new
  // owner are resolved in this one round-trip, since the timeline entry
  // wants to name them.
  const lookupIds = Array.from(
    new Set([currentOwner, targetUserId].filter((v): v is string => Boolean(v))),
  );
  const { data: profileRows } = await supabase
    .from("crm_profiles")
    .select("id, full_name, email, is_active")
    .in("id", lookupIds);

  const profileById = new Map(
    ((profileRows ?? []) as { id: string; full_name: string | null; email: string | null; is_active: boolean }[]).map(
      (p) => [p.id, p],
    ),
  );

  if (targetUserId !== null) {
    const target = profileById.get(targetUserId);
    if (!target || !target.is_active) {
      return { ok: false, error: "Choose an active user to assign this company to." };
    }
  }

  function labelFor(userId: string | null): string | null {
    if (!userId) return null;
    const p = profileById.get(userId);
    return (p ? firstName(p.full_name, p.email) : "") || "a teammate";
  }

  // The guard predicate IS the concurrency control — see the docstring.
  const write = supabase
    .from("crm_accounts")
    .update({ assigned_user_id: targetUserId })
    .eq("id", accountId)
    .is("deleted_at", null);
  const guarded =
    currentOwner === null
      ? write.is("assigned_user_id", null)
      : write.eq("assigned_user_id", currentOwner);

  const { data: updated, error } = await guarded.select("id").maybeSingle();

  if (error) {
    return { ok: false, error: "Could not change who this company is assigned to. Please try again." };
  }
  if (!updated) {
    return {
      ok: false,
      error:
        currentOwner === null
          ? `${account.name as string} was just claimed by someone else.`
          : `${account.name as string} just changed hands. Reload and try again.`,
    };
  }

  const priorLabel = labelFor(currentOwner);
  const targetLabel = labelFor(targetUserId);
  const summary =
    targetUserId === null
      ? `Unassigned${priorLabel ? ` (was ${priorLabel})` : ""}`
      : currentOwner === null
        ? targetUserId === user.id
          ? "Claimed this company"
          : `Assigned to ${targetLabel}`
        : `Reassigned: ${priorLabel} → ${targetLabel}`;

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.repChanged,
    summary,
    meta: { from: currentOwner, to: targetUserId },
  });

  // Claim-only stage advance — mirrors claimAiLead (ai-agent/actions.ts:62-87)
  // so the two claim surfaces can't drift. Never runs on a reassign.
  const priorStage = normalizeStage(account.lifecycle_status as string | null);
  if (currentOwner === null && targetUserId !== null && priorStage === "new_lead") {
    const { error: stageError } = await supabase
      .from("crm_accounts")
      .update({ lifecycle_status: "researching" })
      .eq("id", accountId);

    if (!stageError) {
      await logActivity(supabase, {
        orgId: user.orgId,
        userId: user.id,
        accountId,
        kind: CRM_ACTIVITY.lifecycleChanged,
        summary: `Stage changed: ${stageLabel(priorStage)} → ${stageLabel("researching")}`,
        meta: { from: priorStage, to: "researching" },
      });

      await fireStageEntryTask(supabase, {
        orgId: user.orgId,
        actorUserId: user.id,
        accountId,
        ownerUserId: targetUserId,
        stage: "researching",
      });
    }
  }

  revalidateAccount(accountId);
  // The Prospects tab and its nav badge are both keyed on
  // assigned_user_id IS NULL (ai-agent/page.tsx:37, layout.tsx:45), so a
  // claim made from a profile has to drop the lead out of both.
  revalidatePath("/crm/ai-agent");
  return { ok: true };
}

/**
 * Move a company to a new lifecycle stage, log the transition, and fire that
 * stage's entry automation (CRM_URGENCY_AUDIT.md P0 — an auto-task for
 * researching/contacted/quoting, assigned to whoever currently owns the
 * account; see lib/crm/stageAutomation.ts). No cron in this CRM, so this
 * synchronous call IS the automation — there's nowhere else it fires from
 * besides here and claimAiLead's own claim→researching advance.
 */
export async function updateLifecycleStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const next = normalizeStage(status);
  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_accounts")
    .select("lifecycle_status, assigned_user_id")
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

  await fireStageEntryTask(supabase, {
    orgId: user.orgId,
    actorUserId: user.id,
    accountId: id,
    ownerUserId: (prior?.assigned_user_id as string | null) ?? null,
    stage: next,
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
 *  - Lifecycle promotion, guardrail-checked: only (re-)sets the company to
 *    'new_lead' when its current stage genuinely ranks below Researching —
 *    in practice that means it's already at new_lead (a fresh company has
 *    nowhere lower to rank). One already at Researching or beyond (or the
 *    terminal Lost) is left exactly where it is — never downgraded back to
 *    New Lead just because a BOL/OTR/Discord company got re-published. This
 *    is the ONE place either caller should ever write lifecycle_status for
 *    this purpose.
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
  const willPromote = stageRank(currentStage) < stageRank("researching");

  const fields: { lifecycle_status?: string; source?: string; ai_status: string } = { ai_status: "released" };
  if (willPromote) fields.lifecycle_status = "new_lead";
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
