"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_shell/Modal";
import {
  Field,
  TextareaField,
  CheckboxField,
  SubmitButton,
  FormError,
} from "../_shell/form";
import { IconPlus } from "../_shell/icons";
import { PhonesEditor } from "../_shell/PhonesEditor";
import { LinksEditor } from "../_shell/LinksEditor";
import { CompanyCombobox, type CompanyOption, type CompanySelection } from "./CompanyCombobox";
import { createContactQuick } from "./actions";

/**
 * Quick-add a contact from the global Contacts directory — the entry point
 * that was previously missing entirely (contacts could only be added from
 * inside a company profile). The company picker (CompanyCombobox) both
 * autocompletes existing companies and, when the typed name matches nothing,
 * creates a brand-new bare company on save — see contacts/actions.ts for
 * exactly what that does (needs_finalize=true, source='manual').
 */
export function AddContactDialog({
  companies,
  trigger,
}: {
  companies: CompanyOption[];
  /** Optional custom opener — defaults to the built-in "Add contact" button
   * (Contacts page usage). The dashboard's "New leads" quick-action card
   * passes its own StatButton trigger instead, reusing this dialog wholesale
   * rather than duplicating the contact form. */
  trigger?: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [company, setCompany] = useState<CompanySelection>({ text: "", selectedId: null });
  const router = useRouter();

  function openDialog() {
    setError(null);
    setCompany({ text: "", selectedId: null });
    setOpen(true);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const trimmed = company.text.trim();
    formData.set("company_mode", company.selectedId ? "existing" : trimmed ? "new" : "none");
    formData.set("company_id", company.selectedId ?? "");
    formData.set("company_name", trimmed);

    setError(null);
    startTransition(async () => {
      const res = await createContactQuick(formData);
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
      {trigger ? (
        trigger(openDialog)
      ) : (
        <button
          type="button"
          onClick={openDialog}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          <IconPlus width={16} height={16} />
          Add contact
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="New contact">
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" name="name" required autoFocus />
            <Field label="Title" name="title" />
          </div>

          <CompanyCombobox companies={companies} selection={company} onChange={setCompany} />

          <Field label="Email" name="email" type="email" inputMode="email" />

          <PhonesEditor />
          <LinksEditor />

          <Field
            label="Best time to call"
            name="best_time_to_call"
            placeholder="e.g. Weekday AM"
          />
          <Field label="Next follow-up (CST)" name="next_followup_at" type="datetime-local" />
          <TextareaField label="Notes" name="notes" />
          <CheckboxField
            label="Decision-maker"
            name="is_decision_maker"
            hint="Flag this contact as someone who can say yes."
          />

          <SubmitButton pending={pending}>Save contact</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
