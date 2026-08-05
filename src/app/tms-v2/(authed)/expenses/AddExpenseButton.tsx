"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { ExpenseFormModal } from "./ExpenseFormModal";

export function AddExpenseButton({ accountNames }: { accountNames: string[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add expense
      </Button>
      <ExpenseFormModal open={open} onClose={() => setOpen(false)} accountNames={accountNames} onSaved={() => router.refresh()} />
    </>
  );
}
