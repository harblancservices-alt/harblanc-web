"use client";

import { createContext, useState, type ReactNode } from "react";
import { AddExpenseDialog } from "./AddExpenseDialog";

/** True when the panel is in "edit" mode (expense delete controls visible). */
export const ExpenseEditContext = createContext(false);

/**
 * Financials panel — mirrors CollapsibleWorkspaceSection's dark header bar,
 * with "+ Add expense" and an Edit toggle on the bar itself. Edit reveals the
 * per-expense delete controls inside the P&L card (passed as children).
 */
export function FinancialsPanel({
  loadId,
  categories,
  children,
}: {
  loadId: string;
  categories: string[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <section className="overflow-hidden rounded-md border border-line bg-card shadow-md">
      <div className="flex items-center justify-between gap-2 bg-bar px-3 py-2.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <Chevron open={open} />
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-bar-fg">
            Financials
          </h2>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing((e) => !e);
              setOpen(true);
            }}
            aria-pressed={editing}
            className={
              "inline-flex items-center gap-1 rounded border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] transition-colors " +
              (editing
                ? "border-white/40 bg-white/15 text-bar-fg"
                : "border-white/25 text-bar-fg hover:bg-white/10")
            }
          >
            {editing ? "Done" : "Edit"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded border border-red-700 bg-red-600 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-700"
          >
            <span className="text-[12px] leading-none">+</span> Add expense
          </button>
        </div>
      </div>

      {open ? (
        <ExpenseEditContext.Provider value={editing}>
          <div className="space-y-3 bg-card p-3 text-fg">{children}</div>
        </ExpenseEditContext.Provider>
      ) : null}

      {adding ? (
        <AddExpenseDialog
          loadId={loadId}
          categories={categories}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={"shrink-0 text-bar-fg/70 transition-transform " + (open ? "rotate-90" : "")}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
