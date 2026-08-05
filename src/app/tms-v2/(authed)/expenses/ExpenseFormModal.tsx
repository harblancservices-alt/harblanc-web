"use client";

import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { addExpense, editExpense } from "@/actions/tms-v2/expenses";
import type { MutationResult } from "@/lib/demo/mutation";
import { EXPENSE_CATEGORIES, RECURRING_FREQUENCIES, RECURRING_FREQUENCY_LABEL, type RecurringFrequency } from "@/lib/domain/expenses";
import { Field, SelectField, FormError, FormActions } from "./_form";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type ExpenseFormValues = {
  id: string;
  name: string;
  category: string | null;
  vendor: string | null;
  amount: number;
  frequency: RecurringFrequency;
  cardName: string | null;
  autopay: boolean;
  dayOfMonth: number | null;
  dayOfWeek: string | null;
  startDate: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  accountNames: string[];
  expense?: ExpenseFormValues;
  onSaved?: () => void;
};

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

export function ExpenseFormModal({ open, onClose, accountNames, expense, onSaved }: Props) {
  const editing = expense != null;
  const [frequency, setFrequency] = useState<RecurringFrequency>(expense?.frequency ?? "monthly");

  useEffect(() => {
    if (open) setFrequency(expense?.frequency ?? "monthly");
  }, [open, expense?.frequency]);

  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult<unknown> = expense ? await editExpense(expense.id, formData) : await addExpense(formData);
    if (!result.ok) return { ok: false, error: result.reason };
    return { ok: true, error: null };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      onSaved?.();
      onClose();
    }
  }, [state.ok, onSaved, onClose]);

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit expense" : "Add expense"}>
      <form action={formAction} className="flex flex-col gap-3">
        <datalist id="tms-v2-expense-account-options">
          {accountNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <Field label="Name" name="name" required defaultValue={expense?.name ?? ""} />

        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Category" name="category" defaultValue={expense?.category ?? ""}>
            <option value="">None</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
          <Field label="Vendor" name="vendor" defaultValue={expense?.vendor ?? ""} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount ($)" name="amount" type="number" step="any" min="0" required defaultValue={expense ? String(expense.amount) : ""} />
          <Field label="Card / account" name="card" list="tms-v2-expense-account-options" autoComplete="off" defaultValue={expense?.cardName ?? ""} />
        </div>

        <SelectField label="Frequency" name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}>
          {RECURRING_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {RECURRING_FREQUENCY_LABEL[f]}
            </option>
          ))}
        </SelectField>

        {frequency === "weekly" ? (
          <SelectField label="Day of week" name="day_of_week" required defaultValue={expense?.dayOfWeek ?? "Monday"}>
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </SelectField>
        ) : frequency === "onetime" ? (
          <Field label="Date" name="start_date" type="date" required defaultValue={expense?.startDate ?? ""} />
        ) : (
          <Field
            label="Day of month"
            name="day_of_month"
            type="number"
            min="1"
            max="31"
            defaultValue={expense?.dayOfMonth != null ? String(expense.dayOfMonth) : ""}
          />
        )}

        <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <input type="checkbox" name="autopay" defaultChecked={expense?.autopay ?? true} className="h-4 w-4" />
          Autopay
        </label>

        <FormError message={state.error} />

        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add expense"}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}
