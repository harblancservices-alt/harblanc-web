"use client";

import { useActionState, useEffect, useState } from "react";
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
 * couldn't be recorded without leaving tms-v2 before this. */
export function ExpensesSection({ loadId, items }: { loadId: string; items: LoadExpenseItem[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await addLoadExpense(loadId, formData);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      setAdding(false);
      router.refresh();
    }
  }, [state.ok, router]);

  async function onDelete(expenseId: string) {
    if (!confirm("Delete this expense?")) return;
    await deleteLoadExpense(expenseId, loadId);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-2 text-[13px]">
          <span className="min-w-0 truncate text-fg">
            {e.category ?? "Expense"}
            {e.note ? ` — ${e.note}` : ""}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Money value={e.amount} tone="negative" />
            <button type="button" onClick={() => onDelete(e.id)} className="text-[12px] font-medium text-bad hover:underline">
              Delete
            </button>
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
            <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
              {pending ? "Saving…" : "Add expense"}
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1 w-fit text-[13px] font-medium text-accent hover:underline"
        >
          + Add expense
        </button>
      )}
    </div>
  );
}
