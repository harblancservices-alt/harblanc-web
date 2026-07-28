"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_shell/Modal";
import { Field, CheckboxField, SubmitButton, FormError } from "../_shell/form";
import { updateMember } from "./actions";

export type MemberDefaults = {
  id: string;
  full_name: string | null;
  title: string | null;
  is_active: boolean;
};

/**
 * Admin-only edit dialog for a team member — name, title, and active status.
 * Role is intentionally not a field here (never editable from this UI, for
 * anyone). When editing your OWN row, the active toggle is replaced with a
 * locked notice (still submits is_active=on) so you can't accidentally
 * deactivate yourself; the server action enforces the same rule regardless.
 */
export function MemberDialog({
  member,
  isSelf,
  trigger,
}: {
  member: MemberDefaults;
  isSelf: boolean;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await updateMember(member.id, formData);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      {trigger(() => {
        setError(null);
        setOpen(true);
      })}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={pending}
        title="Edit team member"
      >
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field
            label="Full name"
            name="full_name"
            required
            autoFocus
            defaultValue={member.full_name}
          />
          <Field
            label="Title"
            name="title"
            placeholder="e.g. Sales Agent"
            defaultValue={member.title}
          />

          {isSelf ? (
            <>
              <input type="hidden" name="is_active" value="on" />
              <p className="rounded-lg border border-line-strong bg-inset px-3 py-2.5 text-[12.5px] text-fg-subtle">
                You can&rsquo;t deactivate your own account here.
              </p>
            </>
          ) : (
            <CheckboxField
              label="Active"
              name="is_active"
              defaultChecked={member.is_active}
              hint="Inactive members keep their history but can't sign in or be assigned new work."
            />
          )}

          <SubmitButton pending={pending}>Save changes</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
