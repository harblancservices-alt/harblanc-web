"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { editExpense, setExpenseArchived } from "@/actions/tms-v2/expenses";
import type { MutationResult } from "@/lib/demo/mutation";
import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";
import { EXPENSE_CATEGORIES, RECURRING_FREQUENCIES, RECURRING_FREQUENCY_LABEL, type RecurringFrequency } from "@/lib/domain/expenses";
import { Field, SelectField, FormError, FormActions } from "./_form";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

/** Expenses ledger's context-drawer body — edit form (same field set the
 * old modal used) plus Archive/Restore, replacing the modal-based Edit
 * flow ExpenseRowActions used to trigger. */
export function ExpenseDrawerContent({ expense }: { expense: RecurringExpenseRow }) {
  const router = useRouter();
  const [frequency, setFrequency] = useState<RecurringFrequency>(expense.frequency);
  const [archivePending, startArchiveTransition] = useTransition();

  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await editExpense(expense.id, formData);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  function toggleArchived() {
    startArchiveTransition(async () => {
      await setExpenseArchived(expense.id, !expense.archived);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 pt-3">
      <Button type="button" variant="secondary" size="sm" onClick={toggleArchived} disabled={archivePending}>
        {archivePending ? "…" : expense.archived ? "Restore" : "Archive"}
      </Button>

      <form action={formAction} className="flex flex-col gap-3">
        <Field label="Name" name="name" required defaultValue={expense.name} />

        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Category" name="category" defaultValue={expense.category ?? ""}>
            <option value="">None</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
          <Field label="Vendor" name="vendor" defaultValue={expense.vendor ?? ""} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount ($)" name="amount" type="number" step="any" min="0" required defaultValue={String(expense.amount)} />
          <Field label="Card / account" name="card" autoComplete="off" defaultValue={expense.cardName ?? ""} />
        </div>

        <SelectField label="Frequency" name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}>
          {RECURRING_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {RECURRING_FREQUENCY_LABEL[f]}
            </option>
          ))}
        </SelectField>

        {frequency === "weekly" ? (
          <SelectField label="Day of week" name="day_of_week" required defaultValue={expense.dayOfWeek ?? "Monday"}>
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </SelectField>
        ) : frequency === "onetime" ? (
          <Field label="Date" name="start_date" type="date" required defaultValue={expense.startDate ?? ""} />
        ) : (
          <Field
            label="Day of month"
            name="day_of_month"
            type="number"
            min="1"
            max="31"
            defaultValue={expense.dayOfMonth != null ? String(expense.dayOfMonth) : ""}
          />
        )}

        <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <input type="checkbox" name="autopay" defaultChecked={expense.autopay} className="h-4 w-4" />
          Autopay
        </label>

        <FormError message={state.error} />

        <FormActions>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </FormActions>
      </form>
    </div>
  );
}
