"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser } from "@/lib/crm/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * CREATING A CRM USER, AND REPAIRING ONE THAT WAS HALF-CREATED.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────
 *
 * A working CRM user is TWO rows — `auth.users` and `crm_profiles`, matched
 * by id, with `crm_profiles.id` a foreign key to the first. Nothing in the
 * app created either, so the auth half was made by hand in the Supabase
 * dashboard and the profile half only existed if somebody wrote SQL.
 *
 * On 2026-08-30 that failed TWICE inside twenty minutes provisioning one
 * hire: the login worked, `requireCrmUser()` found no profile, and she was
 * bounced to /crm/login?error=no_access with "This account doesn't have
 * Hello Hotshot CRM access."
 *
 * So there are two actions here, and the ORDER matters. `repairLogin` came
 * first because it fixes the failure that actually happens — somebody makes
 * the auth user by hand out of habit. `inviteMember` is the path that stops
 * it happening again.
 *
 * ── EVERY WRITE IS SERVICE-ROLE, LIKE ./actions.ts ────────────────────
 *
 * `crm_profiles` has a BEFORE INSERT/UPDATE trigger (crm_profiles_guard_role)
 * that rejects any role write from the `authenticated`/`anon` Postgres roles
 * — including a legitimate owner's server action on the cookie-bound client.
 * Only `service_role` gets through, so every write here uses
 * createServiceRoleClient(), and the OWNER CHECK is done in code first.
 *
 * ── NO PASSWORDS, EVER ────────────────────────────────────────────────
 *
 * Nothing in this file sets, generates, reads or transmits a password. A new
 * user is created WITHOUT one and Brent either sets it himself in Supabase
 * (which is what he actually did, twice, on the 30th) or sends the invite so
 * she sets her own. Both are his choice; neither is taken for him.
 */

type Ok = { ok: true };
type Err = { ok: false; error: string };
export type MemberActionResult = Ok | Err;

/** The two roles this org uses. `owner` clears requireCrmAdmin(); `member`
 * does not. Nothing infers a role — every path here is told one. */
export type NewMemberRole = "member" | "owner";

function isRole(v: unknown): v is NewMemberRole {
  return v === "member" || v === "owner";
}

/** Owner-only, and the caller's org is the only org anything can touch. */
async function requireOwner(): Promise<
  { ok: true; userId: string; orgId: string } | Err
> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only an admin can manage team accounts." };
  }
  return { ok: true, userId: user.id, orgId: user.orgId };
}

/**
 * THE COLUMN SHAPE OF AN EXISTING MEMBER, not the column defaults.
 *
 * `crm_profiles.can_view_all_companies` DEFAULTS TO TRUE while all four real
 * profiles are FALSE. A profile created on defaults silently sees every
 * company in the org — a quiet over-permissioning of a brand-new hire, on a
 * column nobody would think to check. Both actions below build their row
 * from a live member instead, so "same as our other agent" means it.
 *
 * Falls back to the safe end of each flag if the org somehow has no other
 * member, rather than to the DDL default.
 */
async function memberRowShape(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
): Promise<{ can_view_all_companies: boolean; show_unassigned: boolean; title: string | null }> {
  const { data } = await supabase
    .from("crm_profiles")
    .select("can_view_all_companies, show_unassigned, title")
    .eq("org_id", orgId)
    .eq("role", "member")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const row = data as
    | { can_view_all_companies: boolean; show_unassigned: boolean | null; title: string | null }
    | null;

  return {
    can_view_all_companies: row?.can_view_all_companies ?? false,
    show_unassigned: row?.show_unassigned ?? false,
    title: row?.title ?? null,
  };
}

/* ═══════════════ 1. REPAIR A HALF-CREATED LOGIN ══════════════════════ */

/**
 * Give an existing auth login the CRM profile it is missing.
 *
 * The role is a REQUIRED argument, never inferred from anything about the
 * login. Guessing it is how a new hire silently becomes an owner.
 */
export async function repairLogin(input: {
  userId: string;
  fullName: string;
  role: NewMemberRole;
}): Promise<MemberActionResult> {
  const gate = await requireOwner();
  if (!gate.ok) return gate;

  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: "Give them a name." };
  if (!isRole(input.role)) return { ok: false, error: "Pick a role." };

  const supabase = createServiceRoleClient();

  // Re-read the login server-side rather than trusting the id from the
  // client, and confirm it really has no profile — two admins on this page
  // at once must not both create one.
  const { data: orphans, error: readErr } = await supabase.rpc("crm_orphan_logins");
  if (readErr) return { ok: false, error: "Could not read logins. Try again." };

  const orphan = ((orphans ?? []) as { user_id: string; email: string | null }[]).find(
    (o) => o.user_id === input.userId,
  );
  if (!orphan) {
    return {
      ok: false,
      error: "That login already has a CRM profile, or is marked as not a CRM member.",
    };
  }

  const shape = await memberRowShape(supabase, gate.orgId);

  const { error } = await supabase.from("crm_profiles").insert({
    id: orphan.user_id,
    org_id: gate.orgId,
    full_name: fullName,
    email: orphan.email,
    role: input.role,
    is_active: true,
    is_primary_owner: false,
    ...shape,
  });

  if (error) return { ok: false, error: "Could not create the profile. Nothing was changed." };

  revalidatePath("/crm/admin/accounts");
  return { ok: true };
}

/**
 * Mark a login as intentionally NOT a CRM member, so it stops appearing on
 * the repair list.
 *
 * dispatch@harblancservices.com is the case this exists for: it is the TMS
 * login, correctly has no profile, and would otherwise sit on a warning list
 * forever — which is exactly how a warning surface trains people to ignore
 * it. A reason is required so the next person knows why it is there.
 */
export async function ignoreLogin(input: {
  userId: string;
  reason: string;
}): Promise<MemberActionResult> {
  const gate = await requireOwner();
  if (!gate.ok) return gate;

  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Say why this login is not a CRM member." };

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("crm_ignored_logins")
    .upsert({ user_id: input.userId, reason, ignored_by: gate.userId }, { onConflict: "user_id" });

  if (error) return { ok: false, error: "Could not save that. Try again." };

  revalidatePath("/crm/admin/accounts");
  return { ok: true };
}

/* ═══════════════ 2. CREATE A USER, BOTH HALVES ═══════════════════════ */

/**
 * Create the auth login AND the CRM profile together.
 *
 * ── THE FAILURE PATH IS THE WHOLE POINT ───────────────────────────────
 *
 * If the auth user is created and the profile insert then fails, this
 * function would have rebuilt the exact bug it exists to prevent — a login
 * that signs in and is bounced for having no profile. So the auth user is
 * DELETED again on any profile failure, and the caller is told the account
 * was not created rather than being left to discover it at her first login.
 *
 * If even the rollback fails, the error says so explicitly and names the
 * repair list, because a silent half-created user is the one outcome that
 * must never happen quietly.
 *
 * ── NO PASSWORD, NO EMAIL, BY DEFAULT ─────────────────────────────────
 *
 * Brent set passwords by hand twice on the 30th rather than using an invite.
 * Forcing an invite email here would just be bypassed, so this creates the
 * pair with NO password and NO email, and `sendInvite` below is a separate,
 * clearly-labelled action he can choose. The account exists either way; how
 * she gets in is his call.
 */
export async function inviteMember(input: {
  email: string;
  fullName: string;
  role: NewMemberRole;
}): Promise<MemberActionResult & { userId?: string }> {
  const gate = await requireOwner();
  if (!gate.ok) return gate;

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  if (!fullName) return { ok: false, error: "Give them a name." };
  if (!isRole(input.role)) return { ok: false, error: "Pick a role." };

  const supabase = createServiceRoleClient();

  // ── Duplicate guard, BOTH halves ────────────────────────────────────
  // Checked separately because the two can disagree — that disagreement is
  // precisely the state this feature was built to clean up.
  const { data: existingProfile } = await supabase
    .from("crm_profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile) {
    return { ok: false, error: "Somebody with that email is already a CRM member." };
  }

  const { data: listed } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const clash = (listed?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
  if (clash) {
    return {
      ok: false,
      error:
        "A login with that email already exists but has no CRM profile. Fix it from the “Logins without CRM access” list instead of creating a second one.",
    };
  }

  // ── Create the login. No password: see the note above. ──────────────
  const { data: created, error: authErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (authErr || !created?.user) {
    return { ok: false, error: "Could not create the login. Nothing was changed." };
  }

  const shape = await memberRowShape(supabase, gate.orgId);

  const { error: profileErr } = await supabase.from("crm_profiles").insert({
    id: created.user.id,
    org_id: gate.orgId,
    full_name: fullName,
    email,
    role: input.role,
    is_active: true,
    is_primary_owner: false,
    ...shape,
  });

  if (profileErr) {
    // ROLL BACK, or say loudly that we could not.
    const { error: rollbackErr } = await supabase.auth.admin.deleteUser(created.user.id);
    if (rollbackErr) {
      return {
        ok: false,
        error:
          "The login was created but its CRM profile failed, and the login could not be removed. Fix it from the “Logins without CRM access” list below — do not create a second account.",
      };
    }
    return { ok: false, error: "Could not create the CRM profile. The account was not created." };
  }

  revalidatePath("/crm/admin/accounts");
  return { ok: true, userId: created.user.id };
}

/**
 * Email an existing member an invite link so they set their OWN password.
 *
 * Separate from creating them, deliberately — see inviteMember's note. Safe
 * to run more than once; Supabase re-sends rather than duplicating the user.
 */
export async function sendInvite(email: string): Promise<MemberActionResult> {
  const gate = await requireOwner();
  if (!gate.ok) return gate;

  const supabase = createServiceRoleClient();
  const { error } = await supabase.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.harblancservices.com"}/update-password`,
  });

  if (error) {
    return {
      ok: false,
      error:
        "Could not send the invite. Check the project's email settings in Supabase, or set their password there instead.",
    };
  }
  return { ok: true };
}
