"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import { TextareaField, SubmitButton, FormError } from "../../_shell/form";
import { addNote } from "../actions";

/**
 * A one-field note composer scoped to a single contact — crm_notes has no
 * contact_id column (notes are account-level only), so this writes a normal
 * team note prefixed with "Re: <contact name> — " rather than a separate
 * per-contact record. Reuses the same addNote server action Team Notes uses,
 * so it shows up in the same feed with full context.
 */
export function QuickNoteDialog({
  accountId,
  contactName,
  trigger,
}: {
  accountId: string;
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
      const res = await addNote(accountId, `Re: ${contactName} — ${trimmed}`, false);
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
        title={`Note — ${contactName}`}
      >
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
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
