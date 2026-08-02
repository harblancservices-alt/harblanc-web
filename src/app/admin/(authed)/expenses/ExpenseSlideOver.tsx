"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { StatusTag } from "@/components/ui/StatusTag";
import { field } from "@/components/ui/styles";
import { LABEL } from "./formLabel";
import { IconClock, IconReceipt, IconX } from "./icons";
import { createExpense, createExpenseAccount, getExpenseActivity, updateExpense } from "./actions";
import {
  CATEGORIES,
  DAYS_OF_WEEK,
  FREQUENCIES,
  FREQUENCY_LABEL,
  FREQUENCY_TONE,
  chargeScheduleLabel,
  isCategory,
  type ExpenseAccount,
  type ExpenseActivity,
  type ExpenseItem,
  type Frequency,
} from "./types";

const ADD_CARD_VALUE = "__add__";

/** Right-side detail / create slide-over. Replaces the old centered modal —
 *  clicking a row (or "New Expense") opens this panel instead of navigating
 *  anywhere, so the table stays on screen as context. */
export function ExpenseSlideOver({
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

  const [frequency, setFrequency] = useState<Frequency>(expense?.frequency ?? "monthly");
  const [category, setCategory] = useState(expense?.category ?? "");
  const [accounts, setAccounts] = useState<ExpenseAccount[]>(initialAccounts);
  const [selectedCard, setSelectedCard] = useState(expense?.card ?? "");
  const [addingCard, setAddingCard] = useState(false);
  const [newCardName, setNewCardName] = useState("");
  const [addCardPending, startAddCard] = useTransition();
  const [addCardError, setAddCardError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function requestClose() {
    setVisible(false);
    window.setTimeout(onClose, 180);
  }

  function handleAddCard() {
    const trimmed = newCardName.trim();
    if (!trimmed) return;
    setAddCardError(null);
    startAddCard(async () => {
      try {
        const fd = new FormData();
        fd.set("name", trimmed);
        const res = await createExpenseAccount(fd);
        if (!res.ok) {
          setAddCardError(res.reason);
          return;
        }
        setAccounts((prev) =>
          [...prev, { id: res.id, name: trimmed, type: null, last4: null, isDefault: false, monthlySpend: 0, chargeCount: 0 }].sort(
            (a, b) => a.name.localeCompare(b.name),
          ),
        );
        setSelectedCard(trimmed);
        setAddingCard(false);
        setNewCardName("");
      } catch (e) {
        setAddCardError(e instanceof Error ? e.message : "Could not add payment method.");
      }
    });
  }

  const [state, action, pending] = useActionState<
    { ok: boolean; error: string | null },
    FormData
  >(
    async (_prev, fd) => {
      try {
        // Vendor is the identity going forward — mirror it into the legacy
        // `name` column the write path still requires.
        const vendor = String(fd.get("vendor") ?? "").trim();
        if (vendor) fd.set("name", vendor);
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
      if (e.key === "Escape" && !pending) requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const legacyCardOption =
    selectedCard && !accounts.some((a) => a.name === selectedCard) ? selectedCard : null;
  const legacyCategoryOption =
    category && !isCategory(category) ? category : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit expense" : "New expense"}
      className={
        "fixed inset-0 z-50 flex justify-end bg-black/50 transition-opacity duration-150 " +
        (visible ? "opacity-100" : "opacity-0")
      }
      onClick={() => {
        if (!pending) requestClose();
      }}
    >
      <div
        className={
          "flex h-full w-full max-w-md flex-col overflow-hidden border-l border-line-strong bg-card shadow-e3 transition-transform duration-200 sm:max-w-lg " +
          (visible ? "translate-x-0" : "translate-x-full")
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 bg-bar px-4 py-3.5">
          <span className="truncate text-[13px] font-bold uppercase tracking-[0.1em] text-bar-fg">
            {isEdit ? "Edit expense" : "New expense"}
          </span>
          <button
            type="button"
            onClick={requestClose}
            disabled={pending}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-bar-fg/70 transition-colors hover:bg-white/10 hover:text-bar-fg"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <datalist id="expense-category-legacy">
          {legacyCategoryOption ? <option value={legacyCategoryOption} /> : null}
        </datalist>

        <form action={action} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div>
              <label className={LABEL}>
                Vendor<span className="text-bad"> *</span>
              </label>
              <input
                name="vendor"
                defaultValue={expense?.vendor ?? expense?.name ?? ""}
                required
                autoComplete="off"
                placeholder="e.g. Progressive Commercial Auto"
                className={field.input}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL}>
                  Amount<span className="text-bad"> *</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-fg-muted">
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
                <label className={LABEL}>Category</label>
                <select
                  name="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={field.select}
                >
                  <option value="">No category</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  {legacyCategoryOption ? (
                    <option value={legacyCategoryOption}>{legacyCategoryOption} (legacy)</option>
                  ) : null}
                </select>
              </div>
            </div>

            <div>
              <label className={LABEL}>Payment method</label>
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
                  <option value="">No payment method</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                      {a.last4 ? ` ····${a.last4}` : ""}
                    </option>
                  ))}
                  {legacyCardOption ? (
                    <option value={legacyCardOption}>{legacyCardOption} (inactive)</option>
                  ) : null}
                  <option value={ADD_CARD_VALUE}>+ Add payment method…</option>
                </select>
              ) : !addingCard ? (
                <div className="flex h-10 items-center justify-between rounded-md border border-dashed border-line-strong bg-card px-3 text-[12.5px] font-semibold text-fg">
                  No payment methods yet.
                  <button
                    type="button"
                    onClick={() => setAddingCard(true)}
                    className="font-semibold text-accent hover:underline"
                  >
                    + Add
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

            <div>
              <label className={LABEL}>Frequency</label>
              <div className="flex flex-wrap gap-1.5">
                {FREQUENCIES.map((f) => (
                  <label
                    key={f}
                    className={
                      "cursor-pointer rounded-md border px-2.5 py-1.5 text-[12px] font-bold transition-colors " +
                      (frequency === f
                        ? "border-accent bg-accent text-white"
                        : "border-line-strong bg-card text-fg hover:border-accent hover:bg-elevated")
                    }
                  >
                    <input
                      type="radio"
                      name="frequency"
                      value={f}
                      checked={frequency === f}
                      onChange={() => setFrequency(f)}
                      className="sr-only"
                    />
                    {FREQUENCY_LABEL[f]}
                  </label>
                ))}
              </div>
            </div>

            {frequency === "weekly" ? (
              <div>
                <label className={LABEL}>Day of week</label>
                <select
                  name="day_of_week"
                  defaultValue={expense?.dayOfWeek ?? ""}
                  className={field.select}
                >
                  <option value="">No day set</option>
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            ) : frequency === "onetime" ? (
              <div>
                <label className={LABEL}>Start date</label>
                <input
                  name="start_date"
                  type="date"
                  defaultValue={expense?.startDate ?? ""}
                  className={field.input}
                />
              </div>
            ) : (
              <div>
                <label className={LABEL}>Charges on</label>
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
            )}

            {frequency !== "onetime" ? (
              <div>
                <label className={LABEL}>
                  Start date <span className="text-fg-subtle">· optional</span>
                </label>
                <input
                  name="start_date"
                  type="date"
                  defaultValue={expense?.startDate ?? ""}
                  className={field.input}
                />
              </div>
            ) : null}

            {isEdit ? (
              <div className="rounded-md border border-line-strong bg-elevated px-3 py-2.5">
                <div className={LABEL + " mb-1"}>Next charge</div>
                <div className="flex items-center gap-2">
                  <StatusTag tone={FREQUENCY_TONE[frequency]} hideDot>
                    {FREQUENCY_LABEL[frequency]}
                  </StatusTag>
                  <span className="text-[13px] font-bold text-fg">
                    {expense?.nextChargeLabel ?? chargeScheduleLabel(expense!)}
                  </span>
                  {expense?.skipNextDate ? (
                    <span className="text-[11px] font-bold uppercase tracking-wide text-warn">
                      Skipped
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div>
              <label className={LABEL}>
                Tags <span className="text-fg-subtle">· comma-separated</span>
              </label>
              <input
                name="tags"
                defaultValue={expense?.tags?.join(", ") ?? ""}
                autoComplete="off"
                placeholder="e.g. fixed cost, dispatcher"
                className={field.input}
              />
            </div>

            <label className="flex h-10 w-fit items-center gap-2 rounded-md border border-line-strong bg-card px-3 text-[13px] font-bold text-fg">
              <input
                type="checkbox"
                name="autopay"
                defaultChecked={expense?.autopay ?? true}
                className="h-4 w-4 accent-accent"
              />
              Autopay
            </label>

            <div>
              <label className={LABEL}>
                Notes <span className="text-fg-subtle">· optional</span>
              </label>
              <textarea
                name="notes"
                defaultValue={expense?.notes ?? ""}
                rows={2}
                autoComplete="off"
                className={field.textarea + " resize-none"}
              />
            </div>

            <Section title="Attachments" icon={<IconReceipt className="h-3.5 w-3.5" />}>
              <p className="text-[12px] font-medium text-fg-muted">
                No attachments yet. File uploads for receipts are planned for a
                follow-up pass.
              </p>
            </Section>

            {isEdit ? (
              <Section title="Activity history" icon={<IconClock className="h-3.5 w-3.5" />}>
                <ActivityList expenseId={expense!.id} />
              </Section>
            ) : null}

            {state.error ? (
              <p role="alert" className="text-[12px] font-semibold text-bad">
                {state.error}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
            <Button type="button" onClick={requestClose} disabled={pending} variant="cancel">
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

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-line pt-3.5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-fg">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function ActivityList({ expenseId }: { expenseId: string }) {
  const [items, setItems] = useState<ExpenseActivity[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getExpenseActivity(expenseId).then((rows) => {
      if (!cancelled) setItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  if (items == null) {
    return <p className="text-[12px] font-medium text-fg-muted">Loading…</p>;
  }
  if (items.length === 0) {
    return <p className="text-[12px] font-medium text-fg-muted">No activity yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.id} className="text-[12px] leading-snug">
          <span className="font-bold text-fg">{a.action}</span>
          {a.detail ? <span className="text-fg-muted"> — {a.detail}</span> : null}
          <div className="text-[11px] text-fg-subtle">{a.whenLabel}</div>
        </li>
      ))}
    </ul>
  );
}
