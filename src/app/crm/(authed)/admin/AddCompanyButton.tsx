"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_shell/Modal";
import { Field, SubmitButton, FormError } from "../_shell/form";
import { BTN_PRIMARY } from "../_shell/ui";
import { addCompanyToPool } from "./add-company-actions";

/**
 * "Add company" on Admin → Overview — a company Brent names over the phone,
 * no document involved.
 *
 * This was AddOtrEntryButton on the OTR page. Same small field set, same
 * dialog; what it writes is now a real unassigned company that appears in the
 * pool behind it rather than an entry in a queue awaiting release. The field
 * set stays deliberately smaller than the Companies "Add company" dialog (no
 * phones, links or tags) because this is the fast path — somebody is on the
 * phone, and the details come out of research later.
 */
export function AddCompanyButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await addCompanyToPool(formData);
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
        Add company
      </button>

      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="Add a company to the pool">
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

          <p className="text-[11.5px] text-fg-subtle">
            Lands in the pool with no owner. Whoever you assign it to gets the research task.
          </p>

          <SubmitButton pending={pending}>Add company</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
