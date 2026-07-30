"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { field } from "@/components/ui/styles";
import { createExpenseAccount, deleteExpenseAccount } from "./actions";
import type { ExpenseAccount } from "./types";

function sortByName(list: ExpenseAccount[]): ExpenseAccount[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

/** "Manage cards / accounts" — add or remove name-only card/account entries. */
export function ExpenseAccountsDialog({
  accounts: initialAccounts,
  onClose,
}: {
  accounts: ExpenseAccount[];
  onClose: () => void;
}) {
  const [accounts, setAccounts] = useState<ExpenseAccount[]>(initialAccounts);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();
  const busy = adding || removing;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    startAdd(async () => {
      try {
        const fd = new FormData();
        fd.set("name", trimmed);
        const res = await createExpenseAccount(fd);
        if (!res.ok) {
          setError(res.reason);
          return;
        }
        setAccounts((prev) => sortByName([...prev, { id: res.id, name: res.name }]));
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add account.");
      }
    });
  }

  function handleDelete(account: ExpenseAccount) {
    if (!window.confirm(`Remove "${account.name}"? Existing expenses keep showing this name.`)) {
      return;
    }
    setError(null);
    setRemovingId(account.id);
    startRemove(async () => {
      try {
        await deleteExpenseAccount(account.id);
        setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not remove account.");
      } finally {
        setRemovingId(null);
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Manage cards / accounts"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-3 pb-6 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-6 sm:pb-6 sm:pt-6"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-xl border border-line-strong bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 rounded-t-xl bg-bar px-4 py-3">
          <span className="truncate font-mono text-[12.5px] font-bold uppercase tracking-[0.14em] text-bar-fg">
            Cards / Accounts
          </span>
          <Button type="button" onClick={onClose} disabled={busy} variant="cancel" size="sm">
            Close
          </Button>
        </div>

        <div className="space-y-3 bg-elevated px-4 py-4">
          <p className="text-[12px] leading-snug text-fg-muted">
            Name only — no card numbers. These names populate the expense
            form's Card dropdown.
          </p>

          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              autoComplete="off"
              placeholder="e.g. Amex Business"
              disabled={adding}
              className={field.input}
            />
            <Button
              type="button"
              onClick={handleAdd}
              disabled={adding || !name.trim()}
              variant="primary"
              size="md"
            >
              {adding ? "Adding…" : "Add"}
            </Button>
          </div>

          {error ? (
            <p role="alert" className="text-[12px] font-semibold text-bad">
              {error}
            </p>
          ) : null}

          {accounts.length === 0 ? (
            <div className="rounded-md border border-dashed border-line-strong bg-card px-3 py-5 text-center font-mono text-[11.5px] text-ink-3">
              No cards or accounts yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {accounts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-line bg-card px-3 py-2"
                >
                  <span className="min-w-0 truncate text-[13px] text-fg">{a.name}</span>
                  <Button
                    type="button"
                    onClick={() => handleDelete(a)}
                    disabled={removing && removingId === a.id}
                    variant="destructive"
                    size="sm"
                    className="shrink-0"
                  >
                    {removing && removingId === a.id ? "Removing…" : "Remove"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
