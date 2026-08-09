"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import { Field, TextareaField, SubmitButton, FormError } from "../../_shell/form";
import { PhonesEditor } from "../../_shell/PhonesEditor";
import { LinksEditor } from "../../_shell/LinksEditor";
import type { PhoneEntry, LinkEntry } from "../../_shell/contactFields";
import { createContact, updateContact } from "../actions";
import { toDatetimeLocal } from "../../_shell/format";

export type ContactDefaults = {
  id?: string;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phones?: PhoneEntry[];
  links?: LinkEntry[];
  best_time_to_call?: string | null;
  notes?: string | null;
  next_followup_at?: string | null;
  /** A CrmPersonRoleCategory slug (see PeopleSection.tsx), or null/unset —
   * drives the color-coded role pill everywhere a contact renders. */
  role_category?: string | null;
};

/**
 * Add / edit a contact for a company. Full field set (title, email, labeled
 * phones, labeled links, best time to call, notes, next follow-up
 * date+time) — deliberately NOT role: role-setting lives exclusively in the
 * inline RoleControl pills on every surface a contact renders (its own
 * profile page, the Contacts tab rows, the Overview People cards), saving
 * instantly via setContactRole rather than through this dialog. Create and
 * edit share the form; both log to the timeline via their server actions.
 */
export function ContactDialog({
  accountId,
  mode,
  defaults,
  trigger,
}: {
  accountId: string;
  mode: "create" | "edit";
  defaults?: ContactDefaults;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const d = defaults ?? {};

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createContact(accountId, formData)
          : await updateContact(d.id as string, accountId, formData);
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
        title={mode === "create" ? "New contact" : "Edit contact"}
      >
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" name="name" required autoFocus defaultValue={d.name} />
            <Field label="Title" name="title" defaultValue={d.title} />
          </div>
          <Field
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            defaultValue={d.email}
          />

          <PhonesEditor defaultValue={d.phones} />
          <LinksEditor defaultValue={d.links} />

          <Field
            label="Best time to call"
            name="best_time_to_call"
            placeholder="e.g. Weekday AM"
            defaultValue={d.best_time_to_call}
          />
          <Field
            label="Next follow-up (CST)"
            name="next_followup_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(d.next_followup_at)}
          />
          <TextareaField label="Notes" name="notes" defaultValue={d.notes} />

          <SubmitButton pending={pending}>
            {mode === "create" ? "Save contact" : "Save changes"}
          </SubmitButton>
        </form>
      </Modal>
    </>
  );
}
