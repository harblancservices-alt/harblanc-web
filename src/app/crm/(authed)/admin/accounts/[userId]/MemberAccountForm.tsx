"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckboxField, FormError, SubmitButton } from "../../../_shell/form";
import { BTN_DANGER } from "../../../_shell/ui";
import { updateMemberAccount, suspendMember } from "../../actions";
import type { AdminTeamMember } from "../../types";

/**
 * The Accounts detail page's editable right side — ACCESS LEVEL segmented
 * control (Sales Agent/Admin) + the two ACCOUNT CONTROLS toggles (Active
 * account, Can view all companies) + footer (Suspend user / Save changes).
 * Only ever rendered for an editable target (the page itself renders the
 * locked notice instead when `member.isPrimaryOwner` or the viewer is
 * looking at their own row) — this component doesn't re-check either
 * condition, but every field it submits is re-validated server-side in
 * ../../actions.ts regardless, so a stale/tampered client can never bypass
 * either rule.
 *
 * The caller MUST remount this on every server-confirmed change (the detail
 * page does via a `key` derived from member.role/isActive/canViewAllCompanies)
 * — accessLevel's useState and the two CheckboxFields' `defaultChecked` are
 * only ever read on mount. Without that key, calling suspendMember() and then
 * router.refresh() would update the `member` prop but leave this form's own
 * DOM state (and the "Active account" checkbox in particular) showing the
 * PRE-suspend value, so a follow-up "Save changes" click would silently
 * re-activate the account it just suspended.
 */
export function MemberAccountForm({ member }: { member: AdminTeamMember }) {
  const [accessLevel, setAccessLevel] = useState<"member" | "owner">(
    member.role === "owner" ? "owner" : "member",
  );
  const [error, setError] = useState<string | null>(null);
  const [suspendError, setSuspendError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [suspending, startSuspendTransition] = useTransition();
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

  function onSuspend() {
    if (!window.confirm(`Suspend ${member.fullName || member.email || "this user"}? They won't be able to sign in.`)) {
      return;
    }
    setSuspendError(null);
    startSuspendTransition(async () => {
      const res = await suspendMember(member.id);
      if (res.ok) router.refresh();
      else setSuspendError(res.error);
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
              accessLevel === "owner" ? "bg-card text-[#9333ea] shadow-e1 ring-1 ring-line-strong" : "text-fg-muted hover:text-fg"
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
        <div className="flex flex-col gap-2">
          <CheckboxField label="Active account" name="is_active" defaultChecked={member.isActive} />
          <CheckboxField
            label="Can view all companies"
            name="can_view_all_companies"
            defaultChecked={member.canViewAllCompanies}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-strong pt-4">
        <div>
          <button
            type="button"
            onClick={onSuspend}
            disabled={suspending}
            className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_DANGER}`}
          >
            {suspending ? "Suspending…" : "Suspend user"}
          </button>
          {suspendError && <p className="mt-1.5 text-[12px] text-bad">{suspendError}</p>}
        </div>
        <SubmitButton pending={pending}>Save changes</SubmitButton>
      </div>
    </form>
  );
}
