"use client";

import { useEffect, useState } from "react";
import { MoneyLine } from "./_parts";
import { ExpensesSection } from "./ExpensesSection";
import type { LoadExpenseItem } from "@/lib/data/loads";

/**
 * Financials — collapsed by default (audit's "collapsed sections whose
 * header still exposes the primary action" principle), but "+ Add expense"
 * in the header opens the section AND the add form in one tap, so the
 * single most common write action never requires "opening" anything first.
 * Auto-expands + scrolls into view when the page loads at #financials (a
 * deep-linked alert).
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
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#financials") {
      setOpen(true);
    }
  }, []);

  return (
    <section id="financials" className="scroll-mt-16 flex flex-col gap-3 border-b border-line pb-6">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-[15px] font-semibold text-fg">
          <span className={`inline-block text-fg-muted transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
            ›
          </span>
          Financials
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setAdding(true);
          }}
          className="text-[13px] font-medium text-accent hover:underline"
        >
          + Add expense
        </button>
      </div>

      {open ? (
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
      ) : null}
    </section>
  );
}
