"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_shell/Modal";
import { Field, SelectField, SubmitButton, FormError } from "../_shell/form";
import { createDeal } from "./actions";
import type { RepOption } from "../accounts/CompanyDialog";
import type { AccountOption, StageOption } from "./types";

/**
 * The "New deal" dialog — one create form (name, company, stage, amount,
 * close date, owner), matching CompanyDialog/TaskDialog's shape. There's no
 * edit mode: a deal's stage moves via the card's own "move to" control, and
 * no other field is editable from the board yet.
 */
export function DealDialog({
  accounts,
  stages,
  reps,
  pipelineId,
  defaultStageId,
  trigger,
}: {
  accounts: AccountOption[];
  stages: StageOption[];
  reps: RepOption[];
  pipelineId: string | null;
  defaultStageId?: string;
  trigger: (open: () => void) => ReactNode;
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
      const result = await createDeal(formData);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      {trigger(() => {
        setError(null);
        setOpen(true);
      })}

      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="New deal">
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input type="hidden" name="pipeline_id" value={pipelineId ?? ""} />

          <Field
            label="Deal name"
            name="name"
            required
            autoFocus
            placeholder="e.g. Acme Freight — Q3 lanes"
          />

          <SelectField label="Company" name="account_id" required defaultValue="">
            <option value="" disabled>
              {accounts.length ? "Select a company" : "No companies yet"}
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Stage"
            name="stage_id"
            defaultValue={defaultStageId ?? stages[0]?.id ?? ""}
          >
            {stages.length === 0 && <option value="">No stage</option>}
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Amount ($)"
              name="estimated_revenue"
              inputMode="decimal"
              placeholder="0"
            />
            <Field label="Close date" name="expected_close_date" type="date" />
          </div>

          <SelectField label="Owner" name="assigned_user_id" defaultValue="">
            <option value="">Unassigned</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </SelectField>

          <SubmitButton pending={pending}>Save deal</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
