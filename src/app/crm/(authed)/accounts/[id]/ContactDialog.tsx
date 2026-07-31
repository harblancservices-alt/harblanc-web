"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import {
  Field,
  TextareaField,
  CheckboxField,
  SubmitButton,
  FormError,
} from "../../_shell/form";
import { createContact, updateContact } from "../actions";
import { toDatetimeLocal } from "../../_shell/format";

export type ContactDefaults = {
  id?: string;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  extension?: string | null;
  best_time_to_call?: string | null;
  is_decision_maker?: boolean | null;
  linkedin_url?: string | null;
  notes?: string | null;
  next_followup_at?: string | null;
};

/**
 * Add / edit a contact for a company. Full field set (title, email, phone,
 * mobile, extension, best time to call, decision-maker flag, LinkedIn, notes,
 * next follow-up). Create and edit share the form; both log to the timeline via
 * their server actions.
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
          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-3">
              <Field label="Phone" name="phone" type="tel" inputMode="tel" defaultValue={d.phone} />
            </div>
            <div className="col-span-3">
              <Field label="Mobile" name="mobile" type="tel" inputMode="tel" defaultValue={d.mobile} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Extension" name="extension" defaultValue={d.extension} />
            <Field
              label="Best time to call"
              name="best_time_to_call"
              placeholder="e.g. Weekday AM"
              defaultValue={d.best_time_to_call}
            />
          </div>
          <Field
            label="LinkedIn URL"
            name="linkedin_url"
            placeholder="https://linkedin.com/in/…"
            inputMode="url"
            defaultValue={d.linkedin_url}
          />
          <Field
            label="Next follow-up (CST)"
            name="next_followup_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(d.next_followup_at)}
          />
          <TextareaField label="Notes" name="notes" defaultValue={d.notes} />
          <CheckboxField
            label="Decision-maker"
            name="is_decision_maker"
            defaultChecked={!!d.is_decision_maker}
            hint="Flag this contact as someone who can say yes."
          />

          <SubmitButton pending={pending}>
            {mode === "create" ? "Save contact" : "Save changes"}
          </SubmitButton>
        </form>
      </Modal>
    </>
  );
}
