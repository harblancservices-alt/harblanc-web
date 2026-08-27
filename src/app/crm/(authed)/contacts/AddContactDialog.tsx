"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_shell/Modal";
import { Field, TextareaField, SubmitButton, FormError } from "../_shell/form";
import { IconPlus } from "../_shell/icons";
import { BTN_ACTION, BTN_EDIT } from "../_shell/ui";
import { PhonesEditor } from "../_shell/PhonesEditor";
import { LinksEditor } from "../_shell/LinksEditor";
import { MoodPicker } from "../_shell/MoodPicker";
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
  initialCompany,
  variant = "primary",
}: {
  companies: CompanyOption[];
  /** Optional custom opener — defaults to the built-in "Add contact" button
   * (Contacts page usage). The dashboard's "New leads" quick-action card
   * passes its own StatButton trigger instead, reusing this dialog wholesale
   * rather than duplicating the contact form. */
  trigger?: (open: () => void) => ReactNode;
  /** Pre-selects the company combobox when the dialog opens — the Companies
   * list's per-row "Add contact" action passes that row's own company so the
   * form opens already attached to it (still editable, same as any other
   * selection). Omitted everywhere else, which keeps the field blank. */
  initialCompany?: CompanySelection;
  /** "secondary" draws the blue-outline treatment, for pages where adding a
   * contact is the cross-link rather than the point (the Companies list).
   * A serializable prop rather than a custom `trigger`, because those pages
   * are Server Components and a function cannot cross that boundary. */
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [company, setCompany] = useState<CompanySelection>({ text: "", selectedId: null });
  const router = useRouter();

  function openDialog() {
    setError(null);
    setCompany(initialCompany ?? { text: "", selectedId: null });
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
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-bold shadow-e2 transition-all hover:-translate-y-0.5 hover:shadow-e3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${variant === "secondary" ? BTN_EDIT : BTN_ACTION}`}
        >
          <IconPlus width={16} height={16} />
          Add contact
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="New contact">
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Name" name="name" required autoFocus />
            <Field label="Title" name="title" />
          </div>

          <CompanyCombobox companies={companies} selection={company} onChange={setCompany} />

          <Field label="Email" name="email" type="email" inputMode="email" />

          <PhonesEditor />
          <LinksEditor />

          <MoodPicker />

          <Field
            label="Best time to call"
            name="best_time_to_call"
            placeholder="e.g. Weekday AM"
          />
          <Field label="Next follow-up (CST)" name="next_followup_at" type="datetime-local" />
          <TextareaField label="Notes" name="notes" />

          <SubmitButton pending={pending}>Save contact</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
