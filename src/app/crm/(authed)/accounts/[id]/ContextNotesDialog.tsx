"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import { TextareaField, SubmitButton, FormError } from "../../_shell/form";
import { updateContextNotes } from "./details-actions";

export function ContextNotesDialog({
  accountId,
  defaultValue,
  trigger,
}: {
  accountId: string;
  defaultValue: string | null;
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
      {trigger(() => {
        setError(null);
        setOpen(true);
      })}
      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="Edit notes">
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
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
