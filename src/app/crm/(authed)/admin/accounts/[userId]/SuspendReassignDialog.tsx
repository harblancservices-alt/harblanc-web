"use client";

import { useState, useTransition } from "react";
import { Modal } from "../../../_shell/Modal";
import { SelectField, FormError } from "../../../_shell/form";
import { BTN_DANGER } from "../../../_shell/ui";
import { firstName } from "../../../_shell/format";
import { suspendAndReassignMember } from "../../actions";
import type { AdminTeamMember } from "../../types";

/**
 * Suspend confirmation — reassigns the member's entire book of business to
 * another active user, THEN suspends. Brent's explicit spec: suspending a
 * member must never leave their companies unowned, so this dialog is the
 * only path to suspension (there is no "suspend without reassigning"
 * button) — see ../../actions.ts::suspendAndReassignMember for the
 * server-side ordering/guards.
 */
export function SuspendReassignDialog({
  member,
  targets,
  onClose,
  onSuccess,
}: {
  member: AdminTeamMember;
  /** Every other ACTIVE member in the org — may include the primary owner
   * or the viewer themselves; already excludes `member` (see the detail
   * page's reassignTargets computation). */
  targets: AdminTeamMember[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reassignTo, setReassignTo] = useState(targets[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const memberLabel = firstName(member.fullName, member.email) || "This user";

  function onConfirm() {
    if (!reassignTo) {
      setError("Choose who should take over this user's companies.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await suspendAndReassignMember(member.id, reassignTo);
      if (res.ok) onSuccess();
      else setError(res.error);
    });
  }

  return (
    <Modal open onClose={onClose} title="Suspend user" busy={pending}>
      <FormError message={error} />

      {targets.length === 0 ? (
        <p className="rounded-[5px] border border-line-strong bg-inset px-3 py-3 text-[13px] text-fg-subtle">
          There&rsquo;s no other active user in the org to reassign {memberLabel}&rsquo;s companies to. Activate
          another account first, or suspending {memberLabel} would leave their companies unowned.
        </p>
      ) : (
        <>
          <p className="mb-3 text-[13.5px] text-fg">
            Reassign <span className="font-semibold">{memberLabel}</span>&rsquo;s companies to:
          </p>
          <SelectField label="Reassign to" name="reassign_to" defaultValue={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {firstName(t.fullName, t.email) || "Unnamed"}
                {t.isPrimaryOwner ? " (Primary owner)" : t.role === "owner" ? " (Admin)" : ""}
              </option>
            ))}
          </SelectField>
          <p className="mt-3 text-[12px] text-fg-subtle">
            Every company currently assigned to {memberLabel} will be reassigned, then their account will be
            suspended — they won&rsquo;t be able to sign in.
          </p>
        </>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-md border border-fg-subtle bg-card px-3.5 py-2 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-inset disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending || targets.length === 0}
          className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_DANGER}`}
        >
          {pending ? "Suspending…" : "Reassign & suspend"}
        </button>
      </div>
    </Modal>
  );
}
