"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import { Field, SubmitButton, FormError } from "../../_shell/form";
import { BTN_EDIT } from "../../_shell/ui";
import { updateCompanyProfile } from "./details-actions";

export type CompanyProfileDefaults = {
  dba: string | null;
  linkedin_url: string | null;
  year_founded: number | null;
  ownership_type: string | null;
};

/**
 * Owns its own "Edit" trigger button rather than taking a trigger render-prop
 * — this dialog is rendered directly from CompanyProfileSection, a Server
 * Component, and a function prop can't cross that boundary (see a9a58ef,
 * the earlier prod crash this exact mistake caused on PeopleSection). The
 * server side only ever hands this component plain, serializable data.
 */
export function CompanyProfileDialog({
  accountId,
  defaults,
}: {
  accountId: string;
  defaults: CompanyProfileDefaults;
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
      const res = await updateCompanyProfile(accountId, formData);
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
      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="Edit company profile">
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <Field label="DBA" name="dba" defaultValue={defaults.dba} autoFocus />
          <Field
            label="LinkedIn"
            name="linkedin_url"
            type="url"
            inputMode="url"
            placeholder="linkedin.com/company/…"
            defaultValue={defaults.linkedin_url}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Year founded"
              name="year_founded"
              inputMode="numeric"
              defaultValue={defaults.year_founded ?? undefined}
            />
            <Field
              label="Ownership"
              name="ownership_type"
              placeholder="e.g. Private, family-owned"
              defaultValue={defaults.ownership_type}
            />
          </div>
          <SubmitButton pending={pending}>Save changes</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
