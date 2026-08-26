"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckboxField, FormError, SubmitButton } from "../../../_shell/form";
import { BTN_DANGER, BTN_SUCCESS } from "../../../_shell/ui";
import { updateMemberAccount, reactivateMember } from "../../actions";
import type { AdminTeamMember } from "../../types";
import { SuspendReassignDialog } from "./SuspendReassignDialog";

/**
 * The Accounts detail page's editable right side — ACCESS LEVEL segmented
 * control (Sales Agent/Admin) + the two ACCOUNT CONTROLS visibility toggles
 * (Show all companies, Show unassigned) + footer (Suspend user / Save
 * changes).
 * Only ever rendered for an editable target (the page itself renders the
 * locked notice instead when `member.isPrimaryOwner` or the viewer is
 * looking at their own row) — this component doesn't re-check either
 * condition, but every field it submits is re-validated server-side in
 * ../../actions.ts regardless, so a stale/tampered client can never bypass
 * either rule.
 *
 * The caller MUST remount this on every server-confirmed change (the detail
 * page does via a `key` derived from member.role/isActive/canViewAllCompanies/
 * showUnassigned)
 * — accessLevel's useState and the CheckboxField's `defaultChecked` are only
 * ever read on mount.
 *
 * Status (Active/Suspended) is deliberately NOT part of this form (2026-08-19)
 * — it used to be a plain "Active account" checkbox submitted together with
 * role/visibility, which meant unchecking it and hitting "Save changes"
 * deactivated a member with zero company reassignment, a second, unsafe path
 * alongside the dedicated Suspend flow (CRM_MASTER_AUDIT.md §3/§6, P0 #1).
 * Status now has exactly one action per state in the footer below: "Suspend
 * & reassign…" (opens SuspendReassignDialog — the only way to deactivate)
 * when active, or "Reactivate" (reactivateMember(), no reassignment needed)
 * when suspended — matching DESIGN_DECISIONS.md §2's approved shape.
 */
export function MemberAccountForm({
  member,
  reassignTargets,
}: {
  member: AdminTeamMember;
  /** Every other active member in the org — passed through unchanged to
   * SuspendReassignDialog's dropdown. */
  reassignTargets: AdminTeamMember[];
}) {
  const [accessLevel, setAccessLevel] = useState<"member" | "owner">(
    member.role === "owner" ? "owner" : "member",
  );
  const [error, setError] = useState<string | null>(null);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("access_level", accessLevel);
    setError(null);
    startTransition(async () => {
      const res = await updateMemberAccount(member.id, formData);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <FormError message={error} />

      <div>
        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
          Access level
        </p>
        <div className="inline-flex rounded-lg border border-line-strong bg-inset p-1">
          <button
            type="button"
            onClick={() => setAccessLevel("member")}
            aria-pressed={accessLevel === "member"}
            className={`rounded-md px-4 py-2 text-[13px] font-semibold transition-colors ${
              accessLevel === "member" ? "bg-card text-accent shadow-e1 ring-1 ring-line-strong" : "text-fg-muted hover:text-fg"
            }`}
          >
            Sales Agent
          </button>
          <button
            type="button"
            onClick={() => setAccessLevel("owner")}
            aria-pressed={accessLevel === "owner"}
            className={`rounded-md px-4 py-2 text-[13px] font-semibold transition-colors ${
              accessLevel === "owner" ? "bg-card text-admin shadow-e1 ring-1 ring-line-strong" : "text-fg-muted hover:text-fg"
            }`}
          >
            Admin
          </button>
        </div>
        {accessLevel === "owner" && member.role !== "owner" && (
          <p className="mt-1.5 text-[12px] text-fg-subtle">
            Admin gives {member.fullName || "this user"} control over every non-primary-owner account
            except their own.
          </p>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
          Account controls
        </p>
        {/* TWO INDEPENDENT VISIBILITY GRANTS (Brent, 2026-08-25), both
            governing the agent-facing Companies list only — never Admin →
            Companies, which is gated on role. Kept as separate checkboxes
            rather than one three-state control because an admin routinely
            wants the second without the first. */}
        <div className="flex flex-col gap-2">
          <CheckboxField
            label="Show all companies"
            name="can_view_all_companies"
            defaultChecked={member.canViewAllCompanies}
          />
          <CheckboxField
            label="Show unassigned"
            name="show_unassigned"
            defaultChecked={member.showUnassigned}
          />
          <p className="text-[12px] text-fg-subtle">
            Off on both, {member.fullName || "this user"} sees only the companies assigned to
            them. &ldquo;Show unassigned&rdquo; adds companies nobody owns yet.
            &ldquo;Show all companies&rdquo; makes both moot &mdash; they see the whole org.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-strong pt-4">
        {member.isActive ? (
          <button
            type="button"
            onClick={() => setSuspendOpen(true)}
            className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_DANGER}`}
          >
            Suspend & reassign…
          </button>
        ) : (
          <ReactivateButton memberId={member.id} onSuccess={() => router.refresh()} />
        )}
        <SubmitButton pending={pending}>Save changes</SubmitButton>
      </div>

      {suspendOpen && (
        <SuspendReassignDialog
          member={member}
          targets={reassignTargets}
          onClose={() => setSuspendOpen(false)}
          onSuccess={() => {
            setSuspendOpen(false);
            router.refresh();
          }}
        />
      )}
    </form>
  );
}

/** The suspended-state counterpart to "Suspend & reassign…" — a single
 * action, no dialog (reactivateMember() needs no reassignment input), same
 * pending-disabled pattern as every other CRM async button. */
function ReactivateButton({ memberId, onSuccess }: { memberId: string; onSuccess: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const res = await reactivateMember(memberId);
      if (res.ok) onSuccess();
      else setError(res.error);
    });
  }

  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_SUCCESS}`}
      >
        {pending ? "Reactivating…" : "Reactivate"}
      </button>
      {error && <span className="text-[12px] text-bad">{error}</span>}
    </span>
  );
}
