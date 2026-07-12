"use client";

import { createContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
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
  // Collapsed by default (like Load details) — the header bar with Edit /
  // + Add expense stays visible; tapping the bar, or either action, expands it.
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <section className="overflow-hidden rounded-md border border-line bg-card shadow-e2">
      {/* min-h-[48px] matches the Load details / Odometer section headers so
          the three panel bars (and their Edit buttons) line up across columns. */}
      <div className="flex min-h-[48px] items-center justify-between gap-2 bg-bar px-3 py-2">
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
          <Button
            type="button"
            variant="edit"
            size="sm"
            onClick={() => {
              setEditing((e) => !e);
              setOpen(true);
            }}
            aria-pressed={editing}
          >
            {editing ? "Done" : "Edit"}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              setAdding(true);
              setOpen(true);
            }}
            leftIcon={<span className="text-[12px] leading-none">+</span>}
          >
            Add expense
          </Button>
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
