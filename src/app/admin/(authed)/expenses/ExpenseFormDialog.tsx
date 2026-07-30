"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { field } from "@/components/ui/styles";
import { createExpense, createExpenseAccount, updateExpense } from "./actions";
import {
  CATEGORY_PRESETS,
  FREQUENCIES,
  FREQUENCY_LABEL,
  type ExpenseAccount,
  type ExpenseItem,
} from "./types";

const ADD_CARD_VALUE = "__add__";

/** Add / edit dialog for a recurring expense. */
export function ExpenseFormDialog({
  expense,
  accounts: initialAccounts,
  onClose,
  onSaved,
}: {
  expense?: ExpenseItem | null;
  accounts: ExpenseAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!expense;

  const [accounts, setAccounts] = useState<ExpenseAccount[]>(initialAccounts);
  const [selectedCard, setSelectedCard] = useState(expense?.card ?? "");
  const [addingCard, setAddingCard] = useState(accounts.length === 0);
  const [newCardName, setNewCardName] = useState("");
  const [addCardPending, startAddCard] = useTransition();
  const [addCardError, setAddCardError] = useState<string | null>(null);

  function handleAddCard() {
    const trimmed = newCardName.trim();
    if (!trimmed) return;
    setAddCardError(null);
    startAddCard(async () => {
      const fd = new FormData();
      fd.set("name", trimmed);
      const res = await createExpenseAccount(fd);
      if (!res.ok) {
        setAddCardError(res.reason);
        return;
      }
      setAccounts((prev) =>
        [...prev, { id: res.id, name: res.name }].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setSelectedCard(res.name);
      setAddingCard(false);
      setNewCardName("");
    });
  }

  const [state, action, pending] = useActionState<
    { ok: boolean; error: string | null },
    FormData
  >(
    async (_prev, fd) => {
      try {
        if (expense) await updateExpense(expense.id, fd);
        else await createExpense(fd);
        return { ok: true, error: null };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Could not save expense.",
        };
      }
    },
    { ok: false, error: null },
  );

  useEffect(() => {
    if (state.ok) onSaved();
  }, [state.ok, onSaved]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, onClose]);

  // The expense's saved card may belong to an account that's since been
  // removed from the manager — keep it selectable (labeled inactive) rather
  // than silently dropping it the moment this form is opened.
  const legacyCardOption =
    selectedCard && !accounts.some((a) => a.name === selectedCard)
      ? selectedCard
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit expense" : "Add expense"}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-3 pb-6 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-6 sm:pb-6 sm:pt-6"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-line-strong bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 rounded-t-xl bg-bar px-4 py-3">
          <span className="truncate font-mono text-[12.5px] font-bold uppercase tracking-[0.14em] text-bar-fg">
            {isEdit ? "Edit expense" : "Add expense"}
          </span>
          <Button type="button" onClick={onClose} disabled={pending} variant="cancel" size="sm">
            Cancel
          </Button>
        </div>

        <datalist id="expense-category-presets">
          {CATEGORY_PRESETS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <form action={action}>
          <div className="space-y-3 bg-elevated px-4 py-4">
            <div>
              <label className={field.label}>
                Name<span className="text-bad"> *</span>
              </label>
              <input
                name="name"
                defaultValue={expense?.name ?? ""}
                required
                autoComplete="off"
                placeholder="e.g. Progressive Commercial Auto"
                className={field.input}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={field.label}>
                  Amount<span className="text-bad"> *</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-3">
                    $
                  </span>
                  <input
                    name="amount"
                    defaultValue={expense?.amount != null ? String(expense.amount) : ""}
                    inputMode="decimal"
                    required
                    autoComplete="off"
                    placeholder="0.00"
                    className={field.input + " pl-6 tabular-nums"}
                  />
                </div>
              </div>
              <div>
                <label className={field.label}>Frequency</label>
                <select
                  name="frequency"
                  defaultValue={expense?.frequency ?? "monthly"}
                  className={field.select}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCY_LABEL[f]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={field.label}>Category</label>
                <input
                  name="category"
                  list="expense-category-presets"
                  defaultValue={expense?.category ?? ""}
                  autoComplete="off"
                  placeholder="e.g. Insurance"
                  className={field.input}
                />
              </div>
              <div>
                <label className={field.label}>Charges on</label>
                <input
                  name="day_of_month"
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={expense?.dayOfMonth ?? ""}
                  autoComplete="off"
                  placeholder="Day (1–31)"
                  className={field.input + " tabular-nums"}
                />
              </div>
            </div>

            <div>
              <label className={field.label}>
                Vendor <span className="text-ink-3">· optional</span>
              </label>
              <input
                name="vendor"
                defaultValue={expense?.vendor ?? ""}
                autoComplete="off"
                placeholder="e.g. Progressive"
                className={field.input}
              />
            </div>

            <div>
              <label className={field.label}>
                Card <span className="text-ink-3">· optional</span>
              </label>

              {accounts.length > 0 ? (
                <select
                  name="card"
                  value={selectedCard}
                  onChange={(e) => {
                    if (e.target.value === ADD_CARD_VALUE) {
                      setAddingCard(true);
                      return;
                    }
                    setSelectedCard(e.target.value);
                  }}
                  className={field.select}
                >
                  <option value="">No card</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                  {legacyCardOption ? (
                    <option value={legacyCardOption}>{legacyCardOption} (inactive)</option>
                  ) : null}
                  <option value={ADD_CARD_VALUE}>+ Add new card…</option>
                </select>
              ) : !addingCard ? (
                <div className="flex h-10 items-center justify-between rounded-md border border-dashed border-line-strong bg-card px-3 text-[12.5px] text-fg-subtle">
                  No cards yet.
                  <button
                    type="button"
                    onClick={() => setAddingCard(true)}
                    className="font-semibold text-accent hover:underline"
                  >
                    + Add a card
                  </button>
                </div>
              ) : null}

              {addingCard ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    value={newCardName}
                    onChange={(e) => setNewCardName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCard();
                      }
                    }}
                    autoComplete="off"
                    placeholder="e.g. Amex Business"
                    disabled={addCardPending}
                    className={field.input}
                  />
                  <Button
                    type="button"
                    onClick={handleAddCard}
                    disabled={addCardPending || !newCardName.trim()}
                    variant="primary"
                    size="md"
                  >
                    {addCardPending ? "Adding…" : "Add"}
                  </Button>
                  {accounts.length > 0 ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setAddingCard(false);
                        setNewCardName("");
                      }}
                      variant="cancel"
                      size="md"
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {addCardError ? (
                <p role="alert" className="mt-1 text-[12px] font-semibold text-bad">
                  {addCardError}
                </p>
              ) : null}
            </div>

            <label className="flex h-10 w-fit items-center gap-2 rounded-md border border-line-strong bg-card px-3 text-[13px] font-semibold text-ink">
              <input
                type="checkbox"
                name="autopay"
                defaultChecked={expense?.autopay ?? true}
                className="h-4 w-4 accent-accent"
              />
              Autopay
            </label>

            <div>
              <label className={field.label}>
                Notes <span className="text-ink-3">· optional</span>
              </label>
              <textarea
                name="notes"
                defaultValue={expense?.notes ?? ""}
                rows={2}
                autoComplete="off"
                className={field.textarea + " resize-none"}
              />
            </div>

            {state.error ? (
              <p role="alert" className="text-[12px] font-semibold text-bad">
                {state.error}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
            <Button type="button" onClick={onClose} disabled={pending} variant="cancel">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              variant="primary"
              leftIcon={
                pending ? (
                  <span
                    aria-hidden
                    className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                ) : undefined
              }
            >
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add expense"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
