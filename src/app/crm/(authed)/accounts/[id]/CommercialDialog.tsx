"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import { Field, SelectField, SubmitButton, FormError } from "../../_shell/form";
import { BTN_EDIT } from "../../_shell/ui";
import { updateCommercialDetails } from "./details-actions";

export type CommercialDefaults = {
  fit_rating: number | null;
  payment_terms: string | null;
  current_carrier: string | null;
};

/** Owns its own "Edit" trigger — see CompanyProfileDialog.tsx's docstring for
 * why (rendered directly from a Server Component). */
export function CommercialDialog({
  accountId,
  defaults,
}: {
  accountId: string;
  defaults: CommercialDefaults;
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
      const res = await updateCommercialDetails(accountId, formData);
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
      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="Edit commercial details">
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <SelectField label="Priority / fit rating" name="fit_rating" defaultValue={String(defaults.fit_rating ?? "")}>
            <option value="">Unrated</option>
            <option value="1">1 — Low fit</option>
            <option value="2">2</option>
            <option value="3">3 — Average fit</option>
            <option value="4">4</option>
            <option value="5">5 — Excellent fit</option>
          </SelectField>
          <Field
            label="Payment / credit terms"
            name="payment_terms"
            placeholder="e.g. Net 30, quick-pay 2%"
            defaultValue={defaults.payment_terms}
          />
          <Field
            label="Incumbent carrier / competitor"
            name="current_carrier"
            defaultValue={defaults.current_carrier}
          />
          <SubmitButton pending={pending}>Save changes</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
