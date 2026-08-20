"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import { Field, SubmitButton, FormError } from "../../_shell/form";
import { BTN_PRIMARY } from "../../_shell/ui";
import { addOtrEntry } from "./actions";

/**
 * "Add entry" for OTR — a company Brent names to the assistant over the
 * phone, no document at all. Deliberately a smaller field set than the
 * Companies "Add company" dialog (no phones/links/tags) since an OTR entry
 * isn't a Company yet; releaseOtrEntry (actions.ts) is what turns this into
 * a real crm_accounts row later.
 */
export function AddOtrEntryButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await addOtrEntry(formData);
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
        className={`inline-flex h-9.5 shrink-0 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-bold transition-colors ${BTN_PRIMARY}`}
      >
        Add entry
      </button>

      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="Add OTR entry">
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <Field label="Company name" name="company_name" required autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <Field label="City" name="city" />
            <Field label="State" name="state" />
          </div>
          <Field label="Industry" name="industry" />
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Notes</span>
            <textarea
              name="notes"
              rows={3}
              placeholder="What did Brent say? What do we know so far?"
              className="w-full resize-none rounded-md border border-line-strong bg-inset p-2.5 text-[13px] text-fg outline-none focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/20"
            />
          </label>

          <SubmitButton pending={pending}>Add entry</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
