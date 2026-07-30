"use client";

import { Button, type ButtonSize } from "@/components/ui/Button";
import { deleteExpense } from "./actions";

/** Soft-delete a recurring expense, with a confirm prompt. */
export function DeleteExpenseButton({
  id,
  name,
  size = "sm",
  fullWidth = false,
}: {
  id: string;
  name: string;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  return (
    <form
      className={fullWidth ? "w-full" : undefined}
      action={deleteExpense.bind(null, id)}
      onSubmit={(e) => {
        if (!window.confirm(`Delete "${name}"? This removes it from the tracker.`)) {
          e.preventDefault();
        }
      }}
    >
      <Button type="submit" variant="destructive" size={size} fullWidth={fullWidth}>
        Delete
      </Button>
    </form>
  );
}
