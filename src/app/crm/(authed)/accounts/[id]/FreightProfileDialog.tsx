"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import { Field, SubmitButton, FormError } from "../../_shell/form";
import { MultiSelectChips } from "../../_shell/MultiSelectChips";
import { LanesEditor, type LaneEntry } from "../../_shell/LanesEditor";
import { BTN_EDIT } from "../../_shell/ui";
import { EQUIPMENT_OPTIONS, SPECIAL_REQUIREMENT_OPTIONS } from "./details-fields";
import { updateFreightProfile } from "./details-actions";

export type FreightProfileDefaults = {
  equipment_needed: string[];
  lanes: LaneEntry[];
  volume_frequency: string | null;
  weight_range: string | null;
  special_requirements: string[];
};

/** Owns its own "Edit" trigger — see CompanyProfileDialog.tsx's docstring for
 * why (rendered directly from a Server Component). */
export function FreightProfileDialog({
  accountId,
  defaults,
}: {
  accountId: string;
  defaults: FreightProfileDefaults;
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
      const res = await updateFreightProfile(accountId, formData);
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
      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="Edit freight profile">
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <MultiSelectChips
            name="equipment_needed"
            label="Equipment needed"
            options={EQUIPMENT_OPTIONS}
            defaultValue={defaults.equipment_needed}
          />
          <LanesEditor defaultValue={defaults.lanes} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field
              label="Volume & frequency"
              name="volume_frequency"
              placeholder="e.g. 8 loads/week"
              defaultValue={defaults.volume_frequency}
            />
            <Field
              label="Weight range"
              name="weight_range"
              placeholder="e.g. 20,000–45,000 lbs"
              defaultValue={defaults.weight_range}
            />
          </div>
          <MultiSelectChips
            name="special_requirements"
            label="Special requirements"
            options={SPECIAL_REQUIREMENT_OPTIONS}
            defaultValue={defaults.special_requirements}
          />
          <SubmitButton pending={pending}>Save changes</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
