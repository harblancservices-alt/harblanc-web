"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { StatusTag } from "@/components/ui/StatusTag";
import { field } from "@/components/ui/styles";
import { IconX } from "./icons";
import { createExpenseAccount, deleteExpenseAccount, updateExpenseAccount } from "./actions";
import { PAYMENT_METHOD_TYPES, type ExpenseAccount } from "./types";

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** "Manage Payment Methods" — replaces the old name-only "Manage cards"
 *  dialog. Each row is a nickname + light card metadata (type, last 4 —
 *  never a full number) plus the two numbers that matter operationally:
 *  how much recurs on it monthly, and how many active charges point at it. */
export function PaymentMethodsDialog({
  accounts: initialAccounts,
  onClose,
}: {
  accounts: ExpenseAccount[];
  onClose: () => void;
}) {
  const [accounts, setAccounts] = useState<ExpenseAccount[]>(initialAccounts);
  const [editingId, setEditingId] = useState<string | "new" | null>(
    initialAccounts.length === 0 ? "new" : null,
  );
  const [busy, startBusy] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  function handleSubmit(formData: FormData, id: string | "new") {
    setError(null);
    startBusy(async () => {
      const res =
        id === "new" ? await createExpenseAccount(formData) : await updateExpenseAccount(id, formData);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      const isDefault = formData.get("is_default") === "on";
      const updated: ExpenseAccount = {
        id: res.id,
        name: String(formData.get("name") ?? ""),
        type: (formData.get("type") as string) || null,
        last4: ((formData.get("last4") as string) || "").replace(/\D/g, "").slice(-4) || null,
        isDefault,
        monthlySpend: id === "new" ? 0 : accounts.find((a) => a.id === id)?.monthlySpend ?? 0,
        chargeCount: id === "new" ? 0 : accounts.find((a) => a.id === id)?.chargeCount ?? 0,
      };
      setAccounts((prev) => {
        const next = isDefault ? prev.map((a) => ({ ...a, isDefault: false })) : prev;
        const withoutThis = next.filter((a) => a.id !== updated.id);
        return [...withoutThis, updated].sort((a, b) => a.name.localeCompare(b.name));
      });
      setEditingId(null);
    });
  }

  function handleDelete(account: ExpenseAccount) {
    if (!window.confirm(`Remove "${account.name}"? Existing expenses keep showing this name.`)) {
      return;
    }
    setError(null);
    setBusyId(account.id);
    startBusy(async () => {
      try {
        await deleteExpenseAccount(account.id);
        setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not remove payment method.");
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Manage payment methods"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-3 pb-6 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-6 sm:pb-6 sm:pt-6"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-line-strong bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 bg-bar px-4 py-3">
          <span className="truncate text-[13px] font-bold uppercase tracking-[0.1em] text-bar-fg">
            Payment methods
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-bar-fg/70 transition-colors hover:bg-white/10 hover:text-bar-fg"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto bg-elevated px-4 py-4">
          <p className="text-[12px] leading-snug text-fg-muted">
            Nickname and type only — no full card numbers. These populate the
            expense form&rsquo;s Payment Method dropdown.
          </p>

          {error ? (
            <p role="alert" className="text-[12px] font-semibold text-bad">
              {error}
            </p>
          ) : null}

          {accounts.length === 0 && editingId !== "new" ? (
            <div className="rounded-md border border-dashed border-line-strong bg-card px-3 py-5 text-center text-[12px] text-fg-subtle">
              No payment methods yet.
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((a) =>
                editingId === a.id ? (
                  <AccountForm
                    key={a.id}
                    account={a}
                    pending={busy}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(fd) => handleSubmit(fd, a.id)}
                  />
                ) : (
                  <AccountRow
                    key={a.id}
                    account={a}
                    disabled={busy && busyId === a.id}
                    onEdit={() => setEditingId(a.id)}
                    onDelete={() => handleDelete(a)}
                  />
                ),
              )}
            </div>
          )}

          {editingId === "new" ? (
            <AccountForm
              pending={busy}
              onCancel={accounts.length > 0 ? () => setEditingId(null) : undefined}
              onSubmit={(fd) => handleSubmit(fd, "new")}
            />
          ) : (
            <Button type="button" onClick={() => setEditingId("new")} variant="navigate" size="md" fullWidth>
              + Add payment method
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AccountRow({
  account,
  disabled,
  onEdit,
  onDelete,
}: {
  account: ExpenseAccount;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border border-line bg-card px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13.5px] font-bold text-ink">{account.name}</span>
            {account.isDefault ? (
              <StatusTag tone="steel" hideDot>
                Default
              </StatusTag>
            ) : null}
          </div>
          <div className="mt-0.5 text-[11.5px] text-fg-subtle">
            {account.type ?? "Type not set"}
            {account.last4 ? ` · ····${account.last4}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button type="button" onClick={onEdit} disabled={disabled} variant="edit" size="sm">
            Edit
          </Button>
          <Button type="button" onClick={onDelete} disabled={disabled} variant="destructive" size="sm">
            {disabled ? "…" : "Remove"}
          </Button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-4 border-t border-line pt-2 text-[11.5px] text-fg-muted">
        <span>
          <span className="font-bold tabular-nums text-ink">{usd(account.monthlySpend)}</span> / mo
        </span>
        <span>
          <span className="font-bold tabular-nums text-ink">{account.chargeCount}</span>{" "}
          {account.chargeCount === 1 ? "charge" : "charges"}
        </span>
      </div>
    </div>
  );
}

function AccountForm({
  account,
  pending,
  onCancel,
  onSubmit,
}: {
  account?: ExpenseAccount;
  pending: boolean;
  onCancel?: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
      className="space-y-2 rounded-md border border-line-strong bg-card p-3"
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={field.label}>Nickname</label>
          <input
            name="name"
            defaultValue={account?.name ?? ""}
            required
            autoComplete="off"
            placeholder="e.g. Amex Business"
            className={field.input}
          />
        </div>
        <div>
          <label className={field.label}>Type</label>
          <select name="type" defaultValue={account?.type ?? ""} className={field.select}>
            <option value="">Not set</option>
            {PAYMENT_METHOD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={field.label}>Last 4</label>
          <input
            name="last4"
            defaultValue={account?.last4 ?? ""}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            placeholder="1234"
            className={field.input + " tabular-nums"}
          />
        </div>
        <label className="mt-5 flex h-10 w-fit items-center gap-2 rounded-md border border-line-strong bg-card px-3 text-[13px] font-semibold text-ink">
          <input
            type="checkbox"
            name="is_default"
            defaultChecked={account?.isDefault ?? false}
            className="h-4 w-4 accent-accent"
          />
          Default
        </label>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel ? (
          <Button type="button" onClick={onCancel} disabled={pending} variant="cancel" size="sm">
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={pending} variant="primary" size="sm">
          {pending ? "Saving…" : account ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  );
}
