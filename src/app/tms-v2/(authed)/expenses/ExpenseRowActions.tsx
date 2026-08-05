"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { setExpenseArchived } from "@/actions/tms-v2/expenses";
import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";
import { ExpenseFormModal } from "./ExpenseFormModal";

/** Per-row Edit + Archive/Restore — rendered inside a DataList column, so
 * each row gets its own modal/pending state without the list page itself
 * needing to be a client component. */
export function ExpenseRowActions({ expense, accountNames }: { expense: RecurringExpenseRow; accountNames: string[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggleArchived() {
    startTransition(async () => {
      await setExpenseArchived(expense.id, !expense.archived);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={toggleArchived} disabled={pending}>
        {pending ? "…" : expense.archived ? "Restore" : "Archive"}
      </Button>
      <ExpenseFormModal
        open={editing}
        onClose={() => setEditing(false)}
        accountNames={accountNames}
        expense={{
          id: expense.id,
          name: expense.name,
          category: expense.category,
          vendor: expense.vendor,
          amount: expense.amount,
          frequency: expense.frequency,
          cardName: expense.cardName,
          autopay: expense.autopay,
          dayOfMonth: expense.dayOfMonth,
          dayOfWeek: expense.dayOfWeek,
          startDate: expense.startDate,
        }}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
