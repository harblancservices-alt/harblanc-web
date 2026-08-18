"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Money } from "@/components/tms-v2/ui/Money";
import { Button } from "@/components/tms-v2/ui/Button";
import { addLoadExpense, deleteLoadExpense } from "@/actions/tms-v2/loads";
import type { MutationResult } from "@/lib/demo/mutation";
import type { LoadExpenseItem } from "@/lib/data/loads";
import { Field, FormError } from "../_form";

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

/** Load Detail's per-load expense ledger — inline add (always reachable,
 * matches the audit's "+ Add expense always one tap away" principle) and
 * per-row delete. Closes the #8/#9 record traps (audit §3): tolls/lumper
 * couldn't be recorded without leaving tms-v2 before this. The "adding"
 * open-state is controlled by FinancialsSection's collapsible header (Phase
 * 5C) so its "+ Add expense" button opens the section AND the form in one
 * tap, per the audit's "never requires opening anything first" principle. */
export function ExpensesSection({
  loadId,
  items,
  adding,
  onAddingChange,
  editing = false,
}: {
  loadId: string;
  items: LoadExpenseItem[];
  adding: boolean;
  onAddingChange: (v: boolean) => void;
  /** Mirrors admin's FinancialsPanel "Edit" toggle — Delete only shows once
   * the section is put into edit mode, instead of always-visible. */
  editing?: boolean;
}) {
  const router = useRouter();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Side effects run inline in the action itself, not a `useEffect` keyed on
  // `state.ok` — see LoadFormModal.tsx for why.
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await addLoadExpense(loadId, formData);
    if (!result.ok) return { ok: false, error: result.reason };
    onAddingChange(false);
    router.refresh();
    return { ok: true, error: null };
  }, INITIAL);

  async function onDelete(expenseId: string) {
    if (!confirm("Delete this expense?")) return;
    setDeleteError(null);
    const result = await deleteLoadExpense(expenseId, loadId);
    if (!result.ok) {
      setDeleteError(result.reason);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      {deleteError ? <p className="text-[12px] font-medium text-bad">{deleteError}</p> : null}
      {items.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-2 text-[13px]">
          <span className="min-w-0 truncate text-fg">
            {e.category ?? "Expense"}
            {e.note ? ` — ${e.note}` : ""}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Money value={e.amount} tone="negative" />
            {editing ? (
              <button type="button" onClick={() => onDelete(e.id)} className="text-[12px] font-medium text-bad hover:underline">
                Delete
              </button>
            ) : null}
          </span>
        </div>
      ))}

      {adding ? (
        <form action={formAction} className="mt-1 flex flex-col gap-2 rounded-md border border-line-strong bg-card p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Category" name="category" placeholder="Toll, lumper…" required />
            <Field label="Amount ($)" name="amount" type="number" step="any" min="0" required />
          </div>
          <Field label="Note (optional)" name="note" />
          <FormError message={state.error} />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => onAddingChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
              {pending ? "Saving…" : "Add expense"}
            </Button>
          </div>
        </form>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-fg-muted">No expenses logged on this load yet.</p>
      ) : null}
    </div>
  );
}
