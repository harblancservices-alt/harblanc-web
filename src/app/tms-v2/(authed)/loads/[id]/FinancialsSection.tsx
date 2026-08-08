"use client";

import { useState } from "react";
import { MoneyLine } from "./_parts";
import { DarkBarCard } from "./DarkBarCard";
import { ExpensesSection } from "./ExpensesSection";
import type { LoadExpenseItem } from "@/lib/data/loads";

/**
 * Financials — mirrors legacy /admin's FinancialsPanel/LoadPnlCard (closed
 * by default, "+ Add expense" always in the header), rebuilt on the shared
 * DarkBarCard wrapper so its header lines up with the Load details/
 * Odometer cards beside it.
 */
export function FinancialsSection({
  loadId,
  items,
  gross,
  diesel,
  factoring,
  expenses,
  net,
  isTonu,
  showFactoringLine,
}: {
  loadId: string;
  items: LoadExpenseItem[];
  gross: number;
  diesel: number;
  factoring: number;
  expenses: number;
  net: number;
  isTonu: boolean;
  showFactoringLine: boolean;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <DarkBarCard
      id="financials"
      title="Financials"
      headerAction={
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-[13px] font-medium text-bar-fg hover:underline"
        >
          + Add expense
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col divide-y divide-line border-y border-line">
          <MoneyLine label="Rate" value={gross} tone="none" />
          {!isTonu ? (
            <>
              <MoneyLine label="Fuel" value={-diesel} tone="negative" />
              {showFactoringLine ? <MoneyLine label="Factoring" value={-factoring} tone="negative" /> : null}
              <MoneyLine label={`Expenses (${items.length})`} value={-expenses} tone="negative" />
            </>
          ) : null}
          <MoneyLine label="Net" value={net} bold />
        </div>

        <div className="flex flex-col gap-1.5">
          <h3 className="text-[13px] font-medium text-fg-muted">Expense detail</h3>
          <ExpensesSection loadId={loadId} items={items} adding={adding} onAddingChange={setAdding} />
        </div>
      </div>
    </DarkBarCard>
  );
}
