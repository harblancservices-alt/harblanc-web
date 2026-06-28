"use client";

import { useContext } from "react";
import { deleteLoadExpense } from "../actions";
import { ExpenseEditContext } from "./FinancialsPanel";

/**
 * Load profit & loss card — revenue, auto fuel, auto factoring, and manual
 * expenses stacked into a bold net. Matches the load page's light inner card.
 * Add Expense opens a dialog with broker-style category autofill where Enter
 * jumps from the category to the amount.
 */

type Expense = {
  id: string;
  category: string;
  amount: number;
  note: string | null;
};

function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function LoadPnlCard({
  loadId,
  loadedMiles,
  loadedDiesel,
  deadheadMiles,
  deadheadDiesel,
  totalDiesel,
  factoringPct,
  factoring,
  brokerFactoring,
  expenses,
  expensesTotal,
}: {
  loadId: string;
  loadedMiles: number | null;
  loadedDiesel: number;
  deadheadMiles: number | null;
  deadheadDiesel: number;
  totalDiesel: number;
  factoringPct: number;
  factoring: number;
  /** Only show the factoring line when this load's broker actually factors. */
  brokerFactoring: boolean;
  expenses: Expense[];
  expensesTotal: number;
}) {
  const editing = useContext(ExpenseEditContext);
  return (
    <section className="overflow-hidden rounded-md border border-line bg-card">
      <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <p className="text-[14px] font-medium text-fg">Profit &amp; loss</p>
        <span className="text-[12px] text-fg-subtle">
          {expenses.length} {expenses.length === 1 ? "expense" : "expenses"}
        </span>
      </header>

      <div className="px-3 py-3">
        {/* Fuel */}
        <GroupLabel>Fuel</GroupLabel>
        <CostRow
          label="Loaded"
          sub={loadedMiles != null ? `${loadedMiles.toLocaleString()} mi` : undefined}
          value={loadedMiles != null ? loadedDiesel : null}
        />
        <CostRow
          label="Deadhead"
          sub={deadheadMiles != null ? `${deadheadMiles.toLocaleString()} mi` : undefined}
          value={deadheadMiles != null && deadheadMiles > 0 ? deadheadDiesel : null}
        />
        <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-line pt-1 pl-2.5">
          <span className="text-[12.5px] font-semibold text-fg">Total fuel</span>
          <span className="font-mono text-[12.5px] font-semibold tabular-nums text-red-700">
            −{usd(totalDiesel)}
          </span>
        </div>

        {/* Expenses */}
        <Divider />
        <div className="mb-0.5 flex items-center justify-between">
          <GroupLabel inline>Expenses</GroupLabel>
          <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
            −{usd(factoring + expensesTotal)}
          </span>
        </div>

        {/* Factoring (auto) — only when this load's broker is a factoring
            broker. Non-factoring brokers show no factoring line at all. */}
        {brokerFactoring ? (
          <div className="flex items-center justify-between py-[3px] text-[13px]">
            <span className="flex items-center gap-1.5">
              <span className="text-fg">Factoring</span>
              <span className="text-[11px] text-fg-subtle">{factoringPct}%</span>
            </span>
            <span className="font-mono tabular-nums text-red-700">
              −{usd(factoring)}
            </span>
          </div>
        ) : null}

        {/* Manual expenses */}
        {expenses.map((e) => (
          <div key={e.id} className="flex items-center justify-between py-[3px] text-[13px]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-fg">{e.category}</span>
              {e.note ? (
                <span className="truncate text-[11px] text-fg-subtle">{e.note}</span>
              ) : null}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono tabular-nums text-red-700">−{usd(e.amount)}</span>
              {editing ? (
                <form action={deleteLoadExpense.bind(null, e.id, loadId)}>
                  <button
                    type="submit"
                    aria-label="Remove expense"
                    className="flex h-5 w-5 items-center justify-center rounded border border-red-300 text-[13px] leading-none text-red-700 transition-colors hover:bg-red-50"
                  >
                    ×
                  </button>
                </form>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Divider() {
  return <div className="my-2 h-px bg-line" />;
}

function GroupLabel({
  children,
  inline = false,
}: {
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <p
      className={
        "font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-fg-subtle " +
        (inline ? "" : "mb-0.5")
      }
    >
      {children}
    </p>
  );
}

function CostRow({
  label,
  sub,
  value,
}: {
  label: string;
  sub?: string;
  value: number | null;
}) {
  return (
    <div
      className="grid items-baseline gap-3 py-[2px] pl-2.5 text-[13px]"
      style={{ gridTemplateColumns: "1fr auto auto" }}
    >
      <span className="text-fg">{label}</span>
      <span className="font-mono text-[12px] tabular-nums text-fg-subtle">
        {sub ?? ""}
      </span>
      <span
        className={
          "min-w-[52px] text-right font-mono tabular-nums " +
          (value != null ? "text-red-700" : "text-fg-subtle")
        }
      >
        {value != null ? `−${usd(value)}` : "—"}
      </span>
    </div>
  );
}

