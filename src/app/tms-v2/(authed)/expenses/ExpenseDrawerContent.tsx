"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { editExpense, setExpenseArchived, deleteExpense, duplicateExpense, skipNextPayment } from "@/actions/tms-v2/expenses";
import type { MutationResult } from "@/lib/demo/mutation";
import type { RecurringExpenseRow, ExpenseActivityRow } from "@/lib/data/recurring-expenses";
import { EXPENSE_CATEGORIES, RECURRING_FREQUENCIES, RECURRING_FREQUENCY_LABEL, type RecurringFrequency } from "@/lib/domain/expenses";
import { Field, SelectField, TextareaField, FormError, FormActions, SavedNote } from "./_form";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Matches the established "Saved ✓" pause (_components/FarmBrokerContactCard.tsx)
// before the drawer navigates away.
const SAVED_PAUSE_MS = 1100;

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

/** Expenses ledger's context-drawer body — edit form (same field set the
 * old modal used) plus Archive/Restore, replacing the modal-based Edit
 * flow ExpenseRowActions used to trigger. */
export function ExpenseDrawerContent({
  expense,
  accounts,
  activity,
  closeHref,
}: {
  expense: RecurringExpenseRow;
  accounts: { id: string; name: string }[];
  activity: ExpenseActivityRow[];
  closeHref: string;
}) {
  const router = useRouter();
  const [frequency, setFrequency] = useState<RecurringFrequency>(expense.frequency);
  const [archivePending, startArchiveTransition] = useTransition();
  const [dupPending, startDupTransition] = useTransition();
  const [skipPending, startSkipTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Side effects live inside the action itself, not a `useEffect` keyed on
  // `state.ok` — that boolean stays `true` after the first successful save,
  // so a second edit-and-save in the same mount wouldn't change the
  // dependency's value and the effect would silently stop firing.
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await editExpense(expense.id, formData);
    if (!result.ok) return { ok: false, error: result.reason };
    setSaved(true);
    router.refresh();
    await new Promise((resolve) => setTimeout(resolve, SAVED_PAUSE_MS));
    router.push(closeHref);
    return { ok: true, error: null };
  }, INITIAL);

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

  function onDelete() {
    if (!confirm(`Delete "${expense.name}"? This can't be undone from here.`)) return;
    setActionError(null);
    setActionMessage(null);
    startDeleteTransition(async () => {
      const result = await deleteExpense(expense.id);
      if (result.ok) {
        router.push(closeHref);
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
        <SavedNote message={saved ? "Saved" : null} />

        <FormActions
          left={
            <Button type="button" variant="destructive" size="sm" onClick={onDelete} disabled={deletePending}>
              {deletePending ? "Deleting…" : "Delete"}
            </Button>
          }
        >
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {saved ? "Saved ✓" : pending ? "Saving…" : "Save changes"}
          </Button>
        </FormActions>
      </form>

      {activity.length > 0 ? (
        <div className="border-t border-line pt-3">
          <div className="text-[12px] font-medium uppercase tracking-wide text-fg-muted">Activity</div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {activity.map((a) => (
              <li key={a.id} className="text-[13px] text-fg-muted">
                <span className="font-medium text-fg">{a.action}</span>
                {a.detail ? ` — ${a.detail}` : ""} · {a.whenLabel}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
