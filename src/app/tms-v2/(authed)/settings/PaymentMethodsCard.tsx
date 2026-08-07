"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { createExpenseAccount, updateExpenseAccount, deleteExpenseAccount, type PaymentMethodResult } from "@/actions/tms-v2/expense-accounts";
import type { ExpenseAccountRow } from "@/lib/data/recurring-expenses";

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-fg-muted";
const FIELD = "mt-1 h-10 w-full rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg outline-none focus:border-fg";

/** Expense payment methods (expense_accounts) — full CRUD, closing the
 * "read-only in this phase" gap listExpenseAccounts.ts's own header
 * comment flagged. Same nickname + light card metadata as legacy — no card
 * numbers stored, ever, only a last4. */
export function PaymentMethodsCard({ accounts, disabled }: { accounts: ExpenseAccountRow[]; disabled: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ExpenseAccountRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function onDelete(id: string) {
    if (!confirm("Remove this payment method?")) return;
    setDeletingId(id);
    const res = await deleteExpenseAccount(id);
    setDeletingId(null);
    if (!res.ok) alert(res.reason);
    router.refresh();
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      {accounts.length === 0 ? (
        <p className="text-[13px] text-fg-muted">No payment methods on file yet.</p>
      ) : (
        <div className="rounded-xl border border-line bg-card px-3 shadow-e1">
          {accounts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 text-[14px] last:border-b-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-fg">{a.name}</span>
                {a.type ? <span className="text-fg-muted">{a.type}</span> : null}
                {a.last4 ? <span className="text-fg-muted">····{a.last4}</span> : null}
                {a.isDefault ? (
                  <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">Default</span>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setEditing(a)} disabled={disabled} className="font-medium text-accent hover:underline disabled:opacity-50">
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(a.id)}
                  disabled={disabled || deletingId === a.id}
                  className="font-medium text-bad hover:underline disabled:opacity-50"
                >
                  {deletingId === a.id ? "…" : "Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)} disabled={disabled} className="w-fit">
        + Add payment method
      </Button>

      {adding ? <AccountModal onClose={() => setAdding(false)} onSaved={() => router.refresh()} /> : null}
      {editing ? <AccountModal account={editing} onClose={() => setEditing(null)} onSaved={() => router.refresh()} /> : null}
    </div>
  );
}

function AccountModal({
  account,
  onClose,
  onSaved,
}: {
  account?: ExpenseAccountRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: PaymentMethodResult = account ? await updateExpenseAccount(account.id, formData) : await createExpenseAccount(formData);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      onSaved();
      onClose();
    }
  }, [state.ok, onSaved, onClose]);

  return (
    <Modal open onClose={onClose} title={account ? "Edit payment method" : "Add payment method"}>
      <form action={formAction} className="flex flex-col gap-3">
        <label className="block">
          <span className={LABEL}>Nickname</span>
          <input name="name" defaultValue={account?.name ?? ""} required className={FIELD} />
        </label>
        <label className="block">
          <span className={LABEL}>Type</span>
          <input name="type" defaultValue={account?.type ?? ""} placeholder="Credit card, Bank account…" className={FIELD} />
        </label>
        <label className="block">
          <span className={LABEL}>Last 4 digits</span>
          <input name="last4" defaultValue={account?.last4 ?? ""} maxLength={4} className={FIELD} />
        </label>
        <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <input type="checkbox" name="is_default" defaultChecked={account?.isDefault ?? false} className="h-4 w-4" />
          Default payment method
        </label>
        {state.error ? (
          <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-[13px] font-medium text-bad">
            {state.error}
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
