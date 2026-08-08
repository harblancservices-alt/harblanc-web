"use client";

import { ExpenseComposerToggleButton } from "./ExpenseComposer";

/**
 * Desktop Expenses' slim top row (Brent's approved mockup, 2026-08-08):
 * title left, a small "+ Add bill" trigger far right — no banner. The
 * shared PageHeader component deliberately renders no title anywhere in
 * /tms-v2 (its own house-rule comment); this is a desktop-only override of
 * that, same precedent as the Load Board's own LoadBoardDesktopToolbar
 * `<h1>`. Reuses the exact same ExpenseComposerToggleButton/Modal mobile's
 * Fab already opens — just a smaller button, not a second Add-bill flow.
 */
export function ExpensesDesktopToolbar() {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
      <h1 className="text-[20px] font-semibold text-fg">Expenses</h1>
      <ExpenseComposerToggleButton size="sm" />
    </div>
  );
}
