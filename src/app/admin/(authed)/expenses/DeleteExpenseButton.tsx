"use client";

import { Button } from "@/components/ui/Button";
import { deleteExpense } from "./actions";

/** Soft-delete a recurring expense, with a confirm prompt. */
export function DeleteExpenseButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteExpense.bind(null, id)}
      onSubmit={(e) => {
        if (!window.confirm(`Delete "${name}"? This removes it from the tracker.`)) {
          e.preventDefault();
        }
      }}
    >
      <Button type="submit" variant="destructive" size="sm">
        Delete
      </Button>
    </form>
  );
}
