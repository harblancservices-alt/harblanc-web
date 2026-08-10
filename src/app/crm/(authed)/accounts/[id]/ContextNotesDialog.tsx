"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import { TextareaField, SubmitButton, FormError } from "../../_shell/form";
import { BTN_EDIT } from "../../_shell/ui";
import { updateContextNotes } from "./details-actions";

/** Owns its own "Edit" trigger — see CompanyProfileDialog.tsx's docstring for
 * why (rendered directly from a Server Component). */
export function ContextNotesDialog({
  accountId,
  defaultValue,
}: {
  accountId: string;
  defaultValue: string | null;
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
      const res = await updateContextNotes(accountId, formData);
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
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
      >
        Edit
      </button>
      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="Edit notes">
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <TextareaField
            label="Context notes"
            name="context_notes"
            rows={8}
            autoFocus
            placeholder="Anything else worth knowing about this account…"
            defaultValue={defaultValue}
          />
          <SubmitButton pending={pending}>Save changes</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
