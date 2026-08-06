"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { Fab } from "@/components/tms-v2/ui/Fab";
import { ExpenseFormModal } from "./ExpenseFormModal";

type Props = {
  accountNames: string[];
  /** false when this button is already one of several inline actions (e.g.
   * Today's Quick Add rail) — see AddLoadButton's identical note. */
  showFab?: boolean;
};

export function AddExpenseButton({ accountNames, showFab = true }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <div className={showFab ? "hidden lg:block" : ""}>
        <Button type="button" onClick={() => setOpen(true)} className={showFab ? "" : "w-full justify-center"}>
          Add expense
        </Button>
      </div>
      {showFab ? <Fab label="Add expense" onClick={() => setOpen(true)} /> : null}
      <ExpenseFormModal open={open} onClose={() => setOpen(false)} accountNames={accountNames} onSaved={() => router.refresh()} />
    </>
  );
}
