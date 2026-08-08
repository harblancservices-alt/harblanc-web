"use client";

import { createContext, useActionState, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { Fab } from "@/components/tms-v2/ui/Fab";
import { addExpense } from "@/actions/tms-v2/expenses";
import type { MutationResult } from "@/lib/demo/mutation";
import { EXPENSE_CATEGORIES, RECURRING_FREQUENCIES, RECURRING_FREQUENCY_LABEL, type RecurringFrequency } from "@/lib/domain/expenses";
import { Field, SelectField, TextareaField, FormError, FormActions } from "./_form";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

/**
 * The Expenses ledger's "primary action top-right, same spot every page"
 * shell anchor and its inline composer are one open/closed state shared
 * across two different DOM locations (the PageHeader action button, the
 * panel above the ledger) — a small context is the least-ceremony way to
 * connect them across that gap without lifting form state into the
 * server-rendered page itself. Replaces the old Add-expense modal
 * (v2-design.md's "inline composer" instruction): the form now expands in
 * place above the ledger instead of covering the screen.
 */
const ComposerCtx = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

export function ExpenseComposerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <ComposerCtx.Provider value={{ open, setOpen }}>{children}</ComposerCtx.Provider>;
}

function useComposer() {
  const ctx = useContext(ComposerCtx);
  if (!ctx) throw new Error("ExpenseComposer pieces must be rendered inside ExpenseComposerProvider");
  return ctx;
}

export function ExpenseComposerToggleButton() {
  const { open, setOpen } = useComposer();
  return (
    <Button type="button" onClick={() => setOpen(!open)}>
      {open ? "Close" : "Add expense"}
    </Button>
  );
}

/** Mobile's thumb-zone counterpart to the toggle button above — same
 * shared open/closed state, same "Add expense" composer panel, just
 * triggered from the Fab pattern every other primary mobile action uses
 * (AddLoadButton, NewBrokerButton) instead of a header button. Fab is
 * self-hiding at lg (matches the header button's `hidden lg:inline-flex`
 * at its call site), so exactly one trigger is visible per breakpoint. */
export function ExpenseComposerFab() {
  const { setOpen } = useComposer();
  return <Fab label="Add expense" onClick={() => setOpen(true)} />;
}

export function ExpenseComposerPanel({ accounts }: { accounts: { id: string; name: string }[] }) {
  const { open, setOpen } = useComposer();
  const router = useRouter();
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");

  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult<unknown> = await addExpense(formData);
    if (!result.ok) return { ok: false, error: result.reason };
    return { ok: true, error: null };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, setOpen, router]);

  if (!open) return null;

  return (
    <div className="rounded-xl border border-line bg-card p-4 shadow-e1">
      <form action={formAction} className="flex flex-col gap-3">
        <Field label="Name" name="name" required />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField label="Category" name="category" defaultValue="">
            <option value="">None</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
          <Field label="Vendor" name="vendor" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Amount ($)" name="amount" type="number" step="any" min="0" required />
          <SelectField label="Payment account" name="expense_account_id" defaultValue="">
            <option value="">None</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField label="Frequency" name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}>
            {RECURRING_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {RECURRING_FREQUENCY_LABEL[f]}
              </option>
            ))}
          </SelectField>

          {frequency === "weekly" ? (
            <SelectField label="Day of week" name="day_of_week" required defaultValue="Monday">
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </SelectField>
          ) : frequency === "onetime" ? (
            <Field label="Date" name="start_date" type="date" required />
          ) : (
            <Field label="Day of month" name="day_of_month" type="number" min="1" max="31" />
          )}
        </div>

        {frequency !== "onetime" ? (
          <Field label="End date (optional)" name="end_date" type="date" />
        ) : null}

        <TextareaField label="Notes (optional)" name="notes" rows={2} />

        <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <input type="checkbox" name="autopay" defaultChecked className="h-4 w-4" />
          Autopay
        </label>

        <FormError message={state.error} />

        <FormActions>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Add expense"}
          </Button>
        </FormActions>
      </form>
    </div>
  );
}
