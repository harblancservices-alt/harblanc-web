"use client";

import { useRef } from "react";
import { addLoadExpense } from "../actions";

/** Add-expense dialog: category autofills from prior ones, Enter jumps to amount. */
export function AddExpenseDialog({
  loadId,
  categories,
  onClose,
}: {
  loadId: string;
  categories: string[];
  onClose: () => void;
}) {
  const amountRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-lg border border-line bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line bg-elevated px-4 py-2.5">
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-fg">
            Add expense
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[18px] leading-none text-fg-subtle transition-colors hover:text-fg"
          >
            ×
          </button>
        </div>

        <datalist id="expense-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <form
          action={async (fd) => {
            await addLoadExpense(loadId, fd);
            onClose();
          }}
          className="px-4 py-4"
        >
          <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
            Category<span className="text-red-600"> *</span>
          </label>
          <input
            name="category"
            list="expense-categories"
            required
            autoComplete="off"
            placeholder="e.g. Hotel, Tolls, Lumper"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                amountRef.current?.focus();
              }
            }}
            className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-fg-subtle">
            Previous categories autofill · Enter jumps to amount.
          </p>

          <label className="mt-3 block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
            Amount ($)<span className="text-red-600"> *</span>
          </label>
          <input
            ref={amountRef}
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            autoComplete="off"
            placeholder="0.00"
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 font-mono text-[14px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
          />

          <label className="mt-3 block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
            Note <span className="text-fg-subtle">· optional</span>
          </label>
          <input
            name="note"
            autoComplete="off"
            placeholder="e.g. Pilot, Memphis"
            className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
          />

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-line-strong bg-card px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-fg transition-colors hover:bg-elevated"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md border border-red-700 bg-red-600 px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700"
            >
              Add expense
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
