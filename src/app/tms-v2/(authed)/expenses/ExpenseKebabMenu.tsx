"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { setExpenseArchived, deleteExpense, makeExpenseOneTime, changeExpenseAccount } from "@/actions/tms-v2/expenses";
import type { MutationResult } from "@/lib/demo/mutation";
import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";

/**
 * Desktop table's "⋯" row menu (Brent's approved mockup, 2026-08-08):
 * Pause/Resume, Make one-time, Change account, Delete. Built as a Modal
 * rather than a positioned dropdown — DataList's desktop table wrapper is
 * `overflow-hidden` (for its rounded corners, see DataList.tsx), which
 * would clip an absolutely-positioned panel anchored inside a row; a
 * centered Modal (already the app's one shared overlay primitive) sidesteps
 * that entirely instead of teaching DataList to escape its own clipping.
 *
 * "Pause" reuses the exact same archived flag/action the row's own Edit
 * drawer already exposes as "Archive" (setExpenseArchived) — same
 * mechanism, mockup wording. Since this page only ever fetches
 * status:"active" bills (mobile and desktop share that one fetch — no
 * forked query), a paused bill leaves this list on the next refresh, same
 * as Archive already does everywhere else in the app; there's nothing here
 * to "Resume" from within this filtered view, which is an existing,
 * disclosed limitation of the page, not a new gap this menu introduces.
 */
export function ExpenseKebabMenu({
  expense,
  accounts,
}: {
  expense: RecurringExpenseRow;
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function close() {
    setOpen(false);
    setError(null);
    setConfirmDelete(false);
  }

  async function run(key: string, fn: () => Promise<MutationResult<unknown>>, opts?: { closeOnSuccess?: boolean }) {
    setBusy(key);
    setError(null);
    const result = await fn();
    setBusy(null);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    router.refresh();
    if (opts?.closeOnSuccess !== false) close();
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`More actions for ${expense.name}`}
        className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-elevated hover:text-fg"
      >
        <span aria-hidden className="text-[16px] leading-none">
          ⋯
        </span>
      </button>

      <Modal open={open} onClose={close} title={expense.name} maxWidthClassName="max-w-sm">
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-start"
            disabled={busy != null}
            onClick={() => run("pause", () => setExpenseArchived(expense.id, true))}
          >
            {busy === "pause" ? "Pausing…" : "Pause bill"}
          </Button>

          {expense.frequency !== "onetime" ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start"
              disabled={busy != null}
              onClick={() => {
                if (!confirm(`Convert "${expense.name}" to a one-time charge on its next scheduled date?`)) return;
                void run("onetime", () => makeExpenseOneTime(expense.id));
              }}
            >
              {busy === "onetime" ? "Converting…" : "Make one-time"}
            </Button>
          ) : null}

          <div className="flex flex-col gap-1.5 rounded-md border border-line-strong px-3 py-2.5">
            <span className="text-[12px] font-medium text-fg-muted">Change account</span>
            <select
              defaultValue={expense.expenseAccountId ?? ""}
              disabled={busy != null}
              onChange={(e) => run("account", () => changeExpenseAccount(expense.id, e.target.value || null), { closeOnSuccess: false })}
              className="h-9 rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg outline-none focus:border-accent"
            >
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {error ? <p className="text-[13px] font-medium text-bad">{error}</p> : null}

          <Button
            type="button"
            variant="destructive"
            className="mt-2 w-full justify-start"
            disabled={busy != null}
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              void run("delete", () => deleteExpense(expense.id));
            }}
          >
            {busy === "delete" ? "Deleting…" : confirmDelete ? "Confirm delete? This can't be undone" : "Delete"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
