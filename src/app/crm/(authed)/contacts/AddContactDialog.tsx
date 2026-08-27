"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_shell/Modal";
import { Field, SelectField, TextareaField, SubmitButton, FormError } from "../_shell/form";
import { IconPlus } from "../_shell/icons";
import { BTN_ACTION, BTN_EDIT, BTN_NEUTRAL } from "../_shell/ui";
import { PhonesEditor } from "../_shell/PhonesEditor";
import { LinksEditor } from "../_shell/LinksEditor";
import { MoodPicker } from "../_shell/MoodPicker";
import { CompanyCombobox, type CompanyOption, type CompanySelection } from "./CompanyCombobox";
import { createContactQuick } from "./actions";
import { CONTACT_ROLE_PRESETS, ROLE_OTHER } from "../accounts/[id]/contactRoles";

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
  /** Which option the role dropdown shows. Same vocabulary the in-company
   * dialog uses — contactRoles.ts — so a person added here and a person
   * added from a company page get the same titles and the same pills. */
  const [role, setRole] = useState<string>("");
  const router = useRouter();

  function openDialog() {
    setError(null);
    setCompany(initialCompany ?? { text: "", selectedId: null });
    setRole("");
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
          <Field label="Name" name="name" required autoFocus />

          <CompanyCombobox companies={companies} selection={company} onChange={setCompany} />

          {/* THE SAME ROLE DROPDOWN THE IN-COMPANY DIALOG USES. This was a
              free-text "Title" box, which is how the live data ended up
              holding "Purchasing Manager", "Manager, Purchasing" and
              "purchasing" for one job. Two dialogs that both create a
              contact must not disagree about what a role is. */}
          <SelectField
            label="Role"
            name="role_preset"
            defaultValue=""
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">Select a role…</option>
            {CONTACT_ROLE_PRESETS.map((r) => (
              <option key={r.title} value={r.title}>
                {r.title}
              </option>
            ))}
            <option value={ROLE_OTHER}>Other…</option>
          </SelectField>

          {role === ROLE_OTHER ? (
            <Field label="Role (other)" name="title" placeholder="e.g. VP Operations" />
          ) : (
            <input type="hidden" name="title" value={role} />
          )}

          <PhonesEditor />

          <TextareaField
            label="Note — saves to the company's notes feed"
            name="company_note"
            rows={3}
            placeholder="What did you learn? Goes on the company, not this person."
          />

          {/* Everything this form used to open with. */}
          <details className="mt-1 rounded-md border border-line">
            <summary className="cursor-pointer select-none px-3 py-2 text-[12px] font-bold text-fg-muted hover:text-fg">
              More fields
            </summary>
            <div className="flex flex-col gap-2 border-t border-line p-3">
              <Field label="Email" name="email" type="email" inputMode="email" />
              <LinksEditor />
              <MoodPicker />
              <Field
                label="Best time to call"
                name="best_time_to_call"
                placeholder="e.g. Weekday AM"
              />
              <Field label="Next follow-up (CST)" name="next_followup_at" type="datetime-local" />
            </div>
          </details>

          <div className="mt-1 flex items-center gap-2">
            <SubmitButton pending={pending}>Save contact</SubmitButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className={`inline-flex h-9 items-center rounded-md px-4 text-[13px] font-semibold transition-colors max-lg:h-11 max-lg:text-[14px] ${BTN_NEUTRAL}`}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
