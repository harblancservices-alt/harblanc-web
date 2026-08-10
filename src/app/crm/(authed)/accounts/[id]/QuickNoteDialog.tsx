"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import { TextareaField, SubmitButton, FormError } from "../../_shell/form";
import { addContactNote } from "../actions";

/**
 * A one-field note composer scoped to a single contact — writes a crm_notes
 * row with contact_id set (plus account_id, which may be null for a contact
 * with no company) rather than the account-level note Team Notes writes.
 * Shared by the company-profile Contacts card and the global Contacts
 * directory row actions, so both write identically-shaped notes.
 */
export function QuickNoteDialog({
  accountId,
  contactId,
  contactName,
  trigger,
}: {
  accountId: string | null;
  contactId: string;
  contactName: string;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const trimmed = String(formData.get("body") ?? "").trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = await addContactNote(contactId, accountId, trimmed);
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
        title={`Note on ${contactName}`}
      >
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <TextareaField
            label="Note"
            name="body"
            autoFocus
            placeholder={`What happened with ${contactName}?`}
          />
          <SubmitButton pending={pending}>Save note</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
