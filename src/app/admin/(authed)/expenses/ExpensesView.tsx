"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusTag } from "@/components/ui/StatusTag";
import { DeleteExpenseButton } from "./DeleteExpenseButton";
import { ExpenseAccountsDialog } from "./ExpenseAccountsDialog";
import { ExpenseFormDialog } from "./ExpenseFormDialog";
import { FREQUENCY_LABEL, ordinal, type ExpenseItem, type ExpensesData } from "./types";

export function ExpensesView({ data }: { data: ExpensesData }) {
  const [dialog, setDialog] = useState<"new" | ExpenseItem | null>(null);
  const [cardsOpen, setCardsOpen] = useState(false);

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Payments"
          title="Expenses"
          className="mb-3"
          actions={
            <>
              <Button type="button" onClick={() => setCardsOpen(true)} variant="navigate">
                Manage cards
              </Button>
              <Button type="button" onClick={() => setDialog("new")} variant="primary">
                + Add expense
              </Button>
            </>
          }
        />

        <div className="mb-4 flex items-start gap-2 rounded-md border border-line-strong bg-inset px-3.5 py-2.5">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
          <p className="text-[12px] leading-snug text-fg-muted">
            Manual tracker only — nothing here is linked to a bank or card and
            no money moves. It's a hand-kept log of what charges each month.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Kpi label="Monthly recurring" value={usd(data.monthlyTotal)} tone="red" />
          <Kpi label="Annualized" value={usd(data.annualTotal)} tone="muted" />
          <Breakdown title="By category" items={data.byCategory} />
          <Breakdown title="By card" items={data.byCard} />
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-fg-muted">
              Recurring charges
            </span>
            <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
              · {data.expenses.length}
            </span>
          </div>

          {data.expenses.length === 0 ? (
            <div className="rounded-md border border-dashed border-line-strong bg-card px-4 py-8 text-center font-mono text-[12px] text-ink-3 shadow-e1">
              No recurring expenses logged yet.
            </div>
          ) : (
            <div className="space-y-2">
              {data.expenses.map((e) => (
                <ExpenseCard key={e.id} expense={e} onEdit={() => setDialog(e)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {dialog ? (
        <ExpenseFormDialog
          expense={dialog === "new" ? null : dialog}
          accounts={data.accounts}
          onClose={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      ) : null}

      {cardsOpen ? (
        <ExpenseAccountsDialog accounts={data.accounts} onClose={() => setCardsOpen(false)} />
      ) : null}
    </div>
  );
}

function ExpenseCard({
  expense: e,
  onEdit,
}: {
  expense: ExpenseItem;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-md border border-line bg-card p-3.5 shadow-e1 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[15px] font-semibold text-fg">{e.name}</span>
            {e.category ? (
              <StatusTag tone="slate" hideDot>
                {e.category}
              </StatusTag>
            ) : null}
            <StatusTag tone={e.autopay ? "green" : "amber"} hideDot>
              {e.autopay ? "Autopay" : "Manual"}
            </StatusTag>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-fg-subtle">
            <span>
              {e.dayOfMonth != null
                ? `Charges on the ${ordinal(e.dayOfMonth)}`
                : "No charge date set"}
            </span>
            <span>· {FREQUENCY_LABEL[e.frequency]}</span>
            {e.card ? <span>· {e.card}</span> : null}
            {e.vendor ? <span>· {e.vendor}</span> : null}
          </div>
          {e.notes ? (
            <p className="mt-1.5 text-[12px] text-fg-subtle">{e.notes}</p>
          ) : null}
        </div>

        <div className="ml-auto shrink-0 text-right">
          <div className="font-mono text-[18px] font-bold tabular-nums text-fg">
            {usdCents(e.amount)}
          </div>
          <div className="text-[10.5px] text-fg-subtle">
            {e.frequency !== "monthly" ? `${usdCents(e.monthlyAmount)}/mo` : " "}
          </div>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2 border-t border-line pt-2.5">
        <Button type="button" onClick={onEdit} variant="edit" size="sm">
          Edit
        </Button>
        <DeleteExpenseButton id={e.id} name={e.name} />
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "red" | "muted";
}) {
  return (
    <div className="rounded-md border border-line bg-card px-3.5 py-2.5 shadow-e2">
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </div>
      <div
        className={
          "mt-1 text-[22px] font-bold tabular-nums leading-none " +
          (tone === "red" ? "text-accent" : "text-fg")
        }
      >
        {value}
      </div>
    </div>
  );
}

function Breakdown({
  title,
  items,
}: {
  title: string;
  items: ReadonlyArray<{ label: string; total: number }>;
}) {
  return (
    <div className="rounded-md border border-line bg-card px-3.5 py-2.5 shadow-e2">
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="mt-1.5 text-[12px] text-fg-subtle">—</div>
      ) : (
        <div className="mt-1.5 space-y-0.5">
          {items.slice(0, 4).map((it) => (
            <div key={it.label} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-fg-muted">{it.label}</span>
              <span className="shrink-0 font-mono tabular-nums text-fg">
                {usd(it.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8v.01" />
    </svg>
  );
}

function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function usdCents(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
