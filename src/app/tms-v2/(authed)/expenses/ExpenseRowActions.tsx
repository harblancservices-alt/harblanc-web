"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { setExpenseArchived } from "@/actions/tms-v2/expenses";
import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";

/** Per-row Archive/Restore — the only inline row action now that editing a
 * row happens by selecting it (the row itself is a Link into the context
 * drawer, same pattern as the Load Board). stopPropagation keeps this
 * button's click from also triggering the row's own navigation. */
export function ExpenseRowActions({ expense }: { expense: RecurringExpenseRow }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggleArchived() {
    startTransition(async () => {
      await setExpenseArchived(expense.id, !expense.archived);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
      <Button type="button" variant="ghost" size="sm" onClick={toggleArchived} disabled={pending}>
        {pending ? "…" : expense.archived ? "Restore" : "Archive"}
      </Button>
    </div>
  );
}
