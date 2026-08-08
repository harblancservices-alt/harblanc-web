"use client";

import { useState } from "react";
import { Money } from "@/components/tms-v2/ui/Money";
import { Button } from "@/components/tms-v2/ui/Button";
import { MoneyLine } from "./_parts";
import { DarkBarCard } from "./DarkBarCard";
import { ExpensesSection } from "./ExpensesSection";
import { FinancialsPayAction } from "./LoadActions";
import type { LoadExpenseItem } from "@/lib/data/loads";

/**
 * Financials — mirrors legacy /admin's FinancialsPanel/LoadPnlCard: closed
 * by default, a "Profit & loss" card body with a FUEL sub-block (loaded/
 * deadhead split + a dashed-rule "Total fuel" subtotal) and an EXPENSES
 * sub-block (itemized, factoring included when it applies), ending in a
 * full-width grey "Net" footer band. Revenue/Rate is deliberately NOT
 * repeated here — it's already the command bar's own KPI tile; this card
 * is costs-and-net only, same as admin's.
 *
 * "Edit" toggles per-expense Delete visibility (admin's own behavior —
 * Delete isn't always showing); "Mark paid" (tms-v2-only, admin's Load
 * Detail has no payment-status control at all) lives in this same header
 * since payment status is a financial fact.
 */
export function FinancialsSection({
  loadId,
  items,
  loadedFuel,
  deadheadFuel,
  factoring,
  factoringPct,
  net,
  isTonu,
  showFactoringLine,
}: {
  loadId: string;
  items: LoadExpenseItem[];
  loadedFuel: number;
  deadheadFuel: number;
  factoring: number;
  factoringPct: number;
  net: number;
  isTonu: boolean;
  showFactoringLine: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const totalFuel = loadedFuel + deadheadFuel;
  const expensesTotal = items.reduce((s, i) => s + i.amount, 0) + (showFactoringLine ? factoring : 0);

  return (
    <DarkBarCard
      id="financials"
      title="Financials"
      headerAction={
        <div className="flex flex-wrap items-center gap-1.5">
          <FinancialsPayAction />
          <Button type="button" variant="info" size="sm" onClick={() => setEditing((v) => !v)}>
            ✎ Edit
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => setAdding(true)}>
            + Add expense
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold text-fg">Profit &amp; loss</span>
          <span className="text-[12px] text-fg-muted">
            {items.length} expense{items.length === 1 ? "" : "s"}
          </span>
        </div>

        {!isTonu ? (
          <>
            <div className="flex flex-col">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">Fuel</div>
              <MoneyLine label="Loaded (mi)" value={-loadedFuel} tone="negative" />
              <MoneyLine label="Deadhead (mi)" value={-deadheadFuel} tone="negative" />
              <div className="border-t border-dashed border-line-strong pt-1">
                <MoneyLine label="Total fuel" value={-totalFuel} tone="negative" bold />
              </div>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">Expenses</span>
                <Money value={-expensesTotal} tone="negative" className="text-[13px] font-semibold" />
              </div>
              {showFactoringLine ? <MoneyLine label={`Factoring ${factoringPct}%`} value={-factoring} tone="negative" /> : null}
              <ExpensesSection loadId={loadId} items={items} adding={adding} onAddingChange={setAdding} editing={editing} />
            </div>
          </>
        ) : null}

        <div className="-mx-4 -mb-4 mt-1 flex items-center justify-between rounded-b-xl bg-elevated px-4 py-3">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-fg-muted">Net</span>
          <Money value={net} className="text-[18px] font-semibold" />
        </div>
      </div>
    </DarkBarCard>
  );
}
