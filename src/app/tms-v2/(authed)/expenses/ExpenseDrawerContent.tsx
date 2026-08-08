"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { editExpense, setExpenseArchived, duplicateExpense, skipNextPayment } from "@/actions/tms-v2/expenses";
import type { MutationResult } from "@/lib/demo/mutation";
import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";
import { EXPENSE_CATEGORIES, RECURRING_FREQUENCIES, RECURRING_FREQUENCY_LABEL, type RecurringFrequency } from "@/lib/domain/expenses";
import { Field, SelectField, TextareaField, FormError, FormActions } from "./_form";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

/** Expenses ledger's context-drawer body — edit form (same field set the
 * old modal used) plus Archive/Restore, replacing the modal-based Edit
 * flow ExpenseRowActions used to trigger. */
export function ExpenseDrawerContent({ expense, accounts }: { expense: RecurringExpenseRow; accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [frequency, setFrequency] = useState<RecurringFrequency>(expense.frequency);
  const [archivePending, startArchiveTransition] = useTransition();
  const [dupPending, startDupTransition] = useTransition();
  const [skipPending, startSkipTransition] = useTransition();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  function onDuplicate() {
    setActionError(null);
    setActionMessage(null);
    startDupTransition(async () => {
      const result = await duplicateExpense(expense.id);
      if (result.ok) {
        setActionMessage(`Duplicated as "${expense.name} (copy)".`);
        router.refresh();
      } else {
        setActionError(result.reason);
      }
    });
  }

  function onSkipNext() {
    if (!confirm("Skip the next scheduled charge for this expense?")) return;
    setActionError(null);
    setActionMessage(null);
    startSkipTransition(async () => {
      const result = await skipNextPayment(expense.id);
      if (result.ok) {
        setActionMessage(`Skipped the charge due ${result.data?.skippedDate ?? "next"}.`);
        router.refresh();
      } else {
        setActionError(result.reason);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={toggleArchived} disabled={archivePending}>
          {archivePending ? "…" : expense.archived ? "Restore" : "Archive"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onDuplicate} disabled={dupPending}>
          {dupPending ? "Duplicating…" : "Duplicate"}
        </Button>
        {expense.frequency !== "onetime" ? (
          <Button type="button" variant="secondary" size="sm" onClick={onSkipNext} disabled={skipPending}>
            {skipPending ? "Skipping…" : "Skip next payment"}
          </Button>
        ) : null}
      </div>
      {actionMessage ? <p className="text-[13px] text-fg-muted">{actionMessage}</p> : null}
      {actionError ? <p className="text-[13px] font-medium text-bad">{actionError}</p> : null}

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
          <SelectField label="Payment account" name="expense_account_id" defaultValue={expense.expenseAccountId ?? ""}>
            <option value="">None</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
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

        {frequency !== "onetime" ? (
          <Field label="End date (optional)" name="end_date" type="date" defaultValue={expense.endDate ?? ""} />
        ) : null}

        <TextareaField label="Notes (optional)" name="notes" rows={2} defaultValue={expense.notes ?? ""} />

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
